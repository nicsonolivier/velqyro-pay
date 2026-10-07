import { ArrowDownLeft, ArrowUpRight, Clock3, Landmark, ShieldCheck } from "lucide-react";
const movements=[
 ["Venda recebida","Pedido #VP-1048","+ R$ 297,00","07/10/2026 11:32","in"],
 ["Taxa de processamento","Pedido #VP-1048","- R$ 8,61","07/10/2026 11:32","out"],
 ["Venda recebida","Pedido #VP-1047","+ R$ 997,00","07/10/2026 10:18","in"],
 ["Saque demonstrativo","Conta bancária","- R$ 2.500,00","05/10/2026 14:20","out"],
];
export default function Finance(){return <section>
<header className="page-heading"><div><p className="eyebrow">FINANCEIRO</p><h1>Saldo e movimentações</h1><p className="muted">Visão operacional demonstrativa até a integração com o provedor financeiro.</p></div><button className="primary-action disabled-action" disabled><Landmark size={16}/> Solicitar saque</button></header>
<div className="finance-cards"><article className="balance-card main-balance"><span>Saldo disponível</span><strong>R$ 18.420,70</strong><small><ShieldCheck size={13}/> Valor demonstrativo</small></article><article className="balance-card"><Clock3 size={20}/><span>A receber</span><strong>R$ 7.840,00</strong><small>Liquidação depende do PSP</small></article><article className="balance-card"><ArrowUpRight size={20}/><span>Recebido no mês</span><strong>R$ 43.692,50</strong><small>Dados de demonstração</small></article></div>
<div className="security-note finance-warning"><ShieldCheck size={18}/><span><strong>Importante:</strong> saque, liquidação e custódia não estão ativos. Esses recursos só funcionarão conforme o modelo regulatório e a integração oficial do provedor de pagamentos.</span></div>
<article className="panel finance-panel"><div className="panel-head"><div><p className="eyebrow">EXTRATO</p><h2>Movimentações recentes</h2></div></div>{movements.map(x=><div className="movement" key={x[1]+x[3]}><i className={x[4]==="in"?"movement-icon incoming":"movement-icon outgoing"}>{x[4]==="in"?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</i><div><strong>{x[0]}</strong><span>{x[1]} • {x[3]}</span></div><b className={x[4]==="in"?"money-in":"money-out"}>{x[2]}</b></div>)}</article>
</section>}