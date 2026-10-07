import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ACCESS_CHANGED_EVENT, api, ApiError, SESSION_PATH, UNAUTHORIZED_EVENT } from "./api";
import type { Me, Membership, MeResponse } from "./types";

/**
 * "twofactor" é o login pela metade: a senha foi aceita e falta o código do segundo fator.
 * Nesse estado a API não devolve nenhum dado da conta, então `me` continua nulo.
 */
type Status = "loading" | "anonymous" | "twofactor" | "authenticated";

interface Snapshot {
  status: Status;
  me: Me | null;
}

interface SessionValue {
  status: Status;
  /** Só existe com o login completo (status "authenticated"). */
  me: Me | null;
  /** Organização selecionada no seletor da barra lateral. */
  membership: Membership | null;
  selectOrganization: (organizationId: string) => void;
  /** Busca de novo os dados de quem está logado. Devolve o resultado para quem precisa decidir a próxima tela. */
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const ORG_KEY = "vq_organizacao";
const INVITE_KEY = "vq_convite_pendente";
const SIGNAL_KEY = "vq_sessao_mudou";

const LOADING: Snapshot = { status: "loading", me: null };
const ANONYMOUS: Snapshot = { status: "anonymous", me: null };
const TWO_FACTOR: Snapshot = { status: "twofactor", me: null };

/** Ao voltar para a aba, a sessão é conferida de novo no máximo uma vez a cada 30 segundos. */
const FOCUS_GAP_MS = 30_000;
/** Vários erros de permissão seguidos (uma tela faz mais de uma chamada) viram uma conferência só. */
const ACCESS_GAP_MS = 1_000;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Armazenamento indisponível (aba privada, por exemplo). O painel segue funcionando sem lembrar a escolha.
  }
}

/* ---------- Convite esperando o login ---------- */

/** Só aceita o endereço de um convite: /convite/<token em base64url>. Nada que saia do painel. */
const INVITE_PATH = /^\/convite\/[A-Za-z0-9_-]{16,128}$/;
/** Mesmo prazo de validade de um convite. */
const INVITE_TTL_MS = 7 * 24 * 3_600_000;

function readInvite(): { path: string; email: string } | null {
  const raw = readStored(INVITE_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { path, email, expiresAt } = value as Record<string, unknown>;
    if (typeof path !== "string" || !INVITE_PATH.test(path)) return null;
    if (typeof email !== "string" || typeof expiresAt !== "number" || expiresAt <= Date.now()) return null;
    return { path, email };
  } catch {
    return null;
  }
}

/**
 * Convite aberto por quem ainda precisa entrar, criar a conta ou confirmar o e-mail.
 * Fica no localStorage para valer também na aba aberta pelo link de confirmação de e-mail.
 * É apagado quando a pessoa chega ao convite já logada, quando aceita, quando dispensa e quando sai.
 */
export const pendingInvite = {
  save(token: string, email: string, inviteExpiresAt?: string): void {
    const path = `/convite/${token}`;
    if (!INVITE_PATH.test(path)) return;
    const inviteEnd = inviteExpiresAt ? new Date(inviteExpiresAt).getTime() : Number.NaN;
    const limit = Date.now() + INVITE_TTL_MS;
    const expiresAt = Number.isFinite(inviteEnd) ? Math.min(inviteEnd, limit) : limit;
    writeStored(INVITE_KEY, JSON.stringify({ path, email: email.trim().toLowerCase(), expiresAt }));
  },
  /** Endereço do convite guardado, se ele foi enviado para o e-mail de quem está logado. */
  peek(email: string): string | null {
    const stored = readInvite();
    return stored && stored.email === email.trim().toLowerCase() ? stored.path : null;
  },
  /** Apaga o convite guardado. Com um endereço, só apaga se for esse o convite guardado. */
  clear(onlyPath?: string): void {
    if (onlyPath && readInvite()?.path !== onlyPath) return;
    writeStored(INVITE_KEY, null);
  },
};

/** Endereço interno que a pessoa tentou abrir antes de entrar. Vem do estado da navegação, nunca da URL. */
export function returnTo(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return null;
  const from = (state as { from?: unknown }).from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : null;
}

/** Para onde vai quem acabou de entrar: o endereço que tentou abrir vem antes do convite que ficou esperando. */
export function landingPath(state: unknown, email: string): string {
  return returnTo(state) ?? pendingInvite.peek(email) ?? "/";
}

/* ---------- Sessão ---------- */

function isSignedIn(data: MeResponse): data is Me {
  // Os dados da conta só vêm com o login completo. A flag é conferida também, por garantia.
  const pending: boolean = data.session.twoFactorPending;
  return data.user !== null && !pending;
}

/**
 * Reaproveita os objetos anteriores quando os dados novos são iguais.
 * Assim uma conferência silenciosa que não mudou nada não renderiza o painel nem dispara efeitos de novo.
 */
