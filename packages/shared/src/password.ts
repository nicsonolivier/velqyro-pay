export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Lista, em português, o que falta para a senha ser aceita. Lista vazia significa senha válida. */
export function passwordIssues(password: string): string[] {
  const p = String(password ?? "");
  const issues: string[] = [];
  if (p.length < PASSWORD_MIN_LENGTH) issues.push(`Use ao menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  if (p.length > PASSWORD_MAX_LENGTH) issues.push(`Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
  if (!/[A-Za-zÀ-ÿ]/.test(p)) issues.push("Inclua ao menos uma letra.");
  if (!/\d/.test(p)) issues.push("Inclua ao menos um número.");
  return issues;
}

export const PASSWORD_STRENGTH_LABEL = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"] as const;

/** Nota de 0 a 4 para o medidor de força. Não substitui passwordIssues. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  const p = String(password ?? "");
  let score = 0;
  if (p.length >= PASSWORD_MIN_LENGTH) score++;
  if (p.length >= 12) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
