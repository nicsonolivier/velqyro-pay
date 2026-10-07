import { useMemo, useState } from "react";
import Auth, { AuthView } from "./Auth";
import Products from "./Products";
import Checkout from "./Checkout";
import {
  BadgeDollarSign,
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  CreditCard,
  Gauge,
  LayoutDashboard,
  Link2,
  Package,
  Settings,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";

type Metric = {
  label: string;
  value: string;
  change: string;
};

const metrics: Metric[] = [
  { label: "Saldo disponível", value: "R$ 18.420,70", change: "+12% no mês" },
  { label: "A receber", value: "R$ 7.840,00", change: "+8% no mês" },
  { label: "Vendas hoje", value: "R$ 2.974,00", change: "+24% hoje" },
  { label: "Vendas no mês", value: "R$ 43.692,50", change: "+18% no mês" },
];

const navItems = [
  ["Visão geral", LayoutDashboard],
  ["Produtos", Package],
  ["Checkout", ShoppingCart],
  ["Vendas", BadgeDollarSign],
  ["Clientes", Users],
  ["Financeiro", WalletCards],
  ["Integrações", Link2],
  ["API / Webhooks", Boxes],
  ["Configurações", Settings],
] as const;

const transactions = [
  ["João Silva", "Curso Premium", "R$ 297,00", "PIX", "Aprovado"],
  ["Maria Oliveira", "Mentoria Individual", "R$ 997,00", "Cartão", "Aprovado"],
  ["Carlos Souza", "Curso Iniciante", "R$ 197,00", "PIX", "Pendente"],
  ["Ana Costa", "Pack Templates", "R$ 47,00", "Cartão", "Aprovado"],
];

function Brand() {
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

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<AuthView>("login");
  const [page, setPage] = useState("Visão geral");
  const bars = useMemo(
    () => [35, 48, 42, 62, 50, 67, 57, 76, 64, 71, 58, 83, 73, 91, 66, 80, 72, 88],
    []
  );

  if (!authenticated) {
    return <Auth view={authView} setView={setAuthView} onEnter={() => setAuthenticated(true)} />;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          {navItems.map(([label, Icon], index) => (
            <button onClick={() => (label === "Visão geral" || label === "Produtos" || label === "Checkout") && setPage(label)} className={page === label ? "nav-item active" : "nav-item"} key={label}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="upgrade-card">
          <span className="eyebrow">PLANO PRO</span>
          <strong>Até 10.000 vendas/mês</strong>
          <button>Fazer upgrade</button>
        </div>
      </aside>

      <section className="content">
        {page === "Produtos" ? <Products /> : page === "Checkout" ? <Checkout /> : <>
        <header className="topbar">
          <div>
            <p className="eyebrow">VELQYRO PAY</p>
            <h1>Olá, Nicson 👋</h1>
            <p className="muted">Aqui está o resumo do seu negócio hoje.</p>
          </div>
          <div className="period">01 Out 2026 — 07 Out 2026</div>
        </header>

        <section className="metric-grid">
          {metrics.map((metric, index) => (
            <article className="metric-card" key={metric.label}>
              <div className="metric-icon">
                {[CircleDollarSign, CreditCard, ChartNoAxesCombined, Gauge].map((Icon, i) =>
                  i === index ? <Icon size={20} key={i} /> : null
                )}
              </div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.change}</small>
            </article>
          ))}
        </section>

        <section className="insights-grid">
          <article className="panel chart-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">PERFORMANCE</p>
                <h2>Vendas nos últimos 30 dias</h2>
              </div>
              <span className="pill">Últimos 30 dias</span>
            </div>
            <div className="chart">
              {bars.map((height, index) => (
                <div className="bar-wrap" key={index}>
                  <div className="bar" style={{ height: `${height}%` }} />
                </div>
              ))}
            </div>
          </article>

          <article className="panel payment-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">PAGAMENTOS</p>
                <h2>Métodos</h2>
              </div>
            </div>
            <div className="donut" aria-label="52% Pix, 38% cartão, 10% outros">
              <div className="donut-center">
                <strong>52%</strong>
                <span>PIX</span>
              </div>
            </div>
            <div className="legend">
              <span><i className="dot purple" />PIX <b>52%</b></span>
              <span><i className="dot cyan" />Cartão <b>38%</b></span>
              <span><i className="dot gray" />Outros <b>10%</b></span>
            </div>
          </article>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">ATIVIDADE</p>
              <h2>Últimas transações</h2>
            </div>
            <button className="ghost-button">Ver todas</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Produto</th>
                  <th>Valor</th>
                  <th>Método</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(([client, product, value, method, status]) => (
                  <tr key={client}>
                    <td>{client}</td>
                    <td>{product}</td>
                    <td>{value}</td>
                    <td>{method}</td>
                    <td><span className={status === "Aprovado" ? "status ok" : "status pending"}>{status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        </>}
      </section>
    </main>
  );
}
