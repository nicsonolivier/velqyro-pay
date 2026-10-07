import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Clock3, Inbox, LockKeyhole, Mail, MailCheck, RefreshCw, UserPlus } from "lucide-react";
import { passwordIssues, ROLE_DESCRIPTION, ROLE_LABEL } from "@velqyro/shared";
import type { Role } from "@velqyro/shared";
import { AuthLayout, PasswordMeter } from "../Auth";
import { Alert, EmptyState, Spinner, SubmitButton, useToast } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { pendingInvite, useSession } from "../lib/session";
import type { OutboxMessage } from "../lib/types";

/** Página de um módulo que ainda não foi construído. Diz em que etapa ele entra. */
export function ComingSoon({ title, stage, text }: { title: string; stage: string; text: string }) {
  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">EM CONSTRUÇÃO</p>
          <h1>{title}</h1>
          <p className="muted">{text}</p>
        </div>
      </header>
      <article className="panel">
        <EmptyState icon={<Clock3 size={28} />} title={`Chega na ${stage}`} text="Esta área já tem lugar no menu e nas permissões, mas ainda não tem telas." />
      </article>
    </section>
  );
}

export function NoPermission({ role }: { role: Role }) {
  return (
    <section>
      <article className="panel">
        <EmptyState
          icon={<LockKeyhole size={28} />}
          title="Sem permissão"
          text={`O papel ${ROLE_LABEL[role]} não acessa esta área. Peça acesso a um proprietário ou administrador.`}
          action={
            <Link className="ghost-button" to="/">
              Voltar à visão geral
            </Link>
          }
        />
      </article>
    </section>
  );
}

export function NotFound() {
  return (
    <main className="center-screen">
      <div className="center-card">
        <h1>Página não encontrada</h1>
        <p className="muted">O endereço não existe ou mudou de lugar.</p>
        <Link className="primary-action" to="/">
          Ir para o início
        </Link>
      </div>
    </main>
  );
}

/* ---------- Confirmação de e-mail ---------- */

/** Tela de espera para quem criou a conta e ainda não clicou no link do e-mail. */
export function ConfirmEmailNotice() {
  const { me, refresh, logout } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await api.post("/auth/email/resend");
      toast("Enviamos um novo link de confirmação");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    const fresh = await refresh();
    if (fresh?.user.emailVerified) navigate("/", { replace: true });
    else toast("O e-mail ainda não foi confirmado. Clique no link que enviamos.", "error");
  }

  return (
    <AuthLayout>
      <span className="eyebrow">PASSO 1 DE 2</span>
      <h2>Confirme seu e-mail</h2>
      <p className="muted">
        Enviamos um link para <strong>{me?.user.email}</strong>. Ele vale por 24 horas.
      </p>
      <div className="auth-form">
        <button className="primary-button" onClick={check}>
          Já confirmei
        </button>
        <button className="ghost-button" onClick={resend} disabled={busy}>
          <RefreshCw size={14} /> {busy ? "Enviando..." : "Reenviar o link"}
        </button>
        {import.meta.env.DEV && (
          <Alert kind="info">
            Em desenvolvimento nenhum e-mail sai de verdade. Abra a <Link to="/dev/caixa-de-saida">caixa de saída</Link> e clique no link da mensagem.
          </Alert>
        )}
      </div>
      <div className="auth-switch">
        Não é você?
        <button
          onClick={async () => {
            await logout();
            navigate("/entrar", { replace: true });
          }}
        >
          Sair
        </button>
      </div>
    </AuthLayout>
  );
}

/** Destino do link enviado por e-mail. Funciona mesmo em outro navegador, sem sessão. */
export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { refresh } = useSession();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");
  const [logged, setLogged] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // O link só vale uma vez, então a chamada não pode repetir (o modo estrito do React roda efeitos duas vezes em desenvolvimento).
    if (started.current) return;
    started.current = true;
    api
      .post("/auth/email/verify", { token })
      .then(async () => {
        const fresh = await refresh();
        setLogged(Boolean(fresh));
        setState("done");
      })
      .catch((e) => {
        setMessage(errorMessage(e));
        setState("error");
      });
  }, [token, refresh]);

  return (
    <AuthLayout>
      <span className="eyebrow">CONFIRMAÇÃO DE E-MAIL</span>
      {state === "working" && (
        <>
          <h2>Confirmando...</h2>
          <Spinner />
        </>
      )}
      {state === "done" && (
        <>
          <h2>E-mail confirmado</h2>
          <div className="success-box">
            <MailCheck size={22} />
            <div>
              <strong>Tudo certo.</strong>
              <p>{logged ? "Agora falta só contar sobre o seu negócio." : "Entre na sua conta para continuar."}</p>
            </div>
          </div>
          <div className="auth-form">
            <Link className="primary-button as-link" to={logged ? "/" : "/entrar"}>
              {logged ? "Continuar" : "Entrar"}
            </Link>
          </div>
        </>
      )}
      {state === "error" && (
        <>
          <h2>Não deu para confirmar</h2>
          <div className="auth-form">
            <Alert kind="error">{message}</Alert>
            <Link className="ghost-button as-link" to="/entrar">
              Ir para o login
            </Link>
          </div>
        </>
      )}
    </AuthLayout>
  );
}

