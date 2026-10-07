import { FormEvent, ReactNode, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Check, Eye, EyeOff, KeyRound, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import {
  formatCnpj,
  formatCpf,
  formatDocument,
  formatPhoneBR,
  isValidDocument,
  isValidEmail,
  isValidPhoneBR,
  ORGANIZATION_TYPE_LABEL,
  ORGANIZATION_TYPES,
  passwordIssues,
  passwordStrength,
  PASSWORD_STRENGTH_LABEL,
  SEGMENT_LABEL,
  SEGMENTS,
} from "@velqyro/shared";
import type { OrganizationType, Segment } from "@velqyro/shared";
import { Alert, SubmitButton } from "./components/ui";
import { api, ApiError, errorMessage, fieldErrors } from "./lib/api";
import { returnTo, useSession } from "./lib/session";

export type AuthView = "login" | "register" | "forgot" | "twofactor" | "onboarding";

type Errors = Record<string, string>;

export function Logo() {
  return (
    <div className="auth-logo">
      <div className="brand-mark">V</div>
      <div>
        <strong>VELQYRO</strong>
        <span>PAY</span>
      </div>
    </div>
  );
}

/** Moldura das telas de acesso: painel visual à esquerda e formulário à direita. */
export function AuthLayout({ visual, children, wide }: { visual?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Logo />
        {visual ?? (
          <div className="auth-copy">
            <span className="eyebrow">PAGAMENTOS QUE IMPULSIONAM</span>
            <h1>Venda. Receba. Cresça.</h1>
            <p>Uma experiência de pagamentos pensada para negócios digitais que querem simplicidade, controle e conversão.</p>
            <div className="auth-feature">
              <Check size={16} /> Checkout otimizado para conversão
            </div>
            <div className="auth-feature">
              <Check size={16} /> PIX e cartão em uma única experiência
            </div>
            <div className="auth-feature">
              <Check size={16} /> Dashboard claro e acompanhamento em tempo real
            </div>
          </div>
        )}
        <div className="trust-row">
          <LockKeyhole size={18} /> Segurança desde a arquitetura
        </div>
      </section>
      <section className="auth-form-side">
        <div className={wide ? "auth-card wide" : "auth-card"}>{children}</div>
      </section>
    </main>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="field-error" role="alert">
      {message}
    </span>
  ) : null;
}

export function PasswordMeter({ value }: { value: string }) {
  if (!value) return <span className="field-hint">Use ao menos 8 caracteres, com letras e números.</span>;
  const score = passwordStrength(value);
  return (
    <span className="password-meter">
      <span className={`password-bar level-${score}`}>
        <i style={{ width: `${(score + 1) * 20}%` }} />
      </span>
      <span className="field-hint">Senha: {PASSWORD_STRENGTH_LABEL[score].toLowerCase()}</span>
    </span>
  );
}

export default function Auth({ view }: { view: AuthView }) {
  if (view === "onboarding") return <Onboarding />;
  if (view === "twofactor") return <TwoFactorStep />;
  // As três telas usam o mesmo componente; a chave garante que cada uma começa com o formulário limpo.
  return <Access key={view} view={view} />;
}

/* ---------- Entrar, criar conta e recuperar senha ---------- */

function Access({ view }: { view: "login" | "register" | "forgot" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", acceptTerms: false });
  // Aviso trazido por outra tela (por exemplo, o login encerrado depois de muitos códigos errados).
  const [noticeSeen, setNoticeSeen] = useState(false);
  const notice = view === "login" && !noticeSeen ? noticeFrom(location.state) : null;

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function validate(): Errors {
    const e: Errors = {};
    if (!isValidEmail(form.email)) e.email = "Informe um e-mail válido.";
    if (view === "login" && !form.password) e.password = "Informe a senha.";
    if (view === "register") {
      if (form.name.trim().split(/\s+/).length < 2) e.name = "Informe nome e sobrenome.";
      if (!isValidPhoneBR(form.phone)) e.phone = "Informe um telefone com DDD.";
      const issues = passwordIssues(form.password);
      if (issues.length) e.password = issues[0];
      if (!form.acceptTerms) e.acceptTerms = "Aceite os termos para criar a conta.";
    }
    return e;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    setNoticeSeen(true);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (view === "login") {
        const res = await api.post<{ twoFactorRequired: boolean }>("/auth/login", { email: form.email, password: form.password });
        // A sessão precisa estar atualizada antes de trocar de tela: é ela que libera a tela do código ou o painel.
        const fresh = await refresh();
        if (res.twoFactorRequired) {
          // O destino original segue junto para a pessoa cair onde queria depois do código.
          const from = returnTo(location.state);
          navigate("/entrar/verificacao", { replace: true, state: from ? { from } : null });
        } else if (!fresh) {
          // Com a sessão carregada, quem redireciona é a rota (GuestOnly). Aqui ela não carregou.
          setFormError("Você entrou, mas não foi possível carregar sua conta. Atualize a página.");
        }
      } else if (view === "register") {
        await api.post("/auth/register", form);
        await refresh();
        navigate("/confirmar-email", { replace: true });
      } else {
        await api.post("/auth/password/forgot", { email: form.email });
        setSent(true);
      }
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const heading = { login: ["BEM-VINDO DE VOLTA", "Entre na sua conta"], register: ["COMECE AGORA", "Crie sua conta"], forgot: ["RECUPERAR ACESSO", "Esqueceu sua senha?"] }[view];

  return (
    <AuthLayout>
      {view === "forgot" && (
        <Link className="back-link" to="/entrar">
          <ArrowLeft size={16} /> Voltar
        </Link>
      )}
      <span className="eyebrow">{heading[0]}</span>
      <h2>{heading[1]}</h2>
      <p className="muted">{view === "forgot" ? "Informe seu e-mail e enviaremos as instruções de recuperação." : "Acesse a plataforma VELQYRO PAY."}</p>

      {sent ? (
        <div className="success-box">
          <Mail size={22} />
          <div>
            <strong>Confira seu e-mail</strong>
            <p>Se houver uma conta cadastrada, você receberá as instruções de recuperação. O link vale por 30 minutos.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form" noValidate>
          {formError && !Object.keys(errors).length ? <Alert kind="error">{formError}</Alert> : notice ? <Alert kind="error">{notice}</Alert> : null}
          {view === "register" && (
            <>
              <label>
                Nome completo
                <div className="input-shell">
                  <UserRound size={17} />
                  <input id="auth-name" value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" placeholder="Seu nome completo" />
                </div>
                <FieldError message={errors.name} />
              </label>
              <label>
                Telefone
                <div className="input-shell">
                  <Phone size={17} />
                  <input id="auth-phone" value={form.phone} onChange={(e) => set({ phone: formatPhoneBR(e.target.value) })} type="tel" inputMode="numeric" autoComplete="tel" placeholder="(00) 00000-0000" />
                </div>
                <FieldError message={errors.phone} />
              </label>
            </>
          )}
          <label>
            E-mail
            <div className="input-shell">
              <Mail size={17} />
              <input id="auth-email" value={form.email} onChange={(e) => set({ email: e.target.value })} type="email" autoComplete={view === "register" ? "email" : "username"} placeholder="voce@empresa.com" />
            </div>
            <FieldError message={errors.email} />
          </label>
          {view !== "forgot" && (
            <label>
              Senha
              <div className="input-shell">
                <LockKeyhole size={17} />
                <input
                  id="auth-password"
                  value={form.password}
                  onChange={(e) => set({ password: e.target.value })}
                  type={showPassword ? "text" : "password"}
                  autoComplete={view === "register" ? "new-password" : "current-password"}
                  placeholder={view === "register" ? "Mínimo de 8 caracteres" : "Sua senha"}
                />
                <button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {view === "register" && !errors.password && <PasswordMeter value={form.password} />}
              <FieldError message={errors.password} />
            </label>
          )}
          {view === "login" && (
            <Link className="text-button forgot" to="/recuperar-senha">
              Esqueci minha senha
            </Link>
          )}
          {view === "register" && (
            <div>
              <label className="terms">
                <input id="auth-terms" type="checkbox" checked={form.acceptTerms} onChange={(e) => set({ acceptTerms: e.target.checked })} />{" "}
                <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span>
              </label>
              <FieldError message={errors.acceptTerms} />
            </div>
          )}
          <SubmitButton busy={busy}>{view === "login" ? "Entrar" : view === "register" ? "Criar minha conta" : "Enviar instruções"}</SubmitButton>
        </form>
      )}

      {view !== "forgot" && (
        <div className="auth-switch">
          {view === "login" ? "Ainda não tem conta?" : "Já possui uma conta?"}
          <Link to={view === "login" ? "/criar-conta" : "/entrar"}>{view === "login" ? "Criar conta" : "Entrar"}</Link>
        </div>
      )}
      {import.meta.env.DEV && (
        <p className="prototype-note">
          Ambiente de desenvolvimento. Depois de <code>npm run db:seed</code>, entre com marina@exemplo.com e a senha velqyro123. Os e-mails ficam na <Link to="/dev/caixa-de-saida">caixa de saída</Link>.
        </p>
      )}
    </AuthLayout>
  );
}

/* ---------- Segundo fator no login ---------- */

/** Aviso de texto guardado no estado da navegação por outra tela do painel. */
function noticeFrom(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return null;
  const notice = (state as { notice?: unknown }).notice;
  return typeof notice === "string" && notice ? notice : null;
}

/** Código de recuperação no formato XXXXX-XXXXX, em maiúsculas. */
function formatRecoveryCode(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
}

function TwoFactorStep() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh, logout } = useSession();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Código incompleto nem chega à API: cada envio errado conta para o bloqueio.
    const complete = useRecovery ? /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(code) : /^\d{6}$/.test(code);
    if (!complete) {
      setError(useRecovery ? "Digite o código de recuperação completo, no formato XXXXX-XXXXX." : "Digite os 6 dígitos do código.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/2fa/verify", useRecovery ? { recoveryCode: code } : { code });
      // Com a sessão completa, a rota desta tela leva a pessoa para onde ela ia.
      const fresh = await refresh();
      if (!fresh) setError("O código foi aceito, mas não foi possível carregar sua conta. Atualize a página.");
    } catch (e) {
      const ended = e instanceof ApiError && (e.status === 401 || e.code === "conta_bloqueada");
      if (ended) {
        // O login pela metade foi encerrado (muitos códigos errados ou sessão expirada): volta para o começo com o motivo.
        await refresh();
        navigate("/entrar", { replace: true, state: { from: returnTo(location.state) ?? undefined, notice: errorMessage(e) } });
        return;
      }
      setError(errorMessage(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function back() {
    await logout();
    navigate("/entrar", { replace: true });
  }

  return (
    <AuthLayout>
      <button className="back-link" onClick={back} type="button">
        <ArrowLeft size={16} /> Voltar
      </button>
      <span className="eyebrow">VERIFICAÇÃO EM DUAS ETAPAS</span>
      <h2>Confirme que é você</h2>
      <p className="muted">{useRecovery ? "Digite um dos códigos de recuperação que você guardou. Cada código vale uma vez." : "Digite o código de 6 dígitos do seu aplicativo autenticador."}</p>
      <form onSubmit={submit} className="auth-form" noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <label>
          {useRecovery ? "Código de recuperação" : "Código"}
          <div className="input-shell">
            <KeyRound size={17} />
            <input
              id="auth-2fa-code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(useRecovery ? formatRecoveryCode(e.target.value) : e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode={useRecovery ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              placeholder={useRecovery ? "XXXXX-XXXXX" : "000000"}
            />
          </div>
        </label>
        <SubmitButton busy={busy}>Confirmar</SubmitButton>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setUseRecovery(!useRecovery);
            setCode("");
            setError(null);
          }}
        >
          {useRecovery ? "Usar o aplicativo autenticador" : "Perdi o celular: usar código de recuperação"}
        </button>
      </form>
    </AuthLayout>
  );
}

/* ---------- Configuração inicial: criar a organização ---------- */

function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { me, refresh, selectOrganization, logout } = useSession();
  const adding = params.get("nova") === "1" && Boolean(me?.memberships.length);
  const [form, setForm] = useState<{ name: string; legalName: string; type: OrganizationType | ""; document: string; segment: Segment | "" }>({ name: "", legalName: "", type: "", document: "", segment: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  // O CNPJ aceita letras (formato alfanumérico, em vigor desde julho de 2026); o CPF segue só com números.
  // Antes de escolher o tipo, a máscara acompanha o que foi digitado para não descartar as letras de um CNPJ.
  const formatDoc = (value: string, type: OrganizationType | "") => (type === "PJ" ? formatCnpj(value) : type === "PF" ? formatCpf(value) : formatDocument(value));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const e: Errors = {};
    if (form.name.trim().length < 2) e.name = "Informe o nome do negócio.";
    if (!form.type) e.type = "Escolha o tipo de cadastro.";
    else if (!isValidDocument(form.type, form.document)) e.document = form.type === "PJ" ? "CNPJ inválido. Confira os números e as letras." : "CPF inválido. Confira os dígitos.";
    if (!form.segment) e.segment = "Escolha um segmento.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const created = await api.post<{ id: string }>("/organizations", { name: form.name, legalName: form.legalName || undefined, type: form.type, document: form.document, segment: form.segment });
      await refresh();
      selectOrganization(created.id);
      navigate("/", { replace: true });
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Quem já tem organização só chega aqui para criar outra (pelo botão "+" da barra lateral).
  if (me?.memberships.length && params.get("nova") !== "1") return <Navigate to="/" replace />;

  return (
    <AuthLayout
      wide
      visual={
        <div className="auth-copy">
          <span className="eyebrow">CONFIGURAÇÃO INICIAL</span>
          <h1>Prepare sua conta para começar a vender.</h1>
          <p>Complete os dados básicos do negócio. A verificação documental será conectada ao provedor financeiro em uma próxima etapa.</p>
        </div>
      }
    >
      {adding ? (
        <Link className="back-link" to="/">
          <ArrowLeft size={16} /> Voltar ao painel
        </Link>
      ) : (
        <div className="step-indicator">
          <span className="done">
            <Check size={14} />
          </span>
          <i />
          <span>2</span>
        </div>
      )}
      <span className="eyebrow">{adding ? "NOVA ORGANIZAÇÃO" : "PASSO 2 DE 2"}</span>
      <h2>Conte sobre o seu negócio</h2>
      <p className="muted">O nome e o segmento poderão ser alterados nas configurações. O documento não muda depois.</p>
      <form onSubmit={submit} className="form-grid" noValidate>
        {formError && !Object.keys(errors).length && (
          <div className="full">
            <Alert kind="error">{formError}</Alert>
          </div>
        )}
        <label className="full">
          Nome do negócio
          <div className="input-shell">
            <Building2 size={17} />
            <input id="onb-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Minha Empresa" />
          </div>
          <FieldError message={errors.name} />
        </label>
        <label>
          Tipo de cadastro
          <select id="onb-type" value={form.type} onChange={(e) => set({ type: e.target.value as OrganizationType, document: formatDoc(form.document, e.target.value as OrganizationType) })}>
            <option value="" disabled>
              Selecione
            </option>
            {ORGANIZATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORGANIZATION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <FieldError message={errors.type} />
        </label>
        <label>
          {form.type === "PJ" ? "CNPJ" : form.type === "PF" ? "CPF" : "Documento"}
          <input
            id="onb-document"
            value={form.document}
            onChange={(e) => set({ document: formatDoc(e.target.value, form.type) })}
            inputMode={form.type === "PF" ? "numeric" : "text"}
            maxLength={form.type === "PF" ? 14 : 18}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder={form.type === "PJ" ? "00.000.000/0000-00" : form.type === "PF" ? "000.000.000-00" : "CPF ou CNPJ"}
          />
          {form.type === "PJ" && !errors.document && <span className="field-hint">O CNPJ pode ter letras e números.</span>}
          <FieldError message={errors.document} />
        </label>
        {form.type === "PJ" && (
          <label className="full">
            Razão social (opcional)
            <input id="onb-legal" value={form.legalName} onChange={(e) => set({ legalName: e.target.value })} placeholder="Como consta no CNPJ" />
            <FieldError message={errors.legalName} />
          </label>
        )}
        <label className="full">
          Segmento
          <select id="onb-segment" value={form.segment} onChange={(e) => set({ segment: e.target.value as Segment })}>
            <option value="" disabled>
              Selecione seu segmento
            </option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {SEGMENT_LABEL[s]}
              </option>
            ))}
          </select>
          <FieldError message={errors.segment} />
        </label>
        <SubmitButton busy={busy} className="primary-button full">
          {adding ? "Criar organização" : "Concluir e acessar painel"}
        </SubmitButton>
      </form>
      {!adding && (
        <div className="auth-switch">
          <ShieldCheck size={14} /> Entrou com a conta errada?
          <button
            onClick={async () => {
              await logout();
              navigate("/entrar", { replace: true });
            }}
          >
            Sair
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
