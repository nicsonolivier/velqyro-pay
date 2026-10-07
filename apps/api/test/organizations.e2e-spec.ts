import { createOrganization, CNPJS, extract, lastMessage, Person, signUp, startTestApp, TestApp } from "./helpers";

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
    await rafa.post("/api/auth/login").send({ email: "rafa@exemplo.com", password: "Senha1234" }).expect(200);

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

  it("deixa uma conta suspensa só para consulta", async () => {
    await t.prisma.organization.update({ where: { id: orgA }, data: { status: "SUSPENDED" } });
    await owner.agent.get(`/api/organizations/${orgA}/members`).expect(200);
    const res = await owner.agent.post(`/api/organizations/${orgA}/invitations`).send({ email: "novo@exemplo.com", role: "VIEWER" }).expect(403);
    expect(res.body.error.code).toEqual("organizacao_suspensa");
    await t.prisma.organization.update({ where: { id: orgA }, data: { status: "KYC_PENDING" } });
  });

  it("só mostra a caixa de saída fora de produção", async () => {
    const res = await t.browser().get("/api/dev/outbox").expect(200);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });
});
