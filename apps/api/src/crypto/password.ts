import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Hash de senha com scrypt (função derivadora com custo de memória, nativa do Node).
 * Parâmetros da recomendação da OWASP: N=2^15, r=8, p=3.
 * O formato guarda os parâmetros junto do hash, então dá para endurecer depois e
 * regravar a senha no próximo login (ver needsRehash).
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, N: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keyLength, { N, r, p, maxmem: 256 * N * r }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, PARAMS.N, PARAMS.r, PARAMS.p, KEY_LENGTH);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > 2 ** 20) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (!salt.length || !expected.length) return false;
  const actual = await derive(password, salt, N, r, p, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Verdadeiro quando o hash guardado usa parâmetros mais fracos que os atuais. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < PARAMS.N || Number(parts[2]) < PARAMS.r || Number(parts[3]) < PARAMS.p;
}

/**
 * Hash usado quando o e-mail não existe, para o login gastar o mesmo tempo
 * e não revelar quais e-mails têm conta.
 */
let dummy: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  if (!dummy) dummy = hashPassword(randomBytes(18).toString("base64"));
  return dummy;
}
