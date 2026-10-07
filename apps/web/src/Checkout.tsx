import { useState } from "react";
import { Check, Copy, CreditCard, ExternalLink, QrCode, ShieldCheck, Smartphone } from "lucide-react";

export default function Checkout(){
 const [product,setProduct]=useState("Curso Premium");
 const [title,setTitle]=useState("Finalize sua compra");
 const [description,setDescription]=useState("Você está a um passo de garantir seu acesso.");
 const [pix,setPix]=useState(true);
 const [card,setCard]=useState(true);
 const [coupon,setCoupon]=useState(false);
 const [saved,setSaved]=useState(false);
 const price=product==="Mentoria Individual"?"R$ 997,00":product==="Pack Templates"?"R$ 47,00":"R$ 297,00";
 function save(){setSaved(true);setTimeout(()=>setSaved(false),1800)}
 return <section className="checkout-builder">
  <header className="page-heading">
   <div><p className="eyebrow">CHECKOUT BUILDER</p><h1>Checkout</h1><p className="muted">Configure a experiência de pagamento e acompanhe o preview em tempo real.</p></div>
   <div className="builder-actions"><button className="ghost-button"><ExternalLink size={15}/> Visualizar</button><button className="primary-action" onClick={save}>{saved?<><Check size={16}/> Salvo</>: "Salvar alterações"}</button></div>
  </header>
  <div className="builder-grid">
   <div className="builder-controls">
    <article className="panel config-card">
     <p className="eyebrow">OFERTA</p><h2>Produto e conteúdo</h2>
     <label>Produto<select value={product} onChange={e=>setProduct(e.target.value)}><option>Curso Premium</option><option>Mentoria Individual</option><option>Pack Templates</option></select></label>
     <label>Título<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
     <label>Descrição<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    </article>
    <article className="panel config-card">
     <p className="eyebrow">PAGAMENTO</p><h2>Métodos aceitos</h2>
     <button className={pix?"method-option selected":"method-option"} onClick={()=>setPix(!pix)}><span className="method-icon"><QrCode size={18}/></span><span><strong>PIX</strong><small>Pagamento instantâneo</small></span><i>{pix&&<Check size={14}/>}</i></button>
     <button className={card?"method-option selected":"method-option"} onClick={()=>setCard(!card)}><span className="method-icon"><CreditCard size={18}/></span><span><strong>Cartão de crédito</strong><small>Parcelamento será definido pelo PSP</small></span><i>{card&&<Check size={14}/>}</i></button>
     <label className="switch-line"><span><strong>Cupom de desconto</strong><small>Permitir código promocional</small></span><button className={coupon?"toggle on":"toggle"} onClick={()=>setCoupon(!coupon)}><i/></button></label>
    </article>
    <div className="security-note"><ShieldCheck size={18}/><span><strong>Arquitetura segura</strong> Dados brutos de cartão não serão armazenados pela VELQYRO PAY. O processamento será conectado via tokenização/hosted fields do PSP.</span></div>
   </div>
   <div className="preview-column">
    <div className="preview-label"><Smartphone size={15}/> Preview do checkout</div>
    <div className="checkout-preview">
     <div className="checkout-brand"><div className="brand-mark mini">V</div><strong>VELQYRO <span>PAY</span></strong></div>
     <div className="preview-product"><div className="preview-cover">V</div><div><span>{product}</span><strong>{price}</strong></div></div>
     <h2>{title}</h2><p>{description}</p>
     <div className="fake-field">Nome completo</div><div className="fake-field">E-mail</div><div className="fake-fields"><div className="fake-field">CPF</div><div className="fake-field">Telefone</div></div>
     <span className="preview-section-title">Como você quer pagar?</span>
     <div className="pay-tabs">{pix&&<button className="selected"><QrCode size={16}/> PIX</button>}{card&&<button><CreditCard size={16}/> Cartão</button>}</div>
     {pix&&<div className="pix-box"><div className="qr-placeholder"><QrCode size={62}/></div><div><strong>Pagamento via PIX</strong><span>QR Code demonstrativo</span><button><Copy size={13}/> Copiar código PIX</button></div></div>}
     {coupon&&<div className="coupon-preview">Adicionar cupom de desconto</div>}
     <button className="checkout-pay">Pagar {price}</button>
     <div className="checkout-safe"><ShieldCheck size={13}/> Ambiente seguro • Pagamento protegido</div>
    </div>
   </div>
  </div>
 </section>
}