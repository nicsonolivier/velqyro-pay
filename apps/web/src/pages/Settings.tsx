import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import {
  can,
  formatPhoneBR,
  isValidPhoneBR,
  ORGANIZATION_STATUS_LABEL,
  ORGANIZATION_TYPE_LABEL,
  passwordIssues,
  ROLE_LABEL,
  SEGMENT_LABEL,
  SEGMENTS,
} from "@velqyro/shared";
import type { Segment } from "@velqyro/shared";
import { PasswordMeter } from "../Auth";
import { Alert, Badge, ConfirmDialog, CopyButton, Field, Modal, Spinner, SubmitButton, useToast } from "../components/ui";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { describeDevice, relativeTime } from "../lib/format";
import { useSession, useWorkspace } from "../lib/session";
import type { SessionItem } from "../lib/types";

type Tab = "perfil" | "seguranca" | "negocio";

interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  qr: string;
}

export default function Settings() {
  const { membership } = useWorkspace();
  const [tab, setTab] = useState<Tab>("perfil");
  // Códigos de recuperação recém-gerados. Ficam aqui (só na memória, nunca no navegador) para continuarem
  // na tela ao trocar de aba ou de organização, até a pessoa confirmar que guardou.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const seesBusiness = can(membership.role, "business");
  const tabs: Array<[Tab, string]> = [["perfil", "Perfil"], ["seguranca", "Segurança"], ...(seesBusiness ? ([["negocio", "Negócio"]] as Array<[Tab, string]>) : [])];
  // Ao trocar para uma organização em que o papel não vê a aba Negócio, a tela volta para o Perfil.
  const activeTab: Tab = tab === "negocio" && !seesBusiness ? "perfil" : tab;

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">CONTA</p>
          <h1>Configurações</h1>
          <p className="muted">Seus dados, a segurança do acesso e as informações do negócio.</p>
        </div>
      </header>
      <div className="tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={activeTab === key} className={activeTab === key ? "tab active" : "tab"} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {recoveryCodes && activeTab !== "seguranca" && (
        <div className="content-notice">
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">PROTEÇÃO EXTRA</p>
                <h2>Códigos de recuperação da 2FA</h2>
              </div>
            </div>
            <RecoveryCodes codes={recoveryCodes} onSaved={() => setRecoveryCodes(null)} />
          </article>
        </div>
      )}
      {activeTab === "perfil" && <ProfileTab />}
      {activeTab === "seguranca" && <SecurityTab recoveryCodes={recoveryCodes} onRecoveryCodes={setRecoveryCodes} />}
      {activeTab === "negocio" && <BusinessTab />}
    </section>
  );
}

/** Códigos de recuperação mostrados uma única vez, logo depois de ativar a 2FA. */
function RecoveryCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  return (
    <div className="recovery-box">
      <Alert kind="success">2FA ativada, e as outras sessões da sua conta foram encerradas. Guarde estes códigos de recuperação em um lugar seguro: eles não aparecem de novo e cada um vale uma vez.</Alert>
      <div className="recovery-codes">
        {codes.map((c) => (
          <code key={c}>{c}</code>
        ))}
      </div>
      <div className="form-actions">
        <CopyButton value={codes.join("\n")} label="Copiar códigos" />
        <button className="primary-action" onClick={onSaved}>
          Guardei os códigos
        </button>
      </div>
    </div>
  );
}

/* ---------- Perfil ---------- */

