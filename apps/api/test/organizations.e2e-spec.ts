import { randomUUID } from "node:crypto";
import { resetEnvCache } from "../src/config/env";
import { createOrganization, CNPJS, extract, lastMessage, PASSWORD, Person, signUp, startTestApp, TestApp } from "./helpers";

describe("Organizações, papéis e isolamento (ponta a ponta)", () => {
  let t: TestApp;
  let owner: Person;
  let outsider: Person;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    t = await startTestApp();
    owner = await signUp(t, "Marina Albuquerque", "marina@exemplo.com");
    outsider = await signUp(t, "Otávio Rezende", "otavio@exemplo.com");
    orgA = await createOrganization(owner, "Estúdio Pixel Norte", CNPJS[0]);
    orgB = await createOrganization(outsider, "Confeitaria com a Bia", CNPJS[1]);
  });
  afterAll(async () => {
    await t.close();
  });

  async function invite(email: string, role: string): Promise<string> {
    await owner.agent.post(`/api/organizations/${orgA}/invitations`).send({ email, role }).expect(201);
    return extract(await lastMessage(t.prisma, email), /convite\/([\w-]+)/);
  }

  async function memberIdOf(email: string): Promise<string> {
    const members = await owner.agent.get(`/api/organizations/${orgA}/members`).expect(200);
    return members.body.members.find((m: { user: { email: string } }) => m.user.email === email).id as string;
  }

  it("uma organização nunca enxerga os dados de outra", async () => {
    // Quem não é membro recebe 404, igual a uma organização que não existe.
    for (const path of ["", "/members", "/invitations", "/audit-logs"]) {
      const res = await outsider.agent.get(`/api/organizations/${orgA}${path}`).expect(404);
      expect(res.body.error.code).toEqual("organizacao_nao_encontrada");
    }
    await outsider.agent.get("/api/organizations/00000000-0000-4000-8000-000000000000").expect(404);
    await outsider.agent.get("/api/organizations/nao-e-um-id").expect(404);
    await outsider.agent.post(`/api/organizations/${orgA}/invitations`).send({ email: "x@exemplo.com", role: "ADMIN" }).expect(404);
    await outsider.agent.patch(`/api/organizations/${orgA}`).send({ name: "Invadida", segment: "ONLINE" }).expect(404);

    const mine = await outsider.agent.get("/api/organizations").expect(200);
    expect(mine.body.organizations.map((o: { id: string }) => o.id)).toEqual([orgB]);
  });

  it("não deixa mexer em membro de outra organização usando o ID dele", async () => {
    const membersA = await owner.agent.get(`/api/organizations/${orgA}/members`).expect(200);
    const ownerMemberId = membersA.body.members[0].id as string;
    // Otávio é proprietário da organização B e tenta alterar um membro da A pela rota da B.
    await outsider.agent.patch(`/api/organizations/${orgB}/members/${ownerMemberId}`).send({ role: "VIEWER" }).expect(404);
    await outsider.agent.delete(`/api/organizations/${orgB}/members/${ownerMemberId}`).expect(404);
  });

  it("convida por e-mail e só a conta convidada consegue aceitar", async () => {
    const bad = await owner.agent.post(`/api/organizations/${orgA}/invitations`).send({ email: "rafa@exemplo.com", role: "OWNER" }).expect(400);
    expect(bad.body.error.param).toEqual("role");

    const token = await invite("rafa@exemplo.com", "VIEWER");
    const dup = await owner.agent.post(`/api/organizations/${orgA}/invitations`).send({ email: "RAFA@exemplo.com", role: "ADMIN" }).expect(409);
    expect(dup.body.error.code).toEqual("convite_pendente");

    const preview = await t.browser().get(`/api/invitations/${token}`).expect(200);
    expect(preview.body).toMatchObject({ organizationName: "Estúdio Pixel Norte", email: "rafa@exemplo.com", role: "VIEWER" });

    const wrongAccount = await outsider.agent.post(`/api/invitations/${token}/accept`).expect(403);
    expect(wrongAccount.body.error.code).toEqual("convite_de_outro_email");

    const rafa = await signUp(t, "Rafael Tavares", "rafa@exemplo.com");
    const accepted = await rafa.agent.post(`/api/invitations/${token}/accept`).expect(200);
    expect(accepted.body).toMatchObject({ organizationId: orgA, role: "VIEWER" });
    await rafa.agent.post(`/api/invitations/${token}/accept`).expect(404);

    const again = await owner.agent.post(`/api/organizations/${orgA}/invitations`).send({ email: "rafa@exemplo.com", role: "ADMIN" }).expect(409);
    expect(again.body.error.code).toEqual("ja_e_membro");
  });

  it("aplica a matriz de papéis no servidor", async () => {
    const rafa = t.browser();
    await rafa.post("/api/auth/login").send({ email: "rafa@exemplo.com", password: PASSWORD }).expect(200);

    // Visualizador vê a organização, mas não a equipe, os convites nem a auditoria.
    await rafa.get(`/api/organizations/${orgA}`).expect(200);
    for (const path of ["/members", "/invitations", "/audit-logs"]) {
      const res = await rafa.get(`/api/organizations/${orgA}${path}`).expect(403);
      expect(res.body.error.code).toEqual("sem_permissao");
    }
    await rafa.post(`/api/organizations/${orgA}/invitations`).send({ email: "amigo@exemplo.com", role: "ADMIN" }).expect(403);
    await rafa.patch(`/api/organizations/${orgA}`).send({ name: "Outro nome", segment: "ONLINE" }).expect(403);

    // O proprietário promove para Administrador.
    const members = await owner.agent.get(`/api/organizations/${orgA}/members`).expect(200);
    const rafaMember = members.body.members.find((m: { user: { email: string } }) => m.user.email === "rafa@exemplo.com");
    const ownerMember = members.body.members.find((m: { role: string }) => m.role === "OWNER");
    await owner.agent.patch(`/api/organizations/${orgA}/members/${rafaMember.id}`).send({ role: "OWNER" }).expect(400);
    await owner.agent.patch(`/api/organizations/${orgA}/members/${rafaMember.id}`).send({ role: "ADMIN" }).expect(200);

    // Administrador gerencia a equipe, mas não altera os dados do negócio nem toca no proprietário.
    await rafa.get(`/api/organizations/${orgA}/members`).expect(200);
    await rafa.get(`/api/organizations/${orgA}/audit-logs`).expect(200);
    await rafa.patch(`/api/organizations/${orgA}`).send({ name: "Outro nome", segment: "ONLINE" }).expect(403);
    const protectedOwner = await rafa.patch(`/api/organizations/${orgA}/members/${ownerMember.id}`).send({ role: "VIEWER" }).expect(403);
    expect(protectedOwner.body.error.code).toEqual("proprietario_protegido");
    await rafa.delete(`/api/organizations/${orgA}/members/${ownerMember.id}`).expect(403);
    const self = await rafa.patch(`/api/organizations/${orgA}/members/${rafaMember.id}`).send({ role: "FINANCE" }).expect(403);
    expect(self.body.error.code).toEqual("proprio_papel");
    await rafa.delete(`/api/organizations/${orgA}/members/${rafaMember.id}`).expect(403);

    // Só o proprietário edita os dados do negócio.
    const updated = await owner.agent.patch(`/api/organizations/${orgA}`).send({ name: "Estúdio Pixel Norte Digital", segment: "CREATOR" }).expect(200);
    expect(updated.body).toMatchObject({ name: "Estúdio Pixel Norte Digital", segment: "CREATOR" });
  });

  it("reenvia e cancela convites, invalidando o link antigo", async () => {
    const first = await invite("bia@exemplo.com", "SUPPORT");
    const list = await owner.agent.get(`/api/organizations/${orgA}/invitations`).expect(200);
    const invitation = list.body.invitations.find((i: { email: string }) => i.email === "bia@exemplo.com");

    await owner.agent.post(`/api/organizations/${orgA}/invitations/${invitation.id}/resend`).expect(200);
    const second = extract(await lastMessage(t.prisma, "bia@exemplo.com"), /convite\/([\w-]+)/);
    expect(second).not.toEqual(first);
    await t.browser().get(`/api/invitations/${first}`).expect(404);
    await t.browser().get(`/api/invitations/${second}`).expect(200);

    await owner.agent.delete(`/api/organizations/${orgA}/invitations/${invitation.id}`).expect(200);
    await t.browser().get(`/api/invitations/${second}`).expect(404);
  });

  it("remove um membro e ele perde o acesso na hora", async () => {
    const token = await invite("caio@exemplo.com", "FINANCE");
    const caio = await signUp(t, "Caio Vieira", "caio@exemplo.com");
    await caio.agent.post(`/api/invitations/${token}/accept`).expect(200);
    await caio.agent.get(`/api/organizations/${orgA}`).expect(200);

    const members = await owner.agent.get(`/api/organizations/${orgA}/members`).expect(200);
    const caioMember = members.body.members.find((m: { user: { email: string } }) => m.user.email === "caio@exemplo.com");
    await owner.agent.delete(`/api/organizations/${orgA}/members/${caioMember.id}`).expect(200);
    await caio.agent.get(`/api/organizations/${orgA}`).expect(404);
  });

  it("um administrador não concede, altera nem remove um papel com mais poder que o dele", async () => {
    const admin = t.browser();
    await admin.post("/api/auth/login").send({ email: "rafa@exemplo.com", password: PASSWORD }).expect(200);
    const invitations = `/api/organizations/${orgA}/invitations`;

    // Convidar: o administrador não saca, então não cria ninguém no financeiro. Visualizador ele convida.
    const noFinance = await admin.post(invitations).send({ email: "dora@exemplo.com", role: "FINANCE" }).expect(403);
    expect(noFinance.body.error.code).toEqual("papel_nao_permitido");
    await admin.post(invitations).send({ email: "vera@exemplo.com", role: "VIEWER" }).expect(201);

    const token = await invite("dora@exemplo.com", "SUPPORT");
    const dora = await signUp(t, "Dora Campos", "dora@exemplo.com");
    await dora.agent.post(`/api/invitations/${token}/accept`).expect(200);
    const doraMember = `/api/organizations/${orgA}/members/${await memberIdOf("dora@exemplo.com")}`;

    // Promover para o financeiro: só o proprietário.
    const noPromotion = await admin.patch(doraMember).send({ role: "FINANCE" }).expect(403);
    expect(noPromotion.body.error.code).toEqual("papel_nao_permitido");
    await owner.agent.patch(doraMember).send({ role: "FINANCE" }).expect(200);

    // Rebaixar ou remover quem está no financeiro: também só o proprietário.
    const noDemotion = await admin.patch(doraMember).send({ role: "VIEWER" }).expect(403);
    expect(noDemotion.body.error.code).toEqual("papel_nao_permitido");
    const noRemoval = await admin.delete(doraMember).expect(403);
    expect(noRemoval.body.error.code).toEqual("papel_nao_permitido");

    // Convite para o financeiro feito pelo proprietário: o administrador não reenvia nem cancela.
    await invite("fin@exemplo.com", "FINANCE");
    const list = await admin.get(invitations).expect(200);
    const finance = list.body.invitations.find((i: { email: string }) => i.email === "fin@exemplo.com");
    const noResend = await admin.post(`${invitations}/${finance.id}/resend`).expect(403);
    expect(noResend.body.error.code).toEqual("papel_nao_permitido");
    const noRevoke = await admin.delete(`${invitations}/${finance.id}`).expect(403);
    expect(noRevoke.body.error.code).toEqual("papel_nao_permitido");
    await owner.agent.delete(`${invitations}/${finance.id}`).expect(200);

    // O proprietário rebaixa, promove de novo e remove.
    await owner.agent.patch(doraMember).send({ role: "VIEWER" }).expect(200);
    await owner.agent.patch(doraMember).send({ role: "FINANCE" }).expect(200);
    await owner.agent.delete(doraMember).expect(200);
    await dora.agent.get(`/api/organizations/${orgA}`).expect(404);
  });

  it("cancela os convites pendentes de quem deixa de gerenciar a equipe ou sai dela", async () => {
    const token = await invite("edu@exemplo.com", "ADMIN");
    const edu = await signUp(t, "Eduardo Paiva", "edu@exemplo.com");
    await edu.agent.post(`/api/invitations/${token}/accept`).expect(200);
    const eduMemberId = await memberIdOf("edu@exemplo.com");
    const eduMember = `/api/organizations/${orgA}/members/${eduMemberId}`;
    const inviteAsEdu = async (): Promise<string> => {
      await edu.agent.post(`/api/organizations/${orgA}/invitations`).send({ email: "otavio@exemplo.com", role: "VIEWER" }).expect(201);
      return extract(await lastMessage(t.prisma, "otavio@exemplo.com"), /convite\/([\w-]+)/);
    };

    // Rebaixado para um papel que não gerencia a equipe: o convite que ele fez deixa de valer.
    const first = await inviteAsEdu();
    await t.browser().get(`/api/invitations/${first}`).expect(200);
    await owner.agent.patch(eduMember).send({ role: "SUPPORT" }).expect(200);
    await t.browser().get(`/api/invitations/${first}`).expect(404);

    // De volta a administrador, convida de novo e é removido: o convite cai junto e não pode mais ser aceito.
    await owner.agent.patch(eduMember).send({ role: "ADMIN" }).expect(200);
    const second = await inviteAsEdu();
    await owner.agent.delete(eduMember).expect(200);
    const refused = await outsider.agent.post(`/api/invitations/${second}/accept`).expect(404);
    expect(refused.body.error.code).toEqual("convite_invalido");
    await outsider.agent.get(`/api/organizations/${orgA}`).expect(404);

    const removal = await t.prisma.auditLog.findFirstOrThrow({ where: { organizationId: orgA, action: "member.removed", resourceId: eduMemberId } });
    expect(removal.metadata).toMatchObject({ invitationsRevoked: 1 });
  });

  it("troca um convite vencido por um novo e nunca deixa dois convites abertos para o mesmo e-mail", async () => {
    const first = await invite("gil@exemplo.com", "VIEWER");
    await t.prisma.invitation.updateMany({ where: { organizationId: orgA, email: "gil@exemplo.com" }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await t.browser().get(`/api/invitations/${first}`).expect(404);

    const second = await invite("gil@exemplo.com", "SUPPORT");
    expect(second).not.toEqual(first);
    const rows = await t.prisma.invitation.findMany({ where: { organizationId: orgA, email: "gil@exemplo.com" } });
    expect(rows).toHaveLength(2);
    const open = rows.filter((row) => row.revokedAt === null);
    expect(open).toHaveLength(1);
    expect(open[0].role).toEqual("SUPPORT");

    const list = await owner.agent.get(`/api/organizations/${orgA}/invitations`).expect(200);
    const forGil = list.body.invitations.filter((i: { email: string }) => i.email === "gil@exemplo.com");
    expect(forGil).toHaveLength(1);
    expect(forGil[0]).toMatchObject({ role: "SUPPORT", expired: false });
    await t.browser().get(`/api/invitations/${second}`).expect(200);

    // Com o convite novo aberto, outro pedido para o mesmo e-mail é recusado.
    const dup = await owner.agent.post(`/api/organizations/${orgA}/invitations`).send({ email: "gil@exemplo.com", role: "VIEWER" }).expect(409);
    expect(dup.body.error.code).toEqual("convite_pendente");
  });

  it("limita os convites pendentes de uma organização", async () => {
    const expiresAt = new Date(Date.now() + 3_600_000);
    await t.prisma.invitation.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({ organizationId: orgB, email: `lote${i}@exemplo.com`, role: "VIEWER" as const, tokenHash: randomUUID(), expiresAt })),
    });
    const full = await outsider.agent.post(`/api/organizations/${orgB}/invitations`).send({ email: "mais-um@exemplo.com", role: "VIEWER" }).expect(409);
    expect(full.body.error.code).toEqual("limite_de_convites");

    // Convite cancelado não conta: abrindo uma vaga, o próximo passa.
    await t.prisma.invitation.updateMany({ where: { organizationId: orgB, email: "lote0@exemplo.com" }, data: { revokedAt: new Date() } });
    await outsider.agent.post(`/api/organizations/${orgB}/invitations`).send({ email: "mais-um@exemplo.com", role: "VIEWER" }).expect(201);
  });

  it("não aceita convite para uma organização suspensa e devolve o papel que a pessoa realmente tem", async () => {
    const caio = t.browser();
    await caio.post("/api/auth/login").send({ email: "caio@exemplo.com", password: PASSWORD }).expect(200);
    const token = await invite("caio@exemplo.com", "VIEWER");

    await t.prisma.organization.update({ where: { id: orgA }, data: { status: "SUSPENDED" } });
    try {
      const suspended = await caio.post(`/api/invitations/${token}/accept`).expect(403);
      expect(suspended.body.error.code).toEqual("organizacao_suspensa");
    } finally {
      await t.prisma.organization.update({ where: { id: orgA }, data: { status: "KYC_PENDING" } });
    }
    await caio.get(`/api/organizations/${orgA}`).expect(404);

    // Se a pessoa entrou na equipe por outro caminho antes de aceitar, o convite não muda o papel dela.
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "caio@exemplo.com" } });
    await t.prisma.organizationMember.create({ data: { organizationId: orgA, userId: user.id, role: "SUPPORT" } });
    const accepted = await caio.post(`/api/invitations/${token}/accept`).expect(200);
    expect(accepted.body).toMatchObject({ organizationId: orgA, role: "SUPPORT" });
  });

  it("aceita CNPJ alfanumérico, guarda o documento normalizado e devolve só a máscara", async () => {
    const body = { name: "Filial Alfa", type: "PJ", segment: "ECOMMERCE" };
    const created = await owner.agent.post("/api/organizations").send({ ...body, document: "12.ABC.345/01DE-35" }).expect(201);
    expect(created.body.document).toEqual("**.ABC.345/****-**");
    const stored = await t.prisma.organization.findUniqueOrThrow({ where: { id: created.body.id as string } });
    expect(stored.document).toEqual("12ABC34501DE35");

    // Em minúsculas e sem pontuação é o mesmo documento, e a mesma pessoa não o cadastra duas vezes.
    const again = await owner.agent.post("/api/organizations").send({ ...body, document: "12abc34501de35" }).expect(409);
    expect(again.body.error.code).toEqual("documento_em_uso");
    // Dígito verificador errado continua recusado.
    const invalid = await owner.agent.post("/api/organizations").send({ ...body, document: "12.ABC.345/01DE-36" }).expect(400);
    expect(invalid.body.error.param).toEqual("document");
  });

  it("registra as ações sensíveis na auditoria, que não aceita alteração nem exclusão", async () => {
    const page = await owner.agent.get(`/api/organizations/${orgA}/audit-logs?limit=5`).expect(200);
    expect(page.body.items).toHaveLength(5);
    expect(page.body.nextCursor).toBeTruthy();
    const next = await owner.agent.get(`/api/organizations/${orgA}/audit-logs?limit=5&cursor=${page.body.nextCursor}`).expect(200);
    expect(next.body.items[0].id).not.toEqual(page.body.items[0].id);

    const all = await t.prisma.auditLog.findMany({ where: { organizationId: orgA } });
    const actions = new Set(all.map((a) => a.action));
    for (const action of ["organization.created", "organization.updated", "invitation.created", "invitation.accepted", "invitation.resent", "invitation.revoked", "member.role_changed", "member.removed"]) {
      expect(actions.has(action)).toBe(true);
    }
    // A auditoria da organização B não aparece para a A.
    expect(all.every((a) => a.organizationId === orgA)).toBe(true);
    // Nada sensível vai para os metadados.
    expect(JSON.stringify(all)).not.toMatch(/password|senha|token/i);

    await expect(t.prisma.auditLog.updateMany({ where: { organizationId: orgA }, data: { action: "adulterado" } })).rejects.toThrow(/audit_logs aceita apenas INSERT/);
    await expect(t.prisma.auditLog.deleteMany({ where: { organizationId: orgA } })).rejects.toThrow(/audit_logs aceita apenas INSERT/);
    expect(await t.prisma.auditLog.count({ where: { organizationId: orgA } })).toEqual(all.length);
  });

  it("o banco recusa TRUNCATE, UPDATE e DELETE na auditoria, mesmo por SQL direto", async () => {
    const before = await t.prisma.auditLog.count({ where: { organizationId: orgA } });
    expect(before).toBeGreaterThan(0);
    const refusal = /audit_logs aceita apenas INSERT/;
    await expect(t.prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"')).rejects.toThrow(refusal);
    await expect(t.prisma.$executeRawUnsafe('UPDATE "audit_logs" SET "action" = \'adulterado\' WHERE "organization_id"::text = $1', orgA)).rejects.toThrow(refusal);
    await expect(t.prisma.$executeRawUnsafe('DELETE FROM "audit_logs" WHERE "organization_id"::text = $1', orgA)).rejects.toThrow(refusal);
    expect(await t.prisma.auditLog.count({ where: { organizationId: orgA } })).toEqual(before);
    expect(await t.prisma.auditLog.count({ where: { organizationId: orgA, action: "adulterado" } })).toEqual(0);
  });

  it("deixa uma conta suspensa só para consulta", async () => {
    await t.prisma.organization.update({ where: { id: orgA }, data: { status: "SUSPENDED" } });
    await owner.agent.get(`/api/organizations/${orgA}/members`).expect(200);
    const res = await owner.agent.post(`/api/organizations/${orgA}/invitations`).send({ email: "novo@exemplo.com", role: "VIEWER" }).expect(403);
    expect(res.body.error.code).toEqual("organizacao_suspensa");
    await t.prisma.organization.update({ where: { id: orgA }, data: { status: "KYC_PENDING" } });
  });

  it("só mostra a caixa de saída com DEV_OUTBOX=true", async () => {
    const res = await t.browser().get("/api/dev/outbox").expect(200);
    expect(res.body.messages.length).toBeGreaterThan(0);

    // Sem a variável a rota some, em qualquer ambiente.
    process.env.DEV_OUTBOX = "false";
    resetEnvCache();
    try {
      const off = await t.browser().get("/api/dev/outbox").expect(404);
      expect(off.body.error.code).toEqual("nao_encontrado");
    } finally {
      process.env.DEV_OUTBOX = "true";
      resetEnvCache();
    }
  });
});
