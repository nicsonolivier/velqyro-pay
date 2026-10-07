import { Download, Search, SlidersHorizontal } from "lucide-react";
const sales=[
 ["#VP-1048","João Silva","Curso Premium","R$ 297,00","PIX","Aprovado","07/10/2026 11:32"],
 ["#VP-1047","Maria Oliveira","Mentoria Individual","R$ 997,00","Cartão","Aprovado","07/10/2026 10:18"],
 ["#VP-1046","Carlos Souza","Curso Premium","R$ 297,00","PIX","Pendente","07/10/2026 09:54"],
 ["#VP-1045","Ana Costa","Pack Templates","R$ 47,00","Cartão","Aprovado","06/10/2026 22:41"],
 ["#VP-1044","Lucas Lima","Curso Premium","R$ 297,00","Cartão","Reembolsado","06/10/2026 19:12"],
];
export default function Sales(){return <section>
 <header className="page-heading"><div><p className="eyebrow">OPERAÇÃO</p><h1>Vendas</h1><p className="muted">Acompanhe pedidos e pagamentos em um só lugar.</p></div><button className="ghost-button action-inline"><Download size={15}/> Exportar</button></header>
 <div className="product-stats"><div className="mini-stat"><span>Vendas hoje</span><strong>R$ 2.974,00</strong></div><div className="mini-stat"><span>Aprovadas</span><strong>24</strong></div><div className="mini-stat"><span>Conversão</span><strong>7,4%</strong></div></div>
 <article className="panel"><div className="product-toolbar"><div className="search-box"><Search size={16}/><input placeholder="Buscar pedido ou cliente..."/></div><button className="ghost-button action-inline"><SlidersHorizontal size={15}/> Filtros</button></div>
 <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Produto</th><th>Valor</th><th>Método</th><th>Status</th><th>Data</th></tr></thead><tbody>{sales.map(x=><tr key={x[0]}>{x.slice(0,5).map((v,i)=><td key={i}>{v}</td>)}<td><span className={x[5]==="Aprovado"?"status ok":x[5]==="Pendente"?"status pending":"status inactive"}>{x[5]}</span></td><td>{x[6]}</td></tr>)}</tbody></table></div></article>
 </section>}