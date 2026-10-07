/** Validação e formatação de CPF e CNPJ. Trabalha sempre com dígitos e formata só para exibir. */

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

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || allSame(d)) return false;
  const n = d.split("").map(Number);
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

function applyPattern(digits: string, pattern: string): string {
  let out = "";
  let i = 0;
  for (const ch of pattern) {
    if (i >= digits.length) break;
    out += ch === "#" ? digits[i++] : ch;
  }
  return out;
}

export function formatCpf(value: string): string {
  return applyPattern(onlyDigits(value).slice(0, 11), "###.###.###-##");
}

export function formatCnpj(value: string): string {
  return applyPattern(onlyDigits(value).slice(0, 14), "##.###.###/####-##");
}

/** Formata conforme o tamanho: até 11 dígitos é CPF, acima é CNPJ. */
export function formatDocument(value: string): string {
  const d = onlyDigits(value);
  return d.length > 11 ? formatCnpj(d) : formatCpf(d);
}

/** Esconde parte do documento para listagens: ***.456.789-** ou **.345.678/****-**. */
export function maskDocument(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
  return value;
}
