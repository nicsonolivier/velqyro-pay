import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "./tokens";

/** TOTP (RFC 6238) com HMAC-SHA1, 6 dígitos e passo de 30 segundos: o padrão dos aplicativos autenticadores. */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secretBase32: string, counter: number, digits = DIGITS): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totp(secretBase32: string, atMs: number = Date.now()): string {
  return hotp(secretBase32, totpStep(atMs));
}

/** Passo de tempo (contador do TOTP) em que um instante cai. */
export function totpStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / STEP_SECONDS);
}

/**
 * Diz em qual passo de tempo o código vale, ou null quando não vale em nenhum.
 * Aceita o passo atual e os vizinhos (um para trás e um para frente), para tolerar relógio fora de hora.
 * Quem chama guarda o passo devolvido para recusar o mesmo código uma segunda vez.
 */
export function matchTotpStep(secretBase32: string, code: string, atMs: number = Date.now(), window = 1): number | null {
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length !== DIGITS) return null;
  const counter = totpStep(atMs);
  let matched: number | null = null;
  // Percorre todos os passos mesmo depois de achar, para o tempo de resposta não revelar qual bateu.
  for (let i = -window; i <= window; i++) {
    if (safeEqual(hotp(secretBase32, counter + i), clean)) matched = counter + i;
  }
  return matched;
}

export function verifyTotp(secretBase32: string, code: string, atMs: number = Date.now(), window = 1): boolean {
  return matchTotpStep(secretBase32, code, atMs, window) !== null;
}

/** Endereço otpauth:// lido pelos aplicativos autenticadores (vira QR Code no painel). */
export function otpauthUri(input: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const params = new URLSearchParams({ secret: input.secret, issuer: input.issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
