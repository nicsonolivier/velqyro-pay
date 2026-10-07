import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./env";

/** Antes dos testes: cria o banco de testes, se faltar, e aplica as migrations. */
export default function globalSetup(): void {
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: testDatabaseUrl() } });
}