/* ---------- Redefinição de senha ---------- */

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { refresh } = useSession();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const e: Record<string, string> = {};
    const issues = passwordIssues(password);
    if (issues.length) e.password = issues[0];
    if (password !== again) e.again = "As senhas não são iguais.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.post("/auth/password/reset", { token, password });
      // A API encerrou todas as sessões da conta, inclusive a deste navegador, se havia uma.
      await refresh();
      setDone(true);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout>
        <span className="eyebrow">RECUPERAR ACESSO</span>
        <h2>Link inválido</h2>
        <p className="muted">Este endereço não traz um link de redefinição. Peça um novo.</p>
        <div className="auth-form">
          <Link className="primary-button as-link" to="/recuperar-senha">
            Pedir novo link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <span className="eyebrow">RECUPERAR ACESSO</span>
      <h2>{done ? "Senha alterada" : "Crie uma nova senha"}</h2>
      {done ? (
        <>
          <div className="success-box">
            <LockKeyhole size={22} />
            <div>
              <strong>Sua senha foi trocada.</strong>
              <p>As sessões que estavam abertas foram encerradas. Entre de novo com a senha nova.</p>
            </div>
          </div>
          <div className="auth-form">
            <Link className="primary-button as-link" to="/entrar">
              Entrar
            </Link>
          </div>
        </>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          {formError && <Alert kind="error">{formError}</Alert>}
          <label>
            Nova senha
            <div className="input-shell">
              <LockKeyhole size={17} />
              <input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
            {errors.password ? <span className="field-error">{errors.password}</span> : <PasswordMeter value={password} />}
          </label>
          <label>
            Repita a nova senha
            <div className="input-shell">
              <LockKeyhole size={17} />
              <input id="reset-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
            </div>
            {errors.again && <span className="field-error">{errors.again}</span>}
          </label>
          <SubmitButton busy={busy}>Salvar nova senha</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}

/* ---------- Aceite de convite ---------- */

interface InvitePreview {
  organizationName: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export function AcceptInvite() {
  const { token = "" } = useParams();
  // Cada convite tem a sua tela: abrir outro link não reaproveita o que foi carregado para o anterior.
  return <InviteScreen key={token} token={token} />;
}

function InviteScreen({ token }: { token: string }) {
  const navigate = useNavigate();
  const { status, me, refresh, selectOrganization, logout } = useSession();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invitePath = `/convite/${token}`;
  const apiPath = `/invitations/${encodeURIComponent(token)}`;
  /** Login completo e e-mail confirmado: a pessoa já pode responder ao convite nesta tela. */
  const canAnswer = status === "authenticated" && Boolean(me?.user.emailVerified);

  useEffect(() => {
    let current = true;
    api
      .get<InvitePreview>(apiPath)
      .then((data) => {
        if (current) setPreview(data);
      })
      .catch((e) => {
        if (!current) return;
        // Convite que não vale mais não deve trazer ninguém de volta para cá.
        if (e instanceof ApiError && e.status === 404) pendingInvite.clear(invitePath);
        setError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, [apiPath, invitePath]);

  // Quem ainda vai entrar, criar a conta ou confirmar o e-mail volta para este convite depois.
  // Quem já chegou aqui pronto para responder não precisa mais do atalho: ele vale para um redirecionamento só.
  useEffect(() => {
    if (status === "loading") return;
    if (canAnswer) pendingInvite.clear();
    else if (preview) pendingInvite.save(token, preview.email, preview.expiresAt);
  }, [status, canAnswer, preview, token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ organizationId: string }>(`${apiPath}/accept`);
      pendingInvite.clear();
      await refresh();
      selectOrganization(res.organizationId);
      navigate("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const wrongAccount = Boolean(me && preview && me.user.email.toLowerCase() !== preview.email.toLowerCase());
  const hasOrganization = Boolean(me?.memberships.length);
  // Saída para quem não quer responder agora: sem ela, quem não tem organização ficaria preso nesta tela.
  const wayOut = (
    <Link className="ghost-button as-link" to={hasOrganization ? "/" : "/configuracao-inicial"} onClick={() => pendingInvite.clear()}>
      {hasOrganization ? "Voltar ao painel" : "Criar minha própria organização"}
    </Link>
  );

  return (
    <AuthLayout>
      <span className="eyebrow">CONVITE</span>
      {!preview && !error && <Spinner />}
      {error && !preview && (
        <>
          <h2>Convite indisponível</h2>
          <div className="auth-form">
            <Alert kind="error">{error}</Alert>
            <Link className="ghost-button as-link" to="/">
              Ir para o início
            </Link>
          </div>
        </>
      )}
      {preview && (
        <>
          <h2>Entrar na equipe de {preview.organizationName}</h2>
          <p className="muted">
            Convite enviado para <strong>{preview.email}</strong>, com o papel <strong>{ROLE_LABEL[preview.role]}</strong>. {ROLE_DESCRIPTION[preview.role]}
          </p>
          <div className="auth-form">
            {error && <Alert kind="error">{error}</Alert>}
            {status === "loading" && <Spinner />}
            {status === "anonymous" && (
              <>
                <Link className="primary-button as-link" to="/entrar" state={{ from: invitePath }}>
                  Entrar para aceitar
                </Link>
                <Link className="ghost-button as-link" to="/criar-conta">
                  <UserPlus size={14} /> Criar conta com {preview.email}
                </Link>
              </>
            )}
            {status === "twofactor" && (
              <>
                <Alert kind="warning">Falta o código da verificação em duas etapas para concluir o seu login.</Alert>
                <Link className="primary-button as-link" to="/entrar/verificacao" state={{ from: invitePath }}>
                  Concluir a verificação
                </Link>
              </>
            )}
            {status === "authenticated" && me && !me.user.emailVerified && (
              <>
                <Alert kind="warning">Confirme seu e-mail antes de aceitar o convite.</Alert>
                <Link className="primary-button as-link" to="/confirmar-email">
                  Confirmar e-mail
                </Link>
              </>
            )}
            {status === "authenticated" && me?.user.emailVerified && wrongAccount && (
              <>
                <Alert kind="warning">
                  Você entrou como {me.user.email}, mas o convite é para {preview.email}.
                </Alert>
                <button
                  className="primary-button"
                  onClick={async () => {
                    await logout();
                    // Volta para este convite depois de entrar com a conta certa.
                    navigate("/entrar", { replace: true, state: { from: invitePath } });
                  }}
                >
                  Sair e entrar com a outra conta
                </button>
                {wayOut}
              </>
            )}
            {status === "authenticated" && me?.user.emailVerified && !wrongAccount && (
              <>
                <button className="primary-button" onClick={accept} disabled={busy}>
                  {busy ? "Aguarde..." : "Aceitar convite"}
                </button>
                {wayOut}
              </>
            )}
          </div>
        </>
      )}
    </AuthLayout>
  );
}

/* ---------- Caixa de saída de desenvolvimento ---------- */

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export function DevOutbox() {
  const [messages, setMessages] = useState<OutboxMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A API só expõe a caixa de saída quando roda com DEV_OUTBOX=true; sem isso, responde 404. */
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ messages: OutboxMessage[] }>("/dev/outbox")
      .then((r) => {
        setMessages(r.messages);
        setError(null);
        setDisabled(false);
      })
      .catch((e) => {
        const off = e instanceof ApiError && e.status === 404;
        setDisabled(off);
        setError(off ? null : errorMessage(e));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="outbox-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DESENVOLVIMENTO</p>
          <h1>Caixa de saída</h1>
          <p className="muted">E-mails e SMS que a plataforma enviaria. Nada sai de verdade neste ambiente, e esta página não existe em produção.</p>
        </div>
        <div className="builder-actions">
          <button className="ghost-button action-inline" onClick={load}>
            <RefreshCw size={14} /> Atualizar
          </button>
          <Link className="ghost-button" to="/">
            Voltar ao painel
          </Link>
        </div>
      </header>
      {disabled && (
        <Alert kind="warning">
          A caixa de saída está desligada nesta API. Ative <code>DEV_OUTBOX=true</code> no <code>apps/api/.env</code>, reinicie a API e clique em Atualizar.
        </Alert>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {!messages && !error && !disabled && <Spinner />}
      {messages?.length === 0 && (
        <article className="panel">
          <EmptyState icon={<Inbox size={28} />} title="Nenhuma mensagem ainda" text="Crie uma conta, peça uma recuperação de senha ou envie um convite para ver as mensagens aqui." />
        </article>
      )}
      {messages?.map((m) => (
        <article className="panel outbox-message" key={m.id}>
          <div className="panel-head">
            <div>
              <p className="eyebrow">
                {m.channel === "EMAIL" ? "E-MAIL" : "SMS"} · {formatDateTime(m.createdAt)}
              </p>
              <h2>{m.subject}</h2>
              <p className="muted">
                <Mail size={12} /> Para {m.recipient}
              </p>
            </div>
          </div>
          <pre>
            {m.body.split(URL_PATTERN).map((part, i) =>
              /^https?:\/\//.test(part) ? (
                <a key={i} href={new URL(part).pathname + new URL(part).search}>
                  {part}
                </a>
              ) : (
                part
              ),
            )}
          </pre>
        </article>
      ))}
    </main>
  );
}
