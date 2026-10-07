import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Token aleatório para links e sessões. Só o hash vai para o banco. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Código numérico de tamanho fixo, com zeros à esquerda. */
export function randomDigits(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String(randomInt(0, 10));
  return out;
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0, O, 1 e I para não confundir

/** Código de recuperação do 2FA no formato XXXXX-XXXXX. */
export function randomRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(0, RECOVERY_ALPHABET.length)];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function normalizeRecoveryCode(value: string): string {
  const raw = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 10 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
