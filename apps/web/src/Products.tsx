import { FormEvent, useState } from "react";
import { MoreVertical, Package, Plus, Search, X } from "lucide-react";

type Product = { id:number; name:string; type:string; price:number; sales:number; active:boolean };
const seed: Product[] = [
 {id:1,name:"Curso Premium",type:"Produto digital",price:297,sales:184,active:true},
 {id:2,name:"Mentoria Individual",type:"Serviço",price:997,sales:42,active:true},
 {id:3,name:"Pack Templates",type:"Produto digital",price:47,sales:319,active:true},
];

const money=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v);

export default function Products(){
 const [items,setItems]=useState<Product[]>(seed);
 const [open,setOpen]=useState(false);
 const [search,setSearch]=useState("");
 const filtered=items.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()));

 function create(e:FormEvent<HTMLFormElement>){
   e.preventDefault();
   const fd=new FormData(e.currentTarget);
   const price=Number(String(fd.get("price")).replace(",","."));
   setItems(x=>[{id:Date.now(),name:String(fd.get("name")),type:String(fd.get("type")),price,sales:0,active:true},...x]);
   setOpen(false);
 }
 return <section className="products-page">
   <header className="page-heading">
    <div><p className="eyebrow">CATÁLOGO</p><h1>Produtos</h1><p className="muted">Gerencie o que você vende e prepare cada oferta para o checkout.</p></div>
    <button className="primary-action" onClick={()=>setOpen(true)}><Plus size={17}/> Novo produto</button>
   </header>
   <div className="product-stats">
    <div className="mini-stat"><span>Produtos</span><strong>{items.length}</strong></div>
    <div className="mini-stat"><span>Ativos</span><strong>{items.filter(x=>x.active).length}</strong></div>
    <div className="mini-stat"><span>Vendas acumuladas</span><strong>{items.reduce((a,b)=>a+b.sales,0)}</strong></div>
   </div>
   <article className="panel">
    <div className="product-toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar produto..."/></div><span className="muted">{filtered.length} resultado(s)</span></div>
    <div className="product-list">
     {filtered.map(p=><div className="product-row" key={p.id}>
       <div className="product-thumb"><Package size={20}/></div>
       <div className="product-info"><strong>{p.name}</strong><span>{p.type}</span></div>
       <div className="product-cell"><span>Preço</span><strong>{money(p.price)}</strong></div>
       <div className="product-cell"><span>Vendas</span><strong>{p.sales}</strong></div>
       <button className={p.active?"toggle on":"toggle"} aria-label="Alterar status" onClick={()=>setItems(xs=>xs.map(x=>x.id===p.id?{...x,active:!x.active}:x))}><i/></button>
       <span className={p.active?"status ok":"status inactive"}>{p.active?"Ativo":"Inativo"}</span>
       <button className="icon-menu"><MoreVertical size={18}/></button>
     </div>)}
     {!filtered.length&&<div className="empty-state"><Package size={28}/><strong>Nenhum produto encontrado</strong><span>Tente outro termo ou cadastre um novo produto.</span></div>}
    </div>
   </article>
   {open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)}><div className="modal-card" onMouseDown={e=>e.stopPropagation()}>
     <div className="modal-head"><div><p className="eyebrow">NOVO PRODUTO</p><h2>Cadastre sua oferta</h2></div><button className="icon-menu" onClick={()=>setOpen(false)}><X size={19}/></button></div>
     <form className="product-form" onSubmit={create}>
      <label>Nome do produto<input name="name" required placeholder="Ex.: Curso Marketing Digital"/></label>
      <label>Tipo<select name="type" required defaultValue="Produto digital"><option>Produto digital</option><option>Produto físico</option><option>Serviço</option></select></label>
      <label>Preço (R$)<input name="price" required inputMode="decimal" placeholder="297,00"/></label>
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary-action" type="submit">Criar produto</button></div>
     </form>
   </div></div>}
 </section>
}