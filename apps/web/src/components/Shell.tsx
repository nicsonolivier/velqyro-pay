import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BadgeDollarSign, Boxes, Building2, LayoutDashboard, Link2, LogOut, Package, Plus, Settings, ShoppingCart, UserCog, Users, WalletCards } from "lucide-react";
import { can, ORGANIZATION_STATUS_LABEL, ROLE_LABEL } from "@velqyro/shared";
import type { Area } from "@velqyro/shared";
import { initials } from "../lib/format";
import { useSession, useWorkspace } from "../lib/session";
import { Alert } from "./ui";

export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">V</div>
      <div>
        <strong>VELQYRO</strong>
        <span>PAY</span>
      </div>
    </div>
  );
}

/** Itens do menu. A área decide quem vê cada item; sem área, todos veem. */
export const NAV_ITEMS: ReadonlyArray<{ label: string; to: string; icon: typeof LayoutDashboard; area: Area | null }> = [
  { label: "Visão geral", to: "/", icon: LayoutDashboard, area: "dashboard" },
  { label: "Produtos", to: "/produtos", icon: Package, area: "catalog" },
  { label: "Checkout", to: "/checkout", icon: ShoppingCart, area: "catalog" },
  { label: "Vendas", to: "/vendas", icon: BadgeDollarSign, area: "orders" },
  { label: "Clientes", to: "/clientes", icon: Users, area: "orders" },
  { label: "Financeiro", to: "/financeiro", icon: WalletCards, area: "balance" },
  { label: "Integrações", to: "/integracoes", icon: Link2, area: "developers" },
  { label: "API / Webhooks", to: "/api-webhooks", icon: Boxes, area: "developers" },
  { label: "Equipe", to: "/equipe", icon: UserCog, area: "team" },
  { label: "Configurações", to: "/configuracoes", icon: Settings, area: null },
];

const STATUS_NOTICE: Partial<Record<string, { kind: "warning" | "error" | "info"; text: string }>> = {
  KYC_PENDING: { kind: "info", text: "A verificação de documentos (KYC) entra na próxima etapa do projeto. Até lá, a conta fica como KYC pendente e nenhum pagamento real é processado." },
  KYC_REVIEW: { kind: "info", text: "Seus documentos estão em análise." },
  RESTRICTED: { kind: "warning", text: "Conta restrita: os saques estão bloqueados. Fale com o suporte." },
  SUSPENDED: { kind: "error", text: "Conta suspensa. Só é possível consultar os dados." },
};

export default function Shell({ children }: { children: ReactNode }) {
  const { me, membership } = useWorkspace();
  const { selectOrganization, logout } = useSession();
  const navigate = useNavigate();
  const org = membership.organization;
  const notice = STATUS_NOTICE[org.status];

  async function leave() {
    await logout();
    navigate("/entrar", { replace: true });
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <Brand />

        <div className="org-switcher">
          <span className="org-avatar">
            <Building2 size={16} />
          </span>
          <div className="org-switcher-body">
            <label htmlFor="org-select" className="eyebrow">
              ORGANIZAÇÃO
            </label>
            {me.memberships.length > 1 ? (
              <select id="org-select" value={org.id} onChange={(e) => selectOrganization(e.target.value)}>
                {me.memberships.map((m) => (
                  <option key={m.organization.id} value={m.organization.id}>
                    {m.organization.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong id="org-select">{org.name}</strong>
            )}
            <small>
              {ROLE_LABEL[membership.role]} · {ORGANIZATION_STATUS_LABEL[org.status]}
            </small>
          </div>
          <button className="icon-menu" title="Nova organização" aria-label="Nova organização" onClick={() => navigate("/configuracao-inicial?nova=1")}>
            <Plus size={16} />
          </button>
        </div>

        <nav aria-label="Menu principal">
          {NAV_ITEMS.filter((item) => !item.area || can(membership.role, item.area)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="user-card">
          <span className="user-avatar">{initials(me.user.name)}</span>
          <div className="user-card-body">
            <strong>{me.user.name}</strong>
            <small>{me.user.email}</small>
          </div>
          <button className="icon-menu" onClick={leave} title="Sair" aria-label="Sair">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <section className="content">
        {notice && (
          <div className="content-notice">
            <Alert kind={notice.kind}>{notice.text}</Alert>
          </div>
        )}
        {children}
      </section>
    </main>
  );
}