function share<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (typeof previous !== "object" || typeof next !== "object" || previous === null || next === null) return next;
  if (Array.isArray(previous) || Array.isArray(next)) {
    if (!Array.isArray(previous) || !Array.isArray(next)) return next;
    const items: unknown[] = next.map((item: unknown, index: number) => share<unknown>(previous[index], item));
    const same = previous.length === items.length && items.every((item, index) => item === previous[index]);
    return same ? previous : (items as T);
  }
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  const merged: Record<string, unknown> = {};
  let same = Object.keys(before).length === keys.length;
  for (const key of keys) {
    merged[key] = share(before[key], after[key]);
    if (!(key in before) || merged[key] !== before[key]) same = false;
  }
  return same ? previous : (merged as T);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(LOADING);
  const [organizationId, setOrganizationId] = useState<string | null>(() => readStored(ORG_KEY));

  // Controle das chamadas a /auth/me. Fica em refs porque não precisa renderizar nada.
  const issued = useRef(0);
  const applied = useRef(0);
  const lastRefreshAt = useRef(0);
  const known = useRef<{ status: Status; userId: string | null }>({ status: "loading", userId: null });

  const commit = useCallback((next: Snapshot) => {
    const previous = known.current;
    const userId = next.me?.user.id ?? null;
    known.current = { status: next.status, userId };
    // Entrar, sair ou concluir o segundo fator muda o cookie de todas as abas: as outras conferem a sessão na hora.
    if (previous.status !== "loading" && (previous.status !== next.status || previous.userId !== userId)) writeStored(SIGNAL_KEY, String(Date.now()));
    setSnapshot((current) => share(current, next));
  }, []);

  /** Descarta a resposta de qualquer /auth/me que ainda esteja a caminho. */
  const dropPending = useCallback(() => {
    issued.current += 1;
    applied.current = issued.current;
  }, []);

  const refresh = useCallback(async (): Promise<Me | null> => {
    issued.current += 1;
    const ticket = issued.current;
    lastRefreshAt.current = Date.now();

    let next: Snapshot;
    try {
      const data = await api.get<MeResponse>(SESSION_PATH);
      next = isSignedIn(data) ? { status: "authenticated", me: data } : TWO_FACTOR;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        // Falha de rede ou do servidor: não derruba uma sessão que já estava carregada.
        if (known.current.status === "loading") commit(ANONYMOUS);
        return null;
      }
      next = ANONYMOUS;
    }

    // Uma resposta mais nova (ou uma saída) já foi aplicada: esta chegou atrasada.
    if (ticket < applied.current) return next.me;
    applied.current = ticket;

    const previousUserId = known.current.userId;
    if (previousUserId && next.me && next.me.user.id !== previousUserId) {
      // Outra conta entrou neste navegador (em outra aba, por exemplo). Recarrega para que nada
      // digitado na conta anterior seja salvo com o cookie da conta nova.
      window.location.reload();
      return new Promise<never>(() => undefined);
    }

    commit(next);
    return next.me;
  }, [commit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      dropPending();
      commit(ANONYMOUS);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [commit, dropPending]);

  // Conferência silenciosa: ao voltar para a aba, quando a API nega um acesso que o painel achava
  // que existia e quando outra aba entra ou sai. Não mostra carregamento, e falha de rede é ignorada.
  useEffect(() => {
    let scheduled: number | undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshAt.current >= FOCUS_GAP_MS) void refresh();
    };
    // A negativa pode ser mais nova que a última conferência: em vez de descartar o aviso, a conferência
    // é marcada para logo depois do intervalo mínimo, e os avisos seguintes aproveitam a mesma marcação.
    const onAccessChanged = () => {
      if (scheduled !== undefined) return;
      const wait = Math.max(0, lastRefreshAt.current + ACCESS_GAP_MS - Date.now());
      scheduled = window.setTimeout(() => {
        scheduled = undefined;
        void refresh();
      }, wait);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SIGNAL_KEY) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(ACCESS_CHANGED_EVENT, onAccessChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      if (scheduled !== undefined) window.clearTimeout(scheduled);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(ACCESS_CHANGED_EVENT, onAccessChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const selectOrganization = useCallback((id: string) => {
    setOrganizationId(id);
    writeStored(ORG_KEY, id);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Mesmo que a chamada falhe, a tela volta para o login.
    }
    // O convite que estava esperando era de quem saiu; a próxima pessoa a entrar neste navegador não herda.
    pendingInvite.clear();
    dropPending();
    commit(ANONYMOUS);
  }, [commit, dropPending]);

  const { status, me } = snapshot;

  const membership = useMemo(() => {
    if (!me?.memberships.length) return null;
    return me.memberships.find((m) => m.organization.id === organizationId) ?? me.memberships[0];
  }, [me, organizationId]);

  const value = useMemo<SessionValue>(() => ({ status, me, membership, selectOrganization, refresh, logout }), [status, me, membership, selectOrganization, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession precisa estar dentro de SessionProvider.");
  return value;
}

/** Para telas que só existem com alguém logado e uma organização escolhida. */
export function useWorkspace(): { me: Me; membership: Membership } {
  const { me, membership } = useSession();
  if (!me || !membership) throw new Error("useWorkspace usado fora do painel.");
  return { me, membership };
}
