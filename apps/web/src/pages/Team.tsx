import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { History, MailPlus, RefreshCw, Trash2, UserCog, Users } from "lucide-react";
import { can, canGrant, grantableRoles, isValidEmail, ROLE_DESCRIPTION, ROLE_LABEL, ROLES } from "@velqyro/shared";
import type { Role } from "@velqyro/shared";
import { Alert, Badge, ConfirmDialog, EmptyState, Field, Modal, Spinner, SubmitButton, useToast } from "../components/ui";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { auditActionLabel, daysUntil, formatDate, formatDateTime } from "../lib/format";
import { useWorkspace } from "../lib/session";
import type { AuditItem, Invitation, Member } from "../lib/types";

type Dialog = { kind: "invite" } | { kind: "role"; member: Member } | { kind: "remove"; member: Member } | { kind: "cancel"; invitation: Invitation } | null;

export default function Team() {
  const { membership } = useWorkspace();
  // Cada organização tem a sua tela: ao trocar no seletor, membros, convites, erros e diálogos da anterior
  // somem na hora, e as respostas que ainda estavam a caminho para ela são ignoradas.
  return <TeamBoard key={membership.organization.id} />;
}

function TeamBoard() {
  const { me, membership } = useWorkspace();
  const toast = useToast();
  const orgId = membership.organization.id;
  const base = `/organizations/${orgId}`;
  const myRole = membership.role;
  const canManage = can(myRole, "team", "manage");
  const canAudit = can(myRole, "audit");
  // Ninguém concede, altera ou retira um papel com mais poder que o seu. A API aplica a mesma regra.
  const grantable = grantableRoles(myRole);
  const canInvite = canManage && grantable.length > 0;
  const ownerOnly = `O papel ${ROLE_LABEL[myRole]} não gerencia este papel. Peça a um proprietário.`;

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [resending, setResending] = useState<string | null>(null);
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    latestLoad.current += 1;
    const ticket = latestLoad.current;
    try {
      const [m, i] = await Promise.all([api.get<{ members: Member[] }>(`${base}/members`), api.get<{ invitations: Invitation[] }>(`${base}/invitations`)]);
      // Só a busca mais recente vale: uma resposta atrasada não sobrescreve a lista nova.
      if (ticket !== latestLoad.current) return;
      setMembers(m.members);
      setInvitations(i.invitations);
      setError(null);
    } catch (e) {
      if (ticket !== latestLoad.current) return;
      setError(errorMessage(e));
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const term = search.trim().toLowerCase();
  const visible = (members ?? []).filter((m) => (!roleFilter || m.role === roleFilter) && (!term || `${m.user.name} ${m.user.email}`.toLowerCase().includes(term)));

  async function resend(invitation: Invitation) {
    setResending(invitation.id);
    try {
      await api.post(`${base}/invitations/${invitation.id}/resend`);
      toast(`Convite reenviado para ${invitation.email}`);
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setResending(null);
    }
  }

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZAÇÃO</p>
          <h1>Equipe</h1>
          <p className="muted">Convide pessoas para {membership.organization.name} e defina o que cada uma pode fazer.</p>
        </div>
        {canInvite && (
          <button className="primary-action" onClick={() => setDialog({ kind: "invite" })}>
            <MailPlus size={17} /> Convidar pessoa
          </button>
        )}
      </header>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="product-stats">
        <div className="mini-stat">
          <span>Membros</span>
          <strong>{members?.length ?? "—"}</strong>
        </div>
        <div className="mini-stat">
          <span>Convites pendentes</span>
          <strong>{invitations.filter((i) => !i.expired).length}</strong>
        </div>
        <div className="mini-stat">
          <span>Seu papel</span>
          <strong>{ROLE_LABEL[membership.role]}</strong>
        </div>
      </div>

      <article className="panel">
        <div className="product-toolbar">
          <div className="search-box">
            <Users size={16} />
            <input id="team-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail..." aria-label="Buscar membro" />
          </div>
          <select id="team-role-filter" className="inline-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")} aria-label="Filtrar por papel">
            <option value="">Todos os papéis</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {!members && !error && (
          <div className="empty-state">
            <Spinner />
          </div>
        )}
        {members && visible.length === 0 && (
          <EmptyState
            icon={<Users size={28} />}
            title="Ninguém encontrado"
            text="Nenhum membro corresponde à busca ou ao filtro."
            action={
              <button
                className="ghost-button"
                onClick={() => {
                  setSearch("");
                  setRoleFilter("");
                }}
              >
                Limpar filtros
              </button>
            }
          />
        )}
        {visible.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Papel</th>
                  <th>Desde</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => {
                  const self = m.user.id === me.user.id;
                  const locked = m.role === "OWNER" || self || !canManage;
                  // Papel que quem está logado não pode conceder também não pode ser alterado nem removido por ele.
                  const outOfReach = !locked && !canGrant(myRole, m.role);
                  return (
                    <tr key={m.id}>
                      <td>
                        <span className="customer-name">
                          <i>
                            <UserCog size={13} />
                          </i>
                          <span>
                            {m.user.name} {self && <Badge tone="purple">Você</Badge>}
                            <small className="cell-sub">{m.user.email}</small>
                          </span>
                        </span>
                      </td>
                      <td>{ROLE_LABEL[m.role]}</td>
                      <td>{formatDate(m.since)}</td>
                      <td className="row-actions">
                        {locked ? (
                          <span className="cell-sub">{m.role === "OWNER" ? "Proprietário" : self ? "Sua conta" : ""}</span>
                        ) : outOfReach ? (
                          <span className="cell-sub" title={ownerOnly}>
                            Só o proprietário altera
                          </span>
                        ) : (
                          <>
                            <button className="ghost-button" onClick={() => setDialog({ kind: "role", member: m })}>
                              Alterar papel
                            </button>
                            <button className="ghost-button danger-text" onClick={() => setDialog({ kind: "remove", member: m })} aria-label={`Remover ${m.user.name}`}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel section-gap">
        <div className="panel-head">
          <div>
            <p className="eyebrow">CONVITES</p>
            <h2>Aguardando resposta</h2>
          </div>
        </div>
        {invitations.length === 0 ? (
          <EmptyState icon={<MailPlus size={28} />} title="Nenhum convite pendente" text="Quando você convidar alguém, o convite fica aqui até ser aceito." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Situação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>{ROLE_LABEL[i.role]}</td>
                    <td>{i.expired ? <Badge tone="inactive">Expirado</Badge> : <Badge tone="pending">Expira em {daysUntil(i.expiresAt)} dia(s)</Badge>}</td>
                    <td className="row-actions">
                      {canManage && !canGrant(myRole, i.role) && (
                        <span className="cell-sub" title={ownerOnly}>
                          Só o proprietário gerencia
                        </span>
                      )}
                      {canManage && canGrant(myRole, i.role) && (
                        <>
                          <button className="ghost-button action-inline" onClick={() => resend(i)} disabled={resending !== null}>
                            <RefreshCw size={13} /> {resending === i.id ? "Reenviando..." : "Reenviar"}
                          </button>
                          <button className="ghost-button danger-text" onClick={() => setDialog({ kind: "cancel", invitation: i })} disabled={resending === i.id}>
                            Cancelar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel section-gap">
        <div className="panel-head">
          <div>
            <p className="eyebrow">PERMISSÕES</p>
            <h2>O que cada papel faz</h2>
          </div>
        </div>
        <dl className="role-list">
          {ROLES.map((r) => (
            <div key={r}>
              <dt>{ROLE_LABEL[r]}</dt>
              <dd>{ROLE_DESCRIPTION[r]}</dd>
            </div>
          ))}
        </dl>
      </article>

      {canAudit && <AuditTrail base={base} />}

      {dialog?.kind === "invite" && (
        <InviteDialog
          base={base}
          roles={grantable}
          onClose={() => setDialog(null)}
          onDone={async (email) => {
            toast(`Convite enviado para ${email}`);
            await load();
          }}
        />
      )}
      {dialog?.kind === "role" && (
        <RoleDialog
          base={base}
          roles={grantable}
          member={dialog.member}
          onClose={() => setDialog(null)}
          onDone={async () => {
            toast("Papel atualizado");
            await load();
          }}
        />
      )}
      {dialog?.kind === "remove" && (
        <ConfirmDialog
          title="Remover da equipe"
          text={
            <>
              Remover <strong>{dialog.member.user.name}</strong> de {membership.organization.name}? O acesso é encerrado na hora.
            </>
          }
          confirmLabel="Remover"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await api.delete(`${base}/members/${dialog.member.id}`);
            toast("Membro removido");
            await load();
          }}
        />
      )}
      {dialog?.kind === "cancel" && (
        <ConfirmDialog
          title="Cancelar convite"
          text={
            <>
              Cancelar o convite de <strong>{dialog.invitation.email}</strong>? O link enviado deixa de funcionar.
            </>
          }
          confirmLabel="Cancelar convite"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await api.delete(`${base}/invitations/${dialog.invitation.id}`);
            toast("Convite cancelado");
            await load();
          }}
        />
      )}
    </section>
  );
}

/** Só oferece os papéis que quem está logado pode conceder. */
function RoleSelect({ id, value, roles, onChange }: { id: string; value: Role; roles: readonly Role[]; onChange: (role: Role) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as Role)}>
      {roles.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}

function InviteDialog({ base, roles, onClose, onDone }: { base: string; roles: readonly Role[]; onClose: () => void; onDone: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(roles.includes("VIEWER") ? "VIEWER" : (roles[0] ?? "VIEWER"));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email)) return setErrors({ email: "Informe um e-mail válido." });
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await api.post(`${base}/invitations`, { email, role });
      await onDone(email.trim().toLowerCase());
      onClose();
    } catch (e) {
      setErrors(fieldErrors(e));
      setFormError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Convidar pessoa" eyebrow="EQUIPE" onClose={onClose}>
      <form className="product-form" onSubmit={submit} noValidate>
        {formError && !errors.email && !errors.role && <Alert kind="error">{formError}</Alert>}
        <Field label="E-mail" error={errors.email}>
          <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" autoFocus />
        </Field>
        <Field label="Papel" error={errors.role} hint={ROLE_DESCRIPTION[role]}>
          <RoleSelect id="invite-role" value={role} roles={roles} onChange={setRole} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton busy={busy} className="primary-action">
            Enviar convite
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function RoleDialog({ base, roles, member, onClose, onDone }: { base: string; roles: readonly Role[]; member: Member; onClose: () => void; onDone: () => Promise<void> }) {
  const [role, setRole] = useState<Role>(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`${base}/members/${member.id}`, { role });
      await onDone();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Alterar papel" eyebrow={member.user.name.toUpperCase()} onClose={onClose}>
      <form className="product-form" onSubmit={submit}>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Papel" hint={ROLE_DESCRIPTION[role]}>
          <RoleSelect id="member-role" value={role} roles={roles} onChange={setRole} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton busy={busy} className="primary-action">
            Salvar papel
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function AuditTrail({ base }: { base: string }) {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (from: string | null) => {
      setBusy(true);
      try {
        const page = await api.get<{ items: AuditItem[]; nextCursor: string | null }>(`${base}/audit-logs?limit=15${from ? `&cursor=${from}` : ""}`);
        setItems((current) => (from && current ? [...current, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [base],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <article className="panel section-gap">
      <div className="panel-head">
        <div>
          <p className="eyebrow">AUDITORIA</p>
          <h2>Atividade da organização</h2>
        </div>
        <button className="ghost-button action-inline" onClick={() => load(null)} disabled={busy}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {!items && !error && (
        <div className="empty-state">
          <Spinner />
        </div>
      )}
      {items?.length === 0 && <EmptyState icon={<History size={28} />} title="Nenhuma atividade registrada" text="Convites, trocas de papel e alterações do negócio aparecem aqui." />}
      {items?.map((a) => (
        <div className="movement" key={a.id}>
          <i className="movement-icon incoming audit-icon">
            <History size={16} />
          </i>
          <div>
            <strong>{auditActionLabel(a.action)}</strong>
            <span>
              {a.actor} • {formatDateTime(a.createdAt)}
              {typeof a.metadata.email === "string" ? ` • ${a.metadata.email}` : ""}
              {typeof a.metadata.member === "string" ? ` • ${a.metadata.member}` : ""}
            </span>
          </div>
          <b className="cell-sub">{a.ip ?? ""}</b>
        </div>
      ))}
      {cursor && (
        <div className="load-more">
          <button className="ghost-button" onClick={() => load(cursor)} disabled={busy}>
            {busy ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      )}
    </article>
  );
}
