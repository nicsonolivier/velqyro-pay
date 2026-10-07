import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Info, ShieldAlert, X } from "lucide-react";

/* Componentes pequenos e reutilizáveis do painel. Usam as classes do design system em styles.css. */

export function Spinner({ label = "Carregando" }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function FullPageLoading() {
  return (
    <main className="center-screen">
      <Spinner />
    </main>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ""} ${error ? "has-error" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "success" | "warning" | "error"; children: ReactNode }) {
  const Icon = kind === "success" ? Check : kind === "info" ? Info : ShieldAlert;
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon size={17} />
      <div>{children}</div>
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "ok" | "pending" | "inactive" | "neutral" | "danger" | "purple"; children: ReactNode }) {
  const cls = tone === "ok" ? "status ok" : tone === "pending" ? "status pending" : tone === "danger" ? "status danger" : tone === "purple" ? "status purple-tone" : "status inactive";
  return <span className={cls}>{children}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{text}</span>
      {action}
    </div>
  );
}

export function SubmitButton({ busy, children, className = "primary-button" }: { busy: boolean; children: ReactNode; className?: string }) {
  return (
    <button className={className} type="submit" disabled={busy} aria-busy={busy}>
      {busy ? "Aguarde..." : children}
    </button>
  );
}

export function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button className="icon-menu" onClick={onClose} aria-label="Fechar" type="button">
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Confirmação antes de uma ação importante. A ação só roda depois do segundo clique. */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="product-form" onSubmit={submit}>
        <p className="muted confirm-text">{text}</p>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton busy={busy} className={danger ? "danger-action" : "primary-action"}>
            {confirmLabel}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copiado");
    } catch {
      toast("Não foi possível copiar. Selecione o texto e copie manualmente.", "error");
    }
  }
  return (
    <button type="button" className="ghost-button action-inline" onClick={copy}>
      <Copy size={14} /> {label}
    </button>
  );
}

/* ---------- Avisos rápidos (toasts) ---------- */

type ToastKind = "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}
const ToastContext = createContext<((message: string, kind?: ToastKind) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, kind: ToastKind = "success") => {
    const id = nextId.current++;
    setItems((list) => [...list, { id, message, kind }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4000);
  }, []);

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            {t.kind === "success" ? <Check size={16} /> : <ShieldAlert size={16} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast precisa estar dentro de ToastProvider.");
  return push;
}
