/**
 * Carga de demonstração para desenvolvimento: uma conta de lojista com equipe.
 * Rode com "npm run db:seed". Só roda com NODE_ENV=development ou NODE_ENV=test declarado.
 */
import { PrismaClient } from "@prisma/client";
import type { MemberRole } from "@prisma/client";
import { hashPassword } from "../src/crypto/password";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "velqyro123";

async function upsertUser(name: string, email: string, phone: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, phone, passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), termsAcceptedAt: new Date() },
  });
}

async function main(): Promise<void> {
  // NODE_ENV ausente conta como produção, igual à API.
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    throw new Error("A carga de demonstração só roda com NODE_ENV=development ou NODE_ENV=test.");
  }

  const marina = await upsertUser("Marina Albuquerque", "marina@exemplo.com", "11988224410");
  const rafael = await upsertUser("Rafael Tavares", "rafael@exemplo.com", "11988224411");
  const bianca = await upsertUser("Bianca Moreira", "bianca@exemplo.com", "11988224412");

  // O documento não é único no banco, então a carga procura a organização antes de criar.
  const org =
    (await prisma.organization.findFirst({ where: { document: "11222333000181" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.organization.create({
      data: { name: "Estúdio Pixel Norte", legalName: "Pixel Norte Serviços Digitais Ltda.", type: "PJ", document: "11222333000181", segment: "ONLINE", status: "ACTIVE" },
    }));

  const team: Array<[string, MemberRole]> = [
    [marina.id, "OWNER"],
    [rafael.id, "FINANCE"],
    [bianca.id, "DEVELOPER"],
  ];
  for (const [userId, role] of team) {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId } },
      update: {},
      create: { organizationId: org.id, userId, role },
    });
  }

  console.log("Carga de demonstração pronta.");
  console.log(`  Organização: ${org.name}`);
  console.log(`  Contas (senha "${DEMO_PASSWORD}"): marina@exemplo.com (Proprietário), rafael@exemplo.com (Financeiro), bianca@exemplo.com (Desenvolvedor)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
