import { DEV_ENCRYPTION_KEY, loadEnv, resetEnvCache } from "./env";

describe("variáveis de ambiente", () => {
  const original = { ...process.env };
  const productionKey = Buffer.alloc(32, 7).toString("base64");

  /** Carrega a configuração de uma produção válida, com as trocas pedidas. Valor vazio conta como variável ausente. */
  function load(overrides: Record<string, string> = {}) {
    Object.assign(process.env, { NODE_ENV: "production", APP_ENCRYPTION_KEY: productionKey, COOKIE_SECURE: "true", DEV_OUTBOX: "", TRUST_PROXY_HOPS: "1", ...overrides });
    resetEnvCache();
    return loadEnv();
  }

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete process.env[key];
    }
    Object.assign(process.env, original);
    resetEnvCache();
  });

  it("aceita uma configuração completa de produção", () => {
    expect(load()).toMatchObject({ nodeEnv: "production", cookieSecure: true, devOutbox: false, trustProxyHops: 1 });
  });

  it("trata NODE_ENV ausente como produção", () => {
    expect(load({ NODE_ENV: "" }).nodeEnv).toEqual("production");
    expect(() => load({ NODE_ENV: "", APP_ENCRYPTION_KEY: DEV_ENCRYPTION_KEY })).toThrow(/APP_ENCRYPTION_KEY/);
    expect(() => load({ NODE_ENV: "", COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
    expect(() => load({ NODE_ENV: "producao" })).toThrow(/NODE_ENV/);
  });

  it("só liga a caixa de saída com DEV_OUTBOX=true e nunca em produção", () => {
    expect(() => load({ DEV_OUTBOX: "true" })).toThrow(/DEV_OUTBOX/);
    expect(() => load({ NODE_ENV: "", DEV_OUTBOX: "true" })).toThrow(/DEV_OUTBOX/);
    expect(load({ NODE_ENV: "development", DEV_OUTBOX: "true" }).devOutbox).toBe(true);
    expect(load({ NODE_ENV: "test", DEV_OUTBOX: "true" }).devOutbox).toBe(true);
    expect(load({ NODE_ENV: "development" }).devOutbox).toBe(false);
    expect(load({ NODE_ENV: "development", DEV_OUTBOX: "1" }).devOutbox).toBe(false);
  });

  it("exige TRUST_PROXY_HOPS declarado em produção e usa 0 por padrão fora dela", () => {
    expect(() => load({ TRUST_PROXY_HOPS: "" })).toThrow(/TRUST_PROXY_HOPS/);
    expect(load({ TRUST_PROXY_HOPS: "0" }).trustProxyHops).toEqual(0);
    expect(load({ NODE_ENV: "development", TRUST_PROXY_HOPS: "" }).trustProxyHops).toEqual(0);
    expect(() => load({ TRUST_PROXY_HOPS: "dois" })).toThrow(/TRUST_PROXY_HOPS/);
  });
});
