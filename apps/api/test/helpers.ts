import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { hotp, totpStep } from "../src/crypto/totp";
import { PrismaService } from "../src/prisma/prisma.service";

export type Agent = ReturnType<typeof request.agent>;

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  /** Um "navegador" novo, com seu próprio pote de cookies. */
  browser: () => Agent;
  close: () => Promise<void>;
}

export async function startTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  return { app, prisma, browser: () => request.agent(app.getHttpServer()), close: () => app.close() };
}

/**
 * Esvazia as tabelas, menos a auditoria: o banco recusa TRUNCATE em audit_logs.
 * Por isso os testes sempre filtram a auditoria pela organização ou pelo usuário que eles mesmos criaram.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "organizations", "sessions", "verification_tokens", "two_factor_methods", "recovery_codes", "organization_members", "invitations", "outbox_messages" CASCADE',
  );
}

/** Última mensagem da caixa de saída para um destinatário. */
export async function lastMessage(prisma: PrismaService, recipient: string): Promise<string> {
  const message = await prisma.outboxMessage.findFirst({ where: { recipient }, orderBy: { createdAt: "desc" } });
  if (!message) throw new Error(`Nenhuma mensagem na caixa de saída para ${recipient}`);
  return message.body;
}

export function extract(body: string, pattern: RegExp): string {
  const match = body.match(pattern);
  if (!match) throw new Error(`Padrão ${pattern} não encontrado em: ${body}`);
  return match[1];
}

export const PASSWORD = "Senha1234";

let phoneSeq = 0;
export interface Person {
  name: string;
  email: string;
  agent: Agent;
}

/** Cadastra uma pessoa, confirma o e-mail pelo link da caixa de saída e devolve o navegador já logado. */
export async function signUp(t: TestApp, name: string, email: string): Promise<Person> {
  const agent = t.browser();
  phoneSeq += 1;
  const phone = `(11) 9${String(10000000 + phoneSeq).slice(0, 4)}-${String(1000 + phoneSeq)}`;
  await agent.post("/api/auth/register").send({ name, email, phone, password: PASSWORD, acceptTerms: true }).expect(201);
  const token = extract(await lastMessage(t.prisma, email), /verificar-email\?token=([\w-]+)/);
  await agent.post("/api/auth/email/verify").send({ token }).expect(200);
  return { name, email, agent };
}

export const CNPJS = ["11.222.333/0001-81", "45.723.174/0001-10", "06.990.590/0001-23"];

export async function createOrganization(person: Person, name: string, document: string): Promise<string> {
  const res = await person.agent.post("/api/organizations").send({ name, type: "PJ", document, segment: "ONLINE" }).expect(201);
  return res.body.id as string;
}

/**
 * Gerador de códigos TOTP para um segredo. Cada chamada devolve o código de um passo de tempo maior
 * que o da chamada anterior, porque a API aceita cada passo uma única vez.
 * Só usa o passo atual e o seguinte: os dois valem na janela do servidor mesmo que o relógio vire
 * de passo entre o cálculo e a requisição. Quem precisar de um terceiro código em seguida usa um código de recuperação.
 */
export function totpCodes(secret: string): () => string {
  let last = 0;
  return () => {
    const current = totpStep();
    const step = Math.max(current, last + 1);
    if (step > current + 1) throw new Error("Mais de dois códigos TOTP no mesmo passo de tempo. Use um código de recuperação.");
    last = step;
    return hotp(secret, step);
  };
}

/** Um código de 6 dígitos que com certeza não vale para o segredo agora nem nos passos vizinhos. */
export function wrongTotp(secret: string): string {
  const current = totpStep();
  const valid = new Set([-2, -1, 0, 1, 2, 3].map((delta) => hotp(secret, current + delta)));
  let n = 0;
  while (valid.has(String(n).padStart(6, "0"))) n += 1;
  return String(n).padStart(6, "0");
}

export interface TwoFactorSetup {
  secret: string;
  recoveryCodes: string[];
  /** Próximo código TOTP válido (ver totpCodes). */
  nextCode: () => string;
  /** O código que ativou o 2FA, já gasto. */
  enablingCode: string;
}

/** Ativa o 2FA de quem já está logado. */
export async function enableTwoFactor(person: Person): Promise<TwoFactorSetup> {
  const setup = await person.agent.post("/api/account/2fa/setup").send({ password: PASSWORD }).expect(200);
  const secret = setup.body.secret as string;
  const nextCode = totpCodes(secret);
  const enablingCode = nextCode();
  const enabled = await person.agent.post("/api/account/2fa/enable").send({ code: enablingCode }).expect(200);
  return { secret, recoveryCodes: enabled.body.recoveryCodes as string[], nextCode, enablingCode };
}