function ProfileTab() {
  const { me } = useWorkspace();
  const { refresh } = useSession();
  const toast = useToast();
  const [name, setName] = useState(me.user.name);
  const [phone, setPhone] = useState(formatPhoneBR(me.user.phone));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const dirty = name !== me.user.name || phone.replace(/\D/g, "") !== me.user.phone;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const e: Record<string, string> = {};
    if (name.trim().split(/\s+/).length < 2) e.name = "Informe nome e sobrenome.";
    if (!isValidPhoneBR(phone)) e.phone = "Informe um telefone com DDD.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.patch("/account", { name, phone });
      await refresh();
      toast("Dados pessoais salvos");
    } catch (error) {
      setErrors(fieldErrors(error));
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    try {
      await api.post("/auth/phone/send");
      setCodeOpen(true);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <article className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">PERFIL</p>
            <h2>Dados pessoais</h2>
          </div>
        </div>
        <form className="settings-form" onSubmit={submit} noValidate>
          <Field label="Nome completo" error={errors.name}>
            <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Telefone" error={errors.phone} hint="Trocar o telefone exige confirmar o número novo.">
            <input id="profile-phone" value={phone} onChange={(e) => setPhone(formatPhoneBR(e.target.value))} type="tel" inputMode="numeric" autoComplete="tel" />
          </Field>
          <Field label="E-mail" hint="O e-mail é a sua identificação e ainda não pode ser trocado pelo painel." className="full">
            <input id="profile-email" value={me.user.email} readOnly />
          </Field>
          <div className="form-actions full">
            <SubmitButton busy={busy} className="primary-action">
              Salvar dados
            </SubmitButton>
            {dirty && <span className="field-hint">Há alterações não salvas.</span>}
          </div>
        </form>
      </article>

      <article className="panel section-gap">
        <div className="panel-head">
          <div>
            <p className="eyebrow">VERIFICAÇÕES</p>
            <h2>E-mail e telefone</h2>
          </div>
        </div>
        <div className="check-row">
          <div>
            <strong>{me.user.email}</strong>
            <small>E-mail</small>
          </div>
          <Badge tone="ok">Confirmado</Badge>
        </div>
        <div className="check-row">
          <div>
            <strong>{formatPhoneBR(me.user.phone)}</strong>
            <small>Telefone</small>
          </div>
          {me.user.phoneVerified ? (
            <Badge tone="ok">Confirmado</Badge>
          ) : (
            <button className="ghost-button action-inline" onClick={sendCode}>
              <Smartphone size={14} /> Confirmar por SMS
            </button>
          )}
        </div>
      </article>
      {codeOpen && <PhoneCodeDialog onClose={() => setCodeOpen(false)} />}
    </>
  );
}

