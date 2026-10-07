import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Cifra simétrica (AES-256-GCM) para segredos que precisam ser lidos de volta, como a chave do 2FA. */

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(boxed: string, key: Buffer): string {
  const [version, iv, tag, data] = boxed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Segredo cifrado em formato desconhecido.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
