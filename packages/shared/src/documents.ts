/** Validação e formatação de CPF e CNPJ. Guarda a forma normalizada e formata só para exibir. */

export function onlyDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function allSame(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || allSame(d)) return false;
  const n = d.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += n[i] * (10 - i);
  let dv1 = 11 - (sum % 11);
  if (dv1 > 9) dv1 = 0;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += n[i] * (11 - i);
  let dv2 = 11 - (sum % 11);
  if (dv2 > 9) dv2 = 0;
  return dv1 === n[9] && dv2 === n[10];
}

/**
 * Deixa o CNPJ só com os 14 caracteres que contam, em maiúsculas.
 * Desde julho de 2026 a Receita Federal emite CNPJ com letras nas 12 primeiras posições.
 */
export function normalizeCnpj(value: string | null | undefined): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

/**
 * Valida CNPJ numérico e alfanumérico. O cálculo é o mesmo: cada caractere vale o seu código
 * ASCII menos 48, então "0" a "9" valem 0 a 9 e "A" a "Z" valem 17 a 42.
 */
export function isValidCnpj(value: string): boolean {
  const c = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1+$/.test(c)) return false;
  const n = c.split("").map((ch) => ch.charCodeAt(0) - 48);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, ...w1];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += n[i] * w1[i];
  const dv1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  sum = 0;
  for (let i = 0; i < 13; i++) sum += n[i] * w2[i];
  const dv2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return dv1 === n[12] && dv2 === n[13];
}

export type DocumentKind = "PF" | "PJ";

/** PF exige CPF e PJ exige CNPJ. */
export function isValidDocument(kind: DocumentKind, value: string): boolean {
  return kind === "PF" ? isValidCpf(value) : isValidCnpj(value);
}

function applyPattern(chars: string, pattern: string): string {
  let out = "";
  let i = 0;
  for (const ch of pattern) {
    if (i >= chars.length) break;
    out += ch === "#" ? chars[i++] : ch;
  }
  return out;
}

export function formatCpf(value: string): string {
  return applyPattern(onlyDigits(value).slice(0, 11), "###.###.###-##");
}

export function formatCnpj(value: string): string {
  return applyPattern(normalizeCnpj(value).slice(0, 14), "##.###.###/####-##");
}

/** Forma guardada no banco: CPF só com dígitos; CNPJ com 14 caracteres em maiúsculas. */
export function normalizeDocument(kind: DocumentKind, value: string): string {
  return kind === "PF" ? onlyDigits(value) : normalizeCnpj(value);
}

/** Formata um documento já normalizado: 11 dígitos é CPF, o resto é CNPJ. */
export function formatDocument(value: string): string {
  const c = normalizeCnpj(value);
  return /^\d{0,11}$/.test(c) ? formatCpf(c) : formatCnpj(c);
}

/** Esconde parte do documento para listagens: ***.456.789-** ou **.345.678/****-**. */
export function maskDocument(value: string): string {
  const c = normalizeCnpj(value);
  if (/^\d{11}$/.test(c)) return `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;
  if (c.length === 14) return `**.${c.slice(2, 5)}.${c.slice(5, 8)}/****-**`;
  return value;
}