function PhoneCodeDialog({ onClose }: { onClose: () => void }) {
  const { refresh } = useSession();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/phone/verify", { code });
      await refresh();
      toast("Telefone confirmado");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Confirmar telefone" eyebrow="SMS" onClose={onClose}>
      <form className="product-form" onSubmit={submit}>
        <p className="muted confirm-text">Enviamos um código de 6 dígitos por SMS. Ele vale por 10 minutos.</p>
        {import.meta.env.DEV && (
          <Alert kind="info">
            Em desenvolvimento o SMS aparece na{" "}
            <Link to="/dev/caixa-de-saida" target="_blank" rel="noreferrer">
              caixa de saída
            </Link>
            , que abre em outra aba.
          </Alert>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Código">
          <input id="phone-code" className="code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000" />
        </Field>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton busy={busy} className="primary-action">
            Confirmar
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Segurança ---------- */

function SecurityTab({ recoveryCodes, onRecoveryCodes }: { recoveryCodes: string[] | null; onRecoveryCodes: (codes: string[] | null) => void }) {
  // Trocar a senha ou ativar a 2FA encerra as outras sessões: a lista é buscada de novo.
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const sessionsChanged = useCallback(() => setSessionsVersion((v) => v + 1), []);
  return (
    <>
      <PasswordPanel onSessionsChanged={sessionsChanged} />
      <TwoFactorPanel recoveryCodes={recoveryCodes} onRecoveryCodes={onRecoveryCodes} onSessionsChanged={sessionsChanged} />
      <SessionsPanel version={sessionsVersion} />
    </>
  );
}

function PasswordPanel({ onSessionsChanged }: { onSessionsChanged: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const e: Record<string, string> = {};
    if (!current) e.currentPassword = "Informe a senha atual.";
    const issues = passwordIssues(next);
    if (issues.length) e.newPassword = issues[0];
    if (next !== again) e.again = "As senhas não são iguais.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await api.post<{ sessionsEnded: number }>("/account/password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setAgain("");
      if (res.sessionsEnded) onSessionsChanged();
      toast(res.sessionsEnded ? `Senha alterada. ${res.sessionsEnded} outra(s) sessão(ões) encerrada(s).` : "Senha alterada");
    } catch (error) {
      setErrors(fieldErrors(error));
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">ACESSO</p>
          <h2>Senha</h2>
        </div>
      </div>
      <form className="settings-form" onSubmit={submit} noValidate>
        <Field label="Senha atual" error={errors.currentPassword} className="full">
          <input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="Nova senha" error={errors.newPassword} hint={<PasswordMeter value={next} />}>
          <input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Repita a nova senha" error={errors.again}>
          <input id="pw-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="form-actions full">
          <SubmitButton busy={busy} className="primary-action">
            Alterar senha
          </SubmitButton>
          <span className="field-hint">As outras sessões abertas são encerradas.</span>
        </div>
      </form>
    </article>
  );
}

function TwoFactorPanel({
  recoveryCodes,
  onRecoveryCodes,
  onSessionsChanged,
}: {
  recoveryCodes: string[] | null;
  onRecoveryCodes: (codes: string[] | null) => void;
  onSessionsChanged: () => void;
}) {
  const { me } = useWorkspace();
  const { refresh } = useSession();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!me.user.twoFactorEnabled) return;
    api
      .get<{ recoveryCodesLeft: number }>("/account/2fa")
      .then((r) => setLeft(r.recoveryCodesLeft))
      .catch(() => setLeft(null));
  }, [me.user.twoFactorEnabled]);

  async function enable(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>("/account/2fa/enable", { code });
      onRecoveryCodes(res.recoveryCodes);
      setSetup(null);
      setCode("");
      // Ativar a 2FA encerra as outras sessões da conta.
      onSessionsChanged();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel section-gap">
      <div className="panel-head">
        <div>
          <p className="eyebrow">PROTEÇÃO EXTRA</p>
          <h2>Verificação em duas etapas (2FA)</h2>
        </div>
        {me.user.twoFactorEnabled ? <Badge tone="ok">Ativada</Badge> : <Badge tone="pending">Desativada</Badge>}
      </div>
      <p className="muted panel-text">Além da senha, o login pede um código do aplicativo autenticador. Será obrigatória para sacar, criar chaves de produção e alterar a conta de recebimento.</p>
      {error && <Alert kind="error">{error}</Alert>}

      {recoveryCodes && <RecoveryCodes codes={recoveryCodes} onSaved={() => onRecoveryCodes(null)} />}

      {!me.user.twoFactorEnabled && !setup && !recoveryCodes && (
        <button className="primary-action" onClick={() => setAsking(true)}>
          <ShieldCheck size={16} /> Ativar 2FA
        </button>
      )}

      {setup && (
        <form className="twofa-setup" onSubmit={enable}>
          <img src={setup.qr} alt="QR Code para o aplicativo autenticador" width={200} height={200} />
          <div className="twofa-steps">
            <p>
              <strong>1.</strong> Abra o aplicativo autenticador (Google Authenticator, Authy, 1Password) e leia o QR Code.
            </p>
            <p className="muted">Se não conseguir ler, digite a chave manualmente:</p>
            <code className="secret-key">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
            <p>
              <strong>2.</strong> Digite o código de 6 dígitos que o aplicativo mostrar.
            </p>
            <Field label="Código">
              <input id="twofa-code" className="code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" />
            </Field>
            <div className="form-actions">
              <SubmitButton busy={busy} className="primary-action">
                Confirmar e ativar
              </SubmitButton>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setSetup(null);
                  setCode("");
                  setError(null);
                }}
              >
                Cancelar
              </button>
              <span className="field-hint">Ao ativar, as outras sessões da sua conta são encerradas.</span>
            </div>
          </div>
        </form>
      )}

      {me.user.twoFactorEnabled && !recoveryCodes && (
        <div className="form-actions">
          <button className="ghost-button danger-text" onClick={() => setDisabling(true)}>
            Desativar 2FA
          </button>
          {left !== null && <span className="field-hint">{left} código(s) de recuperação sem uso.</span>}
        </div>
      )}
      {asking && (
        <EnableTwoFactorDialog
          onClose={() => setAsking(false)}
          onReady={(ready) => {
            setError(null);
            setCode("");
            setSetup(ready);
          }}
        />
      )}
      {disabling && (
        <DisableTwoFactorDialog
          onClose={() => setDisabling(false)}
          onDone={async () => {
            await refresh();
            toast("2FA desativada");
          }}
        />
      )}
    </article>
  );
}

