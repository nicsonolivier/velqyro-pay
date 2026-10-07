/**
 * Os testes de ponta a ponta apagam as tabelas antes de rodar.
 * Por isso usam sempre um banco próprio, nunca o DATABASE_URL de desenvolvimento.
 */
export const DEFAULT_TEST_DATABASE_URL = "postgresql://velqyro:velqyro_dev@localhost:5432/velqyro_test?schema=public";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL;
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) throw new Error(`TEST_DATABASE_URL precisa apontar para um banco terminado em "_test" (recebido: "${name}").`);
  return url;
}
