import { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { can } from "@velqyro/shared";
import type { Area } from "@velqyro/shared";
import Auth from "./Auth";
import Checkout from "./Checkout";
import Customers from "./Customers";
import Finance from "./Finance";
import Products from "./Products";
import Sales from "./Sales";
import Shell from "./components/Shell";
import { FullPageLoading } from "./components/ui";
import { returnPath, useSession } from "./lib/session";
import { AcceptInvite, ComingSoon, ConfirmEmailNotice, DevOutbox, NoPermission, NotFound, ResetPassword, VerifyEmail } from "./pages/Misc";
import Overview from "./pages/Overview";
import Settings from "./pages/Settings";
import Team from "./pages/Team";

/**
 * Só para visitantes: quem já entrou vai direto para o painel.
 * Quem está no meio do login (2FA pendente) é levado para a tela do código.
 */
function GuestOnly({ children }: { children: ReactNode }) {
  const { status, me } = useSession();
  if (status === "loading") return <FullPageLoading />;
  if (status === "authenticated" && me) return <Navigate to={me.session.twoFactorPending ? "/entrar/verificacao" : "/"} replace />;
  return <>{children}</>;
}

/** Exige sessão completa: login feito, 2FA concluído e e-mail confirmado. */
function RequireAccount({ children, allowUnverified }: { children: ReactNode; allowUnverified?: boolean }) {
  const { status, me } = useSession();
  const location = useLocation();
  if (status === "loading") return <FullPageLoading />;
  if (status === "anonymous" || !me) return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />;
  if (me.session.twoFactorPending) return <Navigate to="/entrar/verificacao" replace />;
  if (!me.user.emailVerified && !allowUnverified) return <Navigate to="/confirmar-email" replace />;
  if (me.user.emailVerified && allowUnverified) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Página do painel: exige organização e, quando informada, permissão na área. */
function Panel({ area, children }: { area?: Area; children: ReactNode }) {
  const { me, membership } = useSession();
  return (
    <RequireAccount>
      {me && !membership ? (
        // Quem chegou por um convite volta para ele em vez de criar uma organização.
        <Navigate to={returnPath.peek()?.startsWith("/convite/") ? (returnPath.peek() as string) : "/configuracao-inicial"} replace />
      ) : membership ? (
        <Shell>{area && !can(membership.role, area) ? <NoPermission role={membership.role} /> : children}</Shell>
      ) : null}
    </RequireAccount>
  );
}

function TwoFactorGate() {
  const { status, me } = useSession();
  if (status === "loading") return <FullPageLoading />;
  if (status === "anonymous" || !me) return <Navigate to="/entrar" replace />;
  if (!me.session.twoFactorPending) return <Navigate to="/" replace />;
  return <Auth view="twofactor" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<GuestOnly><Auth view="login" /></GuestOnly>} />
      <Route path="/entrar/verificacao" element={<TwoFactorGate />} />
      <Route path="/criar-conta" element={<GuestOnly><Auth view="register" /></GuestOnly>} />
      <Route path="/recuperar-senha" element={<GuestOnly><Auth view="forgot" /></GuestOnly>} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />
      <Route path="/verificar-email" element={<VerifyEmail />} />
      <Route path="/confirmar-email" element={<RequireAccount allowUnverified><ConfirmEmailNotice /></RequireAccount>} />
      <Route path="/configuracao-inicial" element={<RequireAccount><Auth view="onboarding" /></RequireAccount>} />
      <Route path="/convite/:token" element={<AcceptInvite />} />
      {import.meta.env.DEV && <Route path="/dev/caixa-de-saida" element={<DevOutbox />} />}

      <Route path="/" element={<Panel area="dashboard"><Overview /></Panel>} />
      <Route path="/produtos" element={<Panel area="catalog"><Products /></Panel>} />
      <Route path="/checkout" element={<Panel area="catalog"><Checkout /></Panel>} />
      <Route path="/vendas" element={<Panel area="orders"><Sales /></Panel>} />
      <Route path="/clientes" element={<Panel area="orders"><Customers /></Panel>} />
      <Route path="/financeiro" element={<Panel area="balance"><Finance /></Panel>} />
      <Route
        path="/integracoes"
        element={<Panel area="developers"><ComingSoon title="Integrações" stage="Etapa 6" text="WhatsApp, e-mail transacional, ERPs e lojas virtuais. A estrutura fica preparada e as conexões entram depois." /></Panel>}
      />
      <Route
        path="/api-webhooks"
        element={<Panel area="developers"><ComingSoon title="API / Webhooks" stage="Etapa 6" text="Chaves de API, webhooks assinados, logs e Sandbox para desenvolvedores." /></Panel>}
      />
      <Route path="/equipe" element={<Panel area="team"><Team /></Panel>} />
      <Route path="/configuracoes" element={<Panel><Settings /></Panel>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