/** Antes de mostrar o QR Code, a API confere a senha atual: só quem sabe a senha começa a ativação. */
function EnableTwoFactorDialog({ onClose, onReady }: { onClose: () => void; onReady: (setup: TwoFactorSetup) => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!password) return setErrors({ password: "Informe a senha atual." });
    setBusy(true);
    setErrors({});
    try {
      const res = await api.post<{ secret: string; otpauthUri: string }>("/account/2fa/setup", { password });
      const qr = await QRCode.toDataURL(res.otpauthUri, { margin: 1, width: 200 });
      onReady({ secret: res.secret, otpauthUri: res.otpauthUri, qr });
      onClose();
    } catch (e) {
      setErrors(fieldErrors(e));
      setFormError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Ativar 2FA" eyebrow="SEGURANÇA" onClose={onClose}>
      <form className="product-form" onSubmit={submit} noValidate>
        <p className="muted confirm-text">Confirme sua senha para ver o QR Code do aplicativo autenticador.</p>
        {formError && !errors.password && <Alert kind="error">{formError}</Alert>}
        <Field label="Senha atual" error={errors.password}>
          <input id="twofa-on-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        </Field>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton busy={busy} className="primary-action">
            Continuar
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function DisableTwoFactorDialog({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await api.post("/account/2fa/disable", { password, code });
      await onDone();
      onClose();
    } catch (e) {
      setErrors(fieldErrors(e));
      setFormError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Desativar 2FA" eyebrow="SEGURANÇA" onClose={onClose}>
      <form className="product-form" onSubmit={submit}>
        <p className="muted confirm-text">Sem a verificação em duas etapas, a senha passa a ser a única proteção da conta.</p>
        {formError && !Object.keys(errors).length && <Alert kind="error">{formError}</Alert>}
        <Field label="Senha atual" error={errors.password}>
          <input id="twofa-off-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        </Field>
        <Field label="Código do aplicativo ou de recuperação" error={errors.code}>
          <input id="twofa-off-code" className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 11))} autoComplete="one-time-code" />
        </Field>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton busy={busy} className="danger-action">
            Desativar
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function SessionsPanel({ version }: { version: number }) {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ sessions: SessionItem[] }>("/account/sessions");
      setSessions(res.sessions);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // `version` muda quando outra parte da aba encerra sessões; a lista é buscada de novo.
  useEffect(() => {
    void load();
  }, [load, version]);

  async function end(id: string) {
    setEnding(id);
    try {
      await api.delete(`/account/sessions/${id}`);
      toast("Sessão encerrada");
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setEnding(null);
    }
  }

  return (
    <article className="panel section-gap">
      <div className="panel-head">
        <div>
          <p className="eyebrow">DISPOSITIVOS</p>
          <h2>Sessões ativas</h2>
        </div>
        {sessions && sessions.length > 1 && (
          <button className="ghost-button" onClick={() => setConfirmAll(true)}>
            Sair de todas as outras
          </button>
        )}
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {!sessions && !error && (
        <div className="empty-state">
          <Spinner />
        </div>
      )}
      {sessions?.map((s) => (
        <div className="movement" key={s.id}>
          <i className="movement-icon incoming audit-icon">
            <MonitorSmartphone size={16} />
          </i>
          <div>
            <strong>
              {describeDevice(s.userAgent)} {s.current && <Badge tone="purple">Esta sessão</Badge>}
            </strong>
            <span>
              Último acesso {relativeTime(s.lastSeenAt)}
              {s.ip ? ` • IP ${s.ip}` : ""}
            </span>
          </div>
          {!s.current && (
            <button className="ghost-button" onClick={() => end(s.id)} disabled={ending !== null}>
              {ending === s.id ? "Encerrando..." : "Encerrar"}
            </button>
          )}
        </div>
      ))}
      {confirmAll && (
        <ConfirmDialog
          title="Sair de todas as outras sessões"
          text="Os outros navegadores e dispositivos conectados à sua conta precisarão entrar de novo."
          confirmLabel="Encerrar as outras sessões"
          onClose={() => setConfirmAll(false)}
          onConfirm={async () => {
            await api.post("/account/sessions/revoke-others");
            toast("As outras sessões foram encerradas");
            await load();
          }}
        />
      )}
    </article>
  );
}

