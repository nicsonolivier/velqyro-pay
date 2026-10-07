import { Search, Users } from "lucide-react";
const customers=[
 ["João Silva","joao@email.com","(21) 99999-1020","3","R$ 891,00","07/10/2026"],
 ["Maria Oliveira","maria@email.com","(11) 98888-2040","2","R$ 1.294,00","07/10/2026"],
 ["Ana Costa","ana@email.com","(31) 97777-3050","7","R$ 529,00","06/10/2026"],
 ["Lucas Lima","lucas@email.com","(41) 96666-4060","1","R$ 297,00","06/10/2026"],
];
export default function Customers(){return <section>
<header className="page-heading"><div><p className="eyebrow">RELACIONAMENTO</p><h1>Clientes</h1><p className="muted">Conheça quem compra e acompanhe o histórico da sua base.</p></div></header>
<div className="product-stats"><div className="mini-stat"><span>Total de clientes</span><strong>1.248</strong></div><div className="mini-stat"><span>Novos este mês</span><strong>184</strong></div><div className="mini-stat"><span>Ticket médio</span><strong>R$ 237,46</strong></div></div>
<article className="panel"><div className="product-toolbar"><div className="search-box"><Search size={16}/><input placeholder="Buscar nome, e-mail ou telefone..."/></div></div><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Telefone</th><th>Compras</th><th>Total gasto</th><th>Última compra</th></tr></thead><tbody>{customers.map((x,i)=><tr key={x[1]}><td><span className="customer-name"><i><Users size={13}/></i>{x[0]}</span></td>{x.slice(1).map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div></article>
</section>}