import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, UNAUTHORIZED_EVENT } from "./api";
import type { Me, Membership } from "./types";

type Status = "loading" | "anonymous" | "authenticated";

interface SessionValue {
  status: Status;
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
const RETURN_KEY = "vq_voltar_para";

function readStored(key: string, storage: Storage): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null, storage: Storage): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Armazenamento indisponível (aba privada, por exemplo). O painel segue funcionando sem lembrar a escolha.
  }
}

/** Guarda para onde voltar depois de entrar ou criar a conta (usado pelos convites). */
export const returnPath = {
  set: (path: string) => writeStored(RETURN_KEY, path, window.sessionStorage),
  peek: () => readStored(RETURN_KEY, window.sessionStorage),
  clear: () => writeStored(RETURN_KEY, null, window.sessionStorage),
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(() => readStored(ORG_KEY, window.localStorage));

  const refresh = useCallback(async (): Promise<Me | null> => {
    try {
      const data = await api.get<Me>("/auth/me");
      setMe(data);
      setStatus("authenticated");
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setMe(null);
        setStatus("anonymous");
        return null;
      }
      // Falha de rede ou do servidor: não derruba uma sessão que já estava carregada.
      setStatus((current) => (current === "loading" ? "anonymous" : current));
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      setMe(null);
      setStatus("anonymous");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const selectOrganization = useCallback((id: string) => {
    setOrganizationId(id);
    writeStored(ORG_KEY, id, window.localStorage);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Mesmo que a chamada falhe, a tela volta para o login.
    }
    setMe(null);
    setStatus("anonymous");
  }, []);

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
