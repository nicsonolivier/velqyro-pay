import { FormEvent, useState } from "react";
import { ArrowLeft, Building2, Check, Eye, EyeOff, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";

export type AuthView = "login" | "register" | "forgot" | "onboarding";

type Props = {
  view: AuthView;
  setView: (view: AuthView) => void;
  onEnter: () => void;
};

function Logo() {
  return (
    <div className="auth-logo">
      <div className="brand-mark">V</div>
      <div><strong>VELQYRO</strong><span>PAY</span></div>
    </div>
  );
}

export default function Auth({ view, setView, onEnter }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (view === "login") onEnter();
    if (view === "register") setView("onboarding");
    if (view === "forgot") setSent(true);
  }

  if (view === "onboarding") {
    return (
      <main className="auth-page">
        <section className="auth-visual">
          <Logo />
          <div className="auth-copy">
            <span className="eyebrow">CONFIGURAÇÃO INICIAL</span>
            <h1>Prepare sua conta para começar a vender.</h1>
            <p>Complete os dados básicos do negócio. A verificação documental será conectada ao provedor financeiro em uma próxima etapa.</p>
          </div>
          <div className="trust-row"><ShieldCheck size={18} /> Ambiente preparado para segurança e conformidade</div>
        </section>
        <section className="auth-form-side">
          <div className="auth-card wide">
            <div className="step-indicator"><span className="done"><Check size={14}/></span><i/><span>2</span></div>
            <span className="eyebrow">PASSO 2 DE 2</span>
            <h2>Conte sobre o seu negócio</h2>
            <p className="muted">Esses dados poderão ser alterados nas configurações.</p>
            <form onSubmit={(e) => { e.preventDefault(); onEnter(); }} className="form-grid">
              <label className="full">Nome do negócio<div className="input-shell"><Building2 size={17}/><input required placeholder="Ex.: Minha Empresa" /></div></label>
              <label>Tipo de cadastro<select required defaultValue=""><option value="" disabled>Selecione</option><option>Pessoa física</option><option>Pessoa jurídica</option></select></label>
              <label>Documento<input required placeholder="CPF ou CNPJ" /></label>
              <label className="full">Segmento<select required defaultValue=""><option value="" disabled>Selecione seu segmento</option><option>Produtos digitais</option><option>Serviços</option><option>E-commerce</option><option>Educação</option><option>Outro</option></select></label>
              <button className="primary-button full" type="submit">Concluir e acessar painel</button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Logo />
        <div className="auth-copy">
          <span className="eyebrow">PAGAMENTOS QUE IMPULSIONAM</span>
          <h1>Venda. Receba. Cresça.</h1>
          <p>Uma experiência de pagamentos pensada para negócios digitais que querem simplicidade, controle e conversão.</p>
          <div className="auth-feature"><Check size={16}/> Checkout otimizado para conversão</div>
          <div className="auth-feature"><Check size={16}/> PIX e cartão em uma única experiência</div>
          <div className="auth-feature"><Check size={16}/> Dashboard claro e acompanhamento em tempo real</div>
        </div>
        <div className="trust-row"><LockKeyhole size={18}/> Segurança desde a arquitetura</div>
      </section>

      <section className="auth-form-side">
        <div className="auth-card">
          {view === "forgot" && <button className="back-link" onClick={() => {setSent(false); setView("login");}}><ArrowLeft size={16}/> Voltar</button>}
          <span className="eyebrow">{view === "login" ? "BEM-VINDO DE VOLTA" : view === "register" ? "COMECE AGORA" : "RECUPERAR ACESSO"}</span>
          <h2>{view === "login" ? "Entre na sua conta" : view === "register" ? "Crie sua conta" : "Esqueceu sua senha?"}</h2>
          <p className="muted">{view === "forgot" ? "Informe seu e-mail e enviaremos as instruções de recuperação." : "Acesse a plataforma VELQYRO PAY."}</p>

          {sent ? (
            <div className="success-box"><Mail size={22}/><div><strong>Confira seu e-mail</strong><p>Se houver uma conta cadastrada, você receberá as instruções de recuperação.</p></div></div>
          ) : (
            <form onSubmit={submit} className="auth-form">
              {view === "register" && <>
                <label>Nome completo<div className="input-shell"><UserRound size={17}/><input required placeholder="Seu nome completo"/></div></label>
                <label>Telefone<div className="input-shell"><Phone size={17}/><input required type="tel" placeholder="(00) 00000-0000"/></div></label>
              </>}
              <label>E-mail<div className="input-shell"><Mail size={17}/><input required type="email" placeholder="voce@empresa.com"/></div></label>
              {view !== "forgot" && <label>Senha<div className="input-shell"><LockKeyhole size={17}/><input required minLength={8} type={showPassword ? "text" : "password"} placeholder="Mínimo de 8 caracteres"/><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>}
              {view === "login" && <button type="button" className="text-button forgot" onClick={() => setView("forgot")}>Esqueci minha senha</button>}
              {view === "register" && <label className="terms"><input required type="checkbox"/> <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span></label>}
              <button className="primary-button" type="submit">{view === "login" ? "Entrar" : view === "register" ? "Criar minha conta" : "Enviar instruções"}</button>
            </form>
          )}

          {view !== "forgot" && <div className="auth-switch">{view === "login" ? "Ainda não tem conta?" : "Já possui uma conta?"}<button onClick={() => setView(view === "login" ? "register" : "login")}>{view === "login" ? "Criar conta" : "Entrar"}</button></div>}
          <p className="prototype-note">Protótipo local: autenticação real será conectada ao backend.</p>
        </div>
      </section>
    </main>
  );
}
