/** Leitura e validação das variáveis de ambiente. A API não sobe com configuração incompleta. */

export const DEV_ENCRYPTION_KEY = "ZGV2LW9ubHktbmFvLXVzYXItZW0tcHJvZHVjYW8hISE=";

export interface Env {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  appUrl: string;
  webOrigins: string[];
  sessionCookieName: string;
  sessionTtlDays: number;
  cookieSecure: boolean;
  encryptionKey: Buffer;
  trustProxyHops: number;
}

let cached: Env | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Variável de ambiente obrigatória ausente: ${name}. Veja apps/api/.env.example.`);
  return value.trim();
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Variável ${name} precisa ser um número inteiro não negativo.`);
  return n;
}

export function loadEnv(): Env {
  if (cached) return cached;
  try {
    // Lê apps/api/.env quando existir. Em produção as variáveis vêm do ambiente.
    process.loadEnvFile(".env");
  } catch {
    // Sem arquivo .env: segue com o que já está no ambiente.
  }

  const nodeEnvRaw = process.env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnvRaw)) throw new Error("NODE_ENV precisa ser development, test ou production.");
  const nodeEnv = nodeEnvRaw as Env["nodeEnv"];

  const keyRaw = required("APP_ENCRYPTION_KEY");
  const encryptionKey = Buffer.from(keyRaw, "base64");
  if (encryptionKey.length !== 32) throw new Error("APP_ENCRYPTION_KEY precisa ter 32 bytes em base64.");
  if (nodeEnv === "production" && keyRaw === DEV_ENCRYPTION_KEY) throw new Error("APP_ENCRYPTION_KEY de desenvolvimento não pode ser usada em produção.");

  const cookieSecure = (process.env.COOKIE_SECURE ?? "false") === "true";
  if (nodeEnv === "production" && !cookieSecure) throw new Error("Em produção COOKIE_SECURE precisa ser true.");

  const appUrl = required("APP_URL").replace(/\/+$/, "");
  const webOrigins = (process.env.WEB_ORIGINS ?? appUrl)
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  cached = {
    nodeEnv,
    port: integer("PORT", 3333),
    databaseUrl: required("DATABASE_URL"),
    appUrl,
    webOrigins,
    sessionCookieName: process.env.SESSION_COOKIE_NAME?.trim() || "vq_session",
    sessionTtlDays: integer("SESSION_TTL_DAYS", 7) || 7,
    cookieSecure,
    encryptionKey,
    trustProxyHops: integer("TRUST_PROXY_HOPS", 0),
  };
  return cached;
}

/** Só para testes: força nova leitura do ambiente. */
export function resetEnvCache(): void {
  cached = null;
}
