import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChartNoAxesCombined, CircleDollarSign, CreditCard, Gauge } from "lucide-react";
import { firstName } from "../lib/format";
import { useWorkspace } from "../lib/session";

type Metric = {
  label: string;
  value: string;
  change: string;
};

// Números de demonstração. Passam a vir da API quando pedidos, pagamentos e o livro-razão existirem (etapas 3 a 5).
const metrics: Metric[] = [
  { label: "Saldo disponível", value: "R$ 18.420,70", change: "+12% no mês" },
  { label: "A receber", value: "R$ 7.840,00", change: "+8% no mês" },
  { label: "Vendas hoje", value: "R$ 2.974,00", change: "+24% hoje" },
  { label: "Vendas no mês", value: "R$ 43.692,50", change: "+18% no mês" },
];

const transactions = [
  ["João Silva", "Curso Premium", "R$ 297,00", "PIX", "Aprovado"],
  ["Maria Oliveira", "Mentoria Individual", "R$ 997,00", "Cartão", "Aprovado"],
  ["Carlos Souza", "Curso Iniciante", "R$ 197,00", "PIX", "Pendente"],
  ["Ana Costa", "Pack Templates", "R$ 47,00", "Cartão", "Aprovado"],
];

export default function Overview() {
  const { me, membership } = useWorkspace();
  const bars = useMemo(() => [35, 48, 42, 62, 50, 67, 57, 76, 64, 71, 58, 83, 73, 91, 66, 80, 72, 88], []);

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">VELQYRO PAY</p>
          <h1>Olá, {firstName(me.user.name)} 👋</h1>
          <p className="muted">Aqui está o resumo de {membership.organization.name}.</p>
        </div>
        <div className="period demo-tag">Dados de demonstração</div>
      </header>

      <section className="metric-grid">
        {metrics.map((metric, index) => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-icon">{[CircleDollarSign, CreditCard, ChartNoAxesCombined, Gauge].map((Icon, i) => (i === index ? <Icon size={20} key={i} /> : null))}</div>
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
            <span>
              <i className="dot purple" />
              PIX <b>52%</b>
            </span>
            <span>
              <i className="dot cyan" />
              Cartão <b>38%</b>
            </span>
            <span>
              <i className="dot gray" />
              Outros <b>10%</b>
            </span>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">ATIVIDADE</p>
            <h2>Últimas transações</h2>
          </div>
          <Link className="ghost-button" to="/vendas">
            Ver todas
          </Link>
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
                  <td>
                    <span className={status === "Aprovado" ? "status ok" : "status pending"}>{status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