/* ---------- Negócio ---------- */

function BusinessTab() {
  const { membership } = useWorkspace();
  const { refresh } = useSession();
  const toast = useToast();
  const org = membership.organization;
  const canEdit = can(membership.role, "business", "manage");
  const [name, setName] = useState(org.name);
  const [segment, setSegment] = useState<Segment>(org.segment);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Ao trocar de organização no seletor, o formulário passa a mostrar os dados da nova.
  useEffect(() => {
    setName(org.name);
    setSegment(org.segment);
    setErrors({});
  }, [org.id, org.name, org.segment]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return setErrors({ name: "Informe o nome do negócio." });
    setBusy(true);
    setErrors({});
    try {
      await api.patch(`/organizations/${org.id}`, { name, segment });
      await refresh();
      toast("Dados do negócio salvos");
    } catch (e) {
      setErrors(fieldErrors(e));
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">ORGANIZAÇÃO</p>
          <h2>Dados do negócio</h2>
        </div>
        <Badge tone={org.status === "ACTIVE" ? "ok" : org.status === "SUSPENDED" ? "danger" : "pending"}>{ORGANIZATION_STATUS_LABEL[org.status]}</Badge>
      </div>
      {!canEdit && <Alert kind="info">O papel {ROLE_LABEL[membership.role]} pode ver estes dados, mas só o proprietário altera.</Alert>}
      <form className="settings-form" onSubmit={submit} noValidate>
        <Field label="Nome do negócio" error={errors.name}>
          <input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} readOnly={!canEdit} />
        </Field>
        <Field label="Segmento" error={errors.segment}>
          <select id="biz-segment" value={segment} onChange={(e) => setSegment(e.target.value as Segment)} disabled={!canEdit}>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {SEGMENT_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de cadastro">
          <input id="biz-type" value={ORGANIZATION_TYPE_LABEL[org.type]} readOnly />
        </Field>
        <Field label={org.type === "PJ" ? "CNPJ" : "CPF"} hint="O documento não pode ser alterado.">
          <input id="biz-document" value={org.document} readOnly />
        </Field>
        <Field label={org.type === "PJ" ? "Razão social" : "Titular"} className="full">
          <input id="biz-legal" value={org.legalName} readOnly />
        </Field>
        {canEdit && (
          <div className="form-actions full">
            <SubmitButton busy={busy} className="primary-action">
              Salvar dados do negócio
            </SubmitButton>
          </div>
        )}
      </form>
    </article>
  );
}
