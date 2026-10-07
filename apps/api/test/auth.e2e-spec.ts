import { createOrganization, CNPJS, enableTwoFactor, extract, lastMessage, PASSWORD, signUp, startTestApp, TestApp, totpCodes, wrongTotp } from "./helpers";

describe("Autenticação (ponta a ponta)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("responde no health check e devolve um ID de requisição", async () => {
    const res = await t.browser().get("/api/health").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "ok" });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("recusa rotas protegidas sem sessão, com erro padronizado em português", async () => {
    const res = await t.browser().get("/api/auth/me").expect(401);
    expect(res.body.error.code).toEqual("nao_autenticado");
    expect(typeof res.body.error.message).toEqual("string");
    expect(res.body.requestId).toBeTruthy();
  });

  it("responde no formato padrão quando o corpo da requisição é grande demais", async () => {
    const res = await t.browser().post("/api/auth/login").send({ email: "marina@exemplo.com", password: "x".repeat(200_000) }).expect(413);
    expect(res.body.error.code).toEqual("corpo_muito_grande");
    expect(res.body.requestId).toBeTruthy();
  });

  it("valida o cadastro campo a campo e recusa campos desconhecidos", async () => {
    const res = await t.browser().post("/api/auth/register").send({ name: "Ana", email: "nao-e-email", phone: "123", password: "curta", acceptTerms: false }).expect(400);
    expect(res.body.error.code).toEqual("parametro_invalido");
    expect(Object.keys(res.body.error.fields).sort()).toEqual(["acceptTerms", "email", "name", "password", "phone"]);

    const extra = await t
      .browser()
      .post("/api/auth/register")
      .send({ name: "Ana Lima", email: "ana@exemplo.com", phone: "(11) 91234-5678", password: PASSWORD, acceptTerms: true, role: "admin" })
      .expect(400);
    expect(extra.body.error.code).toEqual("parametro_invalido");
  });

  it("cadastra, exige confirmar o e-mail antes de criar organização e guarda a senha só como hash", async () => {
    const agent = t.browser();
    const res = await agent
      .post("/api/auth/register")
      .send({ name: "Marina Albuquerque", email: "  Marina@Exemplo.com ", phone: "(11) 98822-4410", password: PASSWORD, acceptTerms: true })
      .expect(201);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("vq_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "marina@exemplo.com" } });
    expect(user.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(user.passwordHash).not.toContain(PASSWORD);

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.accountState).toEqual("EMAIL_VERIFICATION");
    expect(me.body.user.passwordHash).toBeUndefined();

    const blocked = await agent.post("/api/organizations").send({ name: "Estúdio Pixel Norte", type: "PJ", document: CNPJS[0], segment: "ONLINE" }).expect(403);
    expect(blocked.body.error.code).toEqual("email_nao_verificado");

    const token = extract(await lastMessage(t.prisma, "marina@exemplo.com"), /verificar-email\?token=([\w-]+)/);
    await agent.post("/api/auth/email/verify").send({ token }).expect(200);
    // O link só vale uma vez.
    await agent.post("/api/auth/email/verify").send({ token }).expect(400);

    const pending = await agent.get("/api/auth/me").expect(200);
    expect(pending.body.accountState).toEqual("PENDING");

    await agent.post("/api/organizations").send({ name: "Estúdio Pixel Norte", type: "PJ", document: CNPJS[0], segment: "ONLINE" }).expect(201);
    const after = await agent.get("/api/auth/me").expect(200);
    expect(after.body.accountState).toEqual("KYC_PENDING");
    expect(after.body.memberships).toHaveLength(1);
    expect(after.body.memberships[0].role).toEqual("OWNER");
    expect(after.body.memberships[0].organization.document).toEqual("**.222.333/****-**");
  });

  it("não aceita o mesmo e-mail duas vezes e só recusa documento repetido da mesma pessoa ou de organização já verificada", async () => {
    const dup = await t
      .browser()
      .post("/api/auth/register")
      .send({ name: "Outra Marina", email: "marina@exemplo.com", phone: "(11) 98822-4411", password: PASSWORD, acceptTerms: true })
      .expect(409);
    expect(dup.body.error.code).toEqual("email_em_uso");

    const bruno = await signUp(t, "Bruno Tavares", "bruno@exemplo.com");
    const create = (document: string) => bruno.agent.post("/api/organizations").send({ name: "Cópia", type: "PJ", document, segment: "ONLINE" });
    const withThisDocument = { document: "11222333000181" };

    // Documento de uma organização já verificada: recusado para qualquer pessoa.
    await t.prisma.organization.updateMany({ where: withThisDocument, data: { status: "ACTIVE" } });
    const verified = await create(CNPJS[0]).expect(409);
    expect(verified.body.error.code).toEqual("documento_em_uso");

    // Enquanto a organização da Marina não passa pelo KYC, o documento não fica reservado para ela...
    await t.prisma.organization.updateMany({ where: withThisDocument, data: { status: "KYC_PENDING" } });
    await create(CNPJS[0]).expect(201);
    // ...mas a mesma pessoa não cadastra o mesmo documento duas vezes, com ou sem pontuação.
    const sameDoc = await create("11222333000181").expect(409);
    expect(sameDoc.body.error).toMatchObject({ code: "documento_em_uso", param: "document" });
    expect(await t.prisma.organization.count({ where: withThisDocument })).toEqual(2);

    const badDoc = await bruno.agent.post("/api/organizations").send({ name: "Loja", type: "PJ", document: "11.222.333/0001-82", segment: "ONLINE" }).expect(400);
    expect(badDoc.body.error.param).toEqual("document");
    // CPF válido não serve para pessoa jurídica.
    await bruno.agent.post("/api/organizations").send({ name: "Loja", type: "PJ", document: "529.982.247-25", segment: "ONLINE" }).expect(400);
    await bruno.agent.post("/api/organizations").send({ name: "Bruno Serviços", type: "PF", document: "529.982.247-25", segment: "LOCAL" }).expect(201);
  });

  it("faz login e logout, e a sessão encerrada deixa de valer", async () => {
    const agent = t.browser();
    const wrong = await agent.post("/api/auth/login").send({ email: "marina@exemplo.com", password: "errada123" }).expect(401);
    expect(wrong.body.error.code).toEqual("credenciais_invalidas");
    // Mesma resposta para e-mail que não existe.
    const unknown = await agent.post("/api/auth/login").send({ email: "ninguem@exemplo.com", password: "errada123" }).expect(401);
    expect(unknown.body.error).toEqual(wrong.body.error);

    const ok = await agent.post("/api/auth/login").send({ email: "MARINA@exemplo.com", password: PASSWORD }).expect(200);
    expect(ok.body).toEqual({ twoFactorRequired: false });
    await agent.get("/api/auth/me").expect(200);
    await agent.post("/api/auth/logout").expect(200);
    await agent.get("/api/auth/me").expect(401);
  });

  it("recusa requisições de escrita vindas de outra origem", async () => {
    const res = await t.browser().post("/api/auth/login").set("Origin", "https://site-malicioso.exemplo").send({ email: "marina@exemplo.com", password: PASSWORD }).expect(403);
    expect(res.body.error.code).toEqual("origem_nao_permitida");
    await t.browser().post("/api/auth/login").set("Origin", "http://localhost:5173").send({ email: "marina@exemplo.com", password: PASSWORD }).expect(200);
  });

  it("bloqueia a conta por 15 minutos depois de 5 senhas erradas", async () => {
    await signUp(t, "Carla Nogueira", "carla@exemplo.com");
    const agent = t.browser();
    for (let i = 0; i < 5; i++) await agent.post("/api/auth/login").send({ email: "carla@exemplo.com", password: "errada123" }).expect(401);
    const locked = await agent.post("/api/auth/login").send({ email: "carla@exemplo.com", password: PASSWORD }).expect(429);
    expect(locked.body.error.code).toEqual("conta_bloqueada");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("recupera a senha sem revelar se o e-mail existe, usa o link uma vez e encerra as sessões abertas", async () => {
    const diego = await signUp(t, "Diego Rezende", "diego@exemplo.com");
    const visitor = t.browser();
    const a = await visitor.post("/api/auth/password/forgot").send({ email: "diego@exemplo.com" }).expect(200);
    const b = await visitor.post("/api/auth/password/forgot").send({ email: "ninguem@exemplo.com" }).expect(200);
    expect(a.body).toEqual(b.body);
    expect(await t.prisma.outboxMessage.count({ where: { recipient: "ninguem@exemplo.com" } })).toEqual(0);

    const token = extract(await lastMessage(t.prisma, "diego@exemplo.com"), /redefinir-senha\?token=([\w-]+)/);
    await visitor.post("/api/auth/password/reset").send({ token, password: "fraca" }).expect(400);
    await visitor.post("/api/auth/password/reset").send({ token, password: "NovaSenha2026" }).expect(200);
    await visitor.post("/api/auth/password/reset").send({ token, password: "OutraSenha2026" }).expect(400);

    // A sessão que estava aberta antes da troca deixou de valer.
    await diego.agent.get("/api/auth/me").expect(401);
    await visitor.post("/api/auth/login").send({ email: "diego@exemplo.com", password: PASSWORD }).expect(401);
    await visitor.post("/api/auth/login").send({ email: "diego@exemplo.com", password: "NovaSenha2026" }).expect(200);
  });

  it("mantém os links de redefinição anteriores, limita os pedidos a um por minuto e gasta todos os links ao trocar a senha", async () => {
    await signUp(t, "Nina Furtado", "nina@exemplo.com");
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "nina@exemplo.com" } });
    const resetTokens = () => t.prisma.verificationToken.count({ where: { userId: user.id, type: "PASSWORD_RESET" } });
    const lastLink = async () => extract(await lastMessage(t.prisma, "nina@exemplo.com"), /redefinir-senha\?token=([\w-]+)/);
    const visitor = t.browser();

    await visitor.post("/api/auth/password/forgot").send({ email: "nina@exemplo.com" }).expect(200);
    const first = await lastLink();
    // Segundo pedido em menos de um minuto: mesma resposta, nenhum e-mail novo.
    const repeated = await visitor.post("/api/auth/password/forgot").send({ email: "nina@exemplo.com" }).expect(200);
    expect(repeated.body).toEqual({ ok: true });
    expect(await resetTokens()).toEqual(1);
    expect(await lastLink()).toEqual(first);

    // Passado um minuto, sai um link novo e o anterior continua valendo.
    await t.prisma.verificationToken.updateMany({ where: { userId: user.id, type: "PASSWORD_RESET" }, data: { createdAt: new Date(Date.now() - 61_000) } });
    await visitor.post("/api/auth/password/forgot").send({ email: "nina@exemplo.com" }).expect(200);
    expect(await resetTokens()).toEqual(2);
    const second = await lastLink();
    expect(second).not.toEqual(first);
    expect(await t.prisma.verificationToken.count({ where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null } })).toEqual(2);

    // Trocar a senha com o link mais antigo gasta também o mais novo.
    await visitor.post("/api/auth/password/reset").send({ token: first, password: "NovaSenha2026" }).expect(200);
    const spent = await visitor.post("/api/auth/password/reset").send({ token: second, password: "OutraSenha2026" }).expect(400);
    expect(spent.body.error.code).toEqual("link_invalido");
    expect(await t.prisma.verificationToken.count({ where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null } })).toEqual(0);
    await visitor.post("/api/auth/login").send({ email: "nina@exemplo.com", password: "NovaSenha2026" }).expect(200);
  });

  it("confirma o telefone por código e limita as tentativas", async () => {
    const eva = await signUp(t, "Eva Pacheco", "eva@exemplo.com");
    await eva.agent.post("/api/auth/phone/send").expect(200);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "eva@exemplo.com" } });
    const code = extract(await lastMessage(t.prisma, user.phone), /código de confirmação é (\d{6})/);
    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await eva.agent.post("/api/auth/phone/verify").send({ code: wrong }).expect(400);
    expect(bad.body.error.code).toEqual("codigo_incorreto");
    await eva.agent.post("/api/auth/phone/verify").send({ code }).expect(200);
    const me = await eva.agent.get("/api/auth/me").expect(200);
    expect(me.body.user.phoneVerified).toBe(true);
  });

  it("gasta uma tentativa a cada palpite no código do telefone e limita os códigos por hora", async () => {
    const olga = await signUp(t, "Olga Bastos", "olga@exemplo.com");
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "olga@exemplo.com" } });
    const sentCode = async () => extract(await lastMessage(t.prisma, user.phone), /código de confirmação é (\d{6})/);

    await olga.agent.post("/api/auth/phone/send").expect(200);
    const first = await sentCode();
    const wrong = first === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await olga.agent.post("/api/auth/phone/verify").send({ code: wrong }).expect(400);
      expect(res.body.error.code).toEqual("codigo_incorreto");
    }
    // O sexto palpite é recusado mesmo com o código certo.
    const sixth = await olga.agent.post("/api/auth/phone/verify").send({ code: first }).expect(400);
    expect(sixth.body.error.code).toEqual("codigo_expirado");

    // Cinco códigos por hora: o sexto pedido é recusado e nada é enviado.
    for (let i = 0; i < 4; i++) await olga.agent.post("/api/auth/phone/send").expect(200);
    const tooMany = await olga.agent.post("/api/auth/phone/send").expect(429);
    expect(tooMany.body.error.code).toEqual("limite_de_requisicoes");
    expect(Number(tooMany.headers["retry-after"])).toBeGreaterThan(0);
    expect(await t.prisma.verificationToken.count({ where: { userId: user.id, type: "PHONE_VERIFY" } })).toEqual(5);
    expect(await t.prisma.outboxMessage.count({ where: { recipient: user.phone } })).toEqual(5);

    // O último código enviado continua valendo.
    await olga.agent.post("/api/auth/phone/verify").send({ code: await sentCode() }).expect(200);
    const me = await olga.agent.get("/api/auth/me").expect(200);
    expect(me.body.user.phoneVerified).toBe(true);
  });

  it("ativa o 2FA pedindo a senha, encerra as outras sessões, exige o código no login seguinte e aceita cada código de recuperação uma única vez", async () => {
    const fabio = await signUp(t, "Fábio Monteiro", "fabio@exemplo.com");
    const otherDevice = t.browser();
    await otherDevice.post("/api/auth/login").send({ email: "fabio@exemplo.com", password: PASSWORD }).expect(200);

    // Começar a ativação exige a senha de novo.
    const noPassword = await fabio.agent.post("/api/account/2fa/setup").send({}).expect(400);
    expect(noPassword.body.error.code).toEqual("parametro_invalido");
    const wrongPassword = await fabio.agent.post("/api/account/2fa/setup").send({ password: "errada123" }).expect(400);
    expect(wrongPassword.body.error).toMatchObject({ code: "senha_incorreta", param: "password" });
    const setup = await fabio.agent.post("/api/account/2fa/setup").send({ password: PASSWORD }).expect(200);
    expect(setup.body.otpauthUri).toContain("otpauth://totp/VELQYRO%20PAY");
    const secret = setup.body.secret as string;
    const nextCode = totpCodes(secret);

    // O segredo fica cifrado no banco.
    const stored = await t.prisma.twoFactorMethod.findFirstOrThrow({ where: { user: { email: "fabio@exemplo.com" } } });
    expect(stored.secretEncrypted).not.toContain(secret);

    await fabio.agent.post("/api/account/2fa/enable").send({ code: wrongTotp(secret) }).expect(400);
    const enabled = await fabio.agent.post("/api/account/2fa/enable").send({ code: nextCode() }).expect(200);
    const recoveryCodes = enabled.body.recoveryCodes as string[];
    expect(recoveryCodes).toHaveLength(8);

    // Ativar encerra as outras sessões e mantém a atual.
    await otherDevice.get("/api/auth/me").expect(401);
    await fabio.agent.get("/api/auth/me").expect(200);
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { actorUserId: stored.userId, action: "two_factor.enabled" } });
    expect(audit.metadata).toMatchObject({ sessionsEnded: 1 });

    const agent = t.browser();
    const login = await agent.post("/api/auth/login").send({ email: "fabio@exemplo.com", password: PASSWORD }).expect(200);
    expect(login.body).toEqual({ twoFactorRequired: true });

    // Com o segundo fator pendente, só as rotas de login respondem, e /me não revela nada da conta.
    const pending = await agent.get("/api/organizations").expect(401);
    expect(pending.body.error.code).toEqual("verificacao_2fa_pendente");
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body).toEqual({ user: null, session: { id: expect.any(String), twoFactorPending: true }, memberships: [] });

    await agent.post("/api/auth/2fa/verify").send({ code: wrongTotp(secret) }).expect(400);
    await agent.post("/api/auth/2fa/verify").send({ code: nextCode() }).expect(200);
    await agent.get("/api/organizations").expect(200);
    const full = await agent.get("/api/auth/me").expect(200);
    expect(full.body.user.email).toEqual("fabio@exemplo.com");
    expect(full.body.session.twoFactorPending).toBe(false);

    // Código de recuperação: vale uma vez.
    const second = t.browser();
    await second.post("/api/auth/login").send({ email: "fabio@exemplo.com", password: PASSWORD }).expect(200);
    await second.post("/api/auth/2fa/verify").send({ recoveryCode: recoveryCodes[0].toLowerCase() }).expect(200);
    const third = t.browser();
    await third.post("/api/auth/login").send({ email: "fabio@exemplo.com", password: PASSWORD }).expect(200);
    await third.post("/api/auth/2fa/verify").send({ recoveryCode: recoveryCodes[0] }).expect(400);
    const status = await second.get("/api/account/2fa").expect(200);
    expect(status.body).toEqual({ enabled: true, recoveryCodesLeft: 7 });

    // Desativar exige senha e um código ainda não usado (aqui, um de recuperação).
    const badPassword = await second.post("/api/account/2fa/disable").send({ password: "errada123", code: recoveryCodes[1] }).expect(400);
    expect(badPassword.body.error.code).toEqual("senha_incorreta");
    await second.post("/api/account/2fa/disable").send({ password: PASSWORD, code: recoveryCodes[1] }).expect(200);
    const off = await t.browser().post("/api/auth/login").send({ email: "fabio@exemplo.com", password: PASSWORD }).expect(200);
    expect(off.body).toEqual({ twoFactorRequired: false });
  });

  it("bloqueia a conta depois de 5 códigos errados no segundo fator, mesmo entrando de novo com a senha certa", async () => {
    const joana = await signUp(t, "Joana Prates", "joana@exemplo.com");
    const twoFactor = await enableTwoFactor(joana);
    const credentials = { email: "joana@exemplo.com", password: PASSWORD };
    const wrong = wrongTotp(twoFactor.secret);

    const first = t.browser();
    await first.post("/api/auth/login").send(credentials).expect(200);
    for (let i = 0; i < 3; i++) {
      const res = await first.post("/api/auth/2fa/verify").send({ code: wrong }).expect(400);
      expect(res.body.error.code).toEqual("codigo_incorreto");
    }

    // Entrar de novo com a senha certa não devolve as tentativas. Código de recuperação errado também conta.
    const second = t.browser();
    await second.post("/api/auth/login").send(credentials).expect(200);
    await second.post("/api/auth/2fa/verify").send({ recoveryCode: "AAAAA-AAAAA" }).expect(400);
    const locked = await second.post("/api/auth/2fa/verify").send({ code: wrong }).expect(429);
    expect(locked.body.error.code).toEqual("conta_bloqueada");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);

    // Os logins que esperavam o código foram encerrados, e nem a senha certa entra enquanto durar o bloqueio.
    await first.get("/api/auth/me").expect(401);
    await second.get("/api/auth/me").expect(401);
    const login = await t.browser().post("/api/auth/login").send(credentials).expect(429);
    expect(login.body.error.code).toEqual("conta_bloqueada");
    // A sessão que já estava aberta continua valendo.
    await joana.agent.get("/api/auth/me").expect(200);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "joana@exemplo.com" } });
    expect(user.lockedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now());
    expect(await t.prisma.auditLog.count({ where: { actorUserId: user.id, action: "auth.two_factor_locked" } })).toEqual(1);
  });

  it("aceita cada código do aplicativo uma única vez e, com a conta bloqueada, recusa antes de conferir o código", async () => {
    const karen = await signUp(t, "Karen Vilela", "karen@exemplo.com");
    const twoFactor = await enableTwoFactor(karen);
    const credentials = { email: "karen@exemplo.com", password: PASSWORD };
    const agent = t.browser();
    await agent.post("/api/auth/login").send(credentials).expect(200);

    // O código que ativou o 2FA não serve para entrar.
    const replayed = await agent.post("/api/auth/2fa/verify").send({ code: twoFactor.enablingCode }).expect(400);
    expect(replayed.body.error.code).toEqual("codigo_incorreto");

    // Conta bloqueada: até o código certo é recusado, e ele não é gasto.
    const code = twoFactor.nextCode();
    await t.prisma.user.update({ where: { email: "karen@exemplo.com" }, data: { lockedUntil: new Date(Date.now() + 60_000) } });
    const refused = await agent.post("/api/auth/2fa/verify").send({ code }).expect(429);
    expect(refused.body.error.code).toEqual("conta_bloqueada");
    await t.prisma.user.update({ where: { email: "karen@exemplo.com" }, data: { lockedUntil: null } });
    await agent.post("/api/auth/2fa/verify").send({ code }).expect(200);

    // Depois de aceito, o mesmo código não vale de novo: nem em outro login, nem para desativar o 2FA.
    const other = t.browser();
    await other.post("/api/auth/login").send(credentials).expect(200);
    await other.post("/api/auth/2fa/verify").send({ code }).expect(400);
    const again = await agent.post("/api/account/2fa/disable").send({ password: PASSWORD, code }).expect(400);
    expect(again.body.error).toMatchObject({ code: "codigo_incorreto", param: "code" });
    const status = await agent.get("/api/account/2fa").expect(200);
    expect(status.body.enabled).toBe(true);
  });

  it("conta as senhas erradas das rotas que pedem a senha de novo e bloqueia a conta", async () => {
    const lia = await signUp(t, "Lia Santoro", "lia@exemplo.com");
    for (let i = 0; i < 3; i++) {
      const res = await lia.agent.post("/api/account/password").send({ currentPassword: "errada123", newPassword: "NovaSenha2026" }).expect(400);
      expect(res.body.error).toMatchObject({ code: "senha_incorreta", param: "currentPassword" });
    }
    // As rotas somam no mesmo contador.
    await lia.agent.post("/api/account/2fa/setup").send({ password: "errada123" }).expect(400);
    const locked = await lia.agent.post("/api/account/2fa/setup").send({ password: "errada123" }).expect(429);
    expect(locked.body.error.code).toEqual("conta_bloqueada");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);

    // Bloqueada, a conta recusa até a senha certa, nessas rotas e no login.
    const refused = await lia.agent.post("/api/account/password").send({ currentPassword: PASSWORD, newPassword: "NovaSenha2026" }).expect(429);
    expect(refused.body.error.code).toEqual("conta_bloqueada");
    await lia.agent.post("/api/account/2fa/setup").send({ password: PASSWORD }).expect(429);
    await t.browser().post("/api/auth/login").send({ email: "lia@exemplo.com", password: PASSWORD }).expect(429);

    // A sessão aberta continua valendo e nada foi alterado na conta.
    await lia.agent.get("/api/auth/me").expect(200);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "lia@exemplo.com" } });
    expect(await t.prisma.twoFactorMethod.count({ where: { userId: user.id } })).toEqual(0);
    expect(await t.prisma.auditLog.count({ where: { actorUserId: user.id, action: "auth.account_locked" } })).toEqual(1);
  });

  it("lista as sessões, encerra as outras e troca a senha", async () => {
    const gabi = await signUp(t, "Gabriela Duarte", "gabi@exemplo.com");
    const phone = t.browser();
    await phone.post("/api/auth/login").send({ email: "gabi@exemplo.com", password: PASSWORD }).expect(200);

    const list = await gabi.agent.get("/api/account/sessions").expect(200);
    expect(list.body.sessions).toHaveLength(2);
    expect(list.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const other = list.body.sessions.find((s: { current: boolean }) => !s.current);

    // Não dá para encerrar a sessão de outra pessoa adivinhando o ID.
    const helio = await signUp(t, "Hélio Brandão", "helio@exemplo.com");
    await helio.agent.delete(`/api/account/sessions/${other.id}`).expect(404);

    await gabi.agent.delete(`/api/account/sessions/${other.id}`).expect(200);
    await phone.get("/api/auth/me").expect(401);

    await phone.post("/api/auth/login").send({ email: "gabi@exemplo.com", password: PASSWORD }).expect(200);
    await gabi.agent.post("/api/account/password").send({ currentPassword: "errada123", newPassword: "NovaSenha2026" }).expect(400);
    const changed = await gabi.agent.post("/api/account/password").send({ currentPassword: PASSWORD, newPassword: "NovaSenha2026" }).expect(200);
    expect(changed.body.sessionsEnded).toEqual(1);
    await phone.get("/api/auth/me").expect(401);
    await gabi.agent.get("/api/auth/me").expect(200);
  });

  it("atualiza o perfil e pede nova confirmação quando o telefone muda", async () => {
    const iara = await signUp(t, "Iara Freitas", "iara@exemplo.com");
    await createOrganization(iara, "Iara Decor", CNPJS[1]);
    await iara.agent.post("/api/auth/phone/send").expect(200);
    const before = await t.prisma.user.findUniqueOrThrow({ where: { email: "iara@exemplo.com" } });
    const code = extract(await lastMessage(t.prisma, before.phone), /código de confirmação é (\d{6})/);
    await iara.agent.post("/api/auth/phone/verify").send({ code }).expect(200);

    await iara.agent.patch("/api/account").send({ name: "Iara Freitas Lima", phone: "(21) 97777-0001" }).expect(200);
    const me = await iara.agent.get("/api/auth/me").expect(200);
    expect(me.body.user.name).toEqual("Iara Freitas Lima");
    expect(me.body.user.phone).toEqual("21977770001");
    expect(me.body.user.phoneVerified).toBe(false);
  });
});
