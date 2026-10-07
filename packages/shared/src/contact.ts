import { onlyDigits } from "./documents";

export function normalizeEmail(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const v = normalizeEmail(value);
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular). */
export function isValidPhoneBR(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11) return false;
  return d.length === 10 || d[2] === "9";
}

export function formatPhoneBR(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const cut = d.length > 10 ? 7 : 6;
  if (d.length <= cut) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, cut)}-${d.slice(cut)}`;
}

/** Mostra só o começo e o fim: m***a@exemplo.com. */
export function maskEmail(value: string): string {
  const [user, domain] = normalizeEmail(value).split("@");
  if (!domain) return value;
  const shown = user.length <= 2 ? user[0] ?? "" : `${user[0]}***${user[user.length - 1]}`;
  return `${shown}@${domain}`;
}
