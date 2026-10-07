import { Injectable } from "@nestjs/common";
import type { User, VerificationType } from "@prisma/client";
import { accountState, maskDocument, normalizeEmail, onlyDigits } from "@velqyro/shared";
import { AuditService } from "../audit/audit.service";
import { errors } from "../common/errors";
import type { AuthContext, RequestMeta } from "../common/request";
import { loadEnv } from "../config/env";
import { dummyPasswordHash, hashPassword, needsRehash, verifyPassword } from "../crypto/password";
import { randomDigits, randomToken, sha256Hex } from "../crypto/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { LoginDto, RegisterDto } from "./dto";
import { SessionsService } from "./sessions.service";
import { TwoFactorService } from "./two-factor.service";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const EMAIL_LINK_HOURS = 24;
const RESET_LINK_MINUTES = 30;
const PHONE_CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Tudo que o painel precisa saber sobre quem está logado. */
  async me(auth: AuthContext) {
    const [memberships, twoFactorEnabled] = await Promise.all([
      this.prisma.organizationMember.findMany({ where: { userId: auth.user.id }, include: { organization: true }, orderBy: { createdAt: "asc" } }),
      this.twoFactor.isEnabled(auth.user.id),
    ]);
    const u = auth.user;
    return {
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        emailVerified: Boolean(u.emailVerifiedAt),
        phoneVerified: Boolean(u.phoneVerifiedAt),
        twoFactorEnabled,
        createdAt: u.createdAt,
      },
      session: { id: auth.session.id, twoFactorPending: auth.session.mfaPending },
      accountState: accountState({ emailVerified: Boolean(u.emailVerifiedAt), organizationStatus: memberships[0]?.organization.status ?? null }),
      memberships: memberships.map((m) => ({
        id: m.id,
        role: m.role,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          legalName: m.organization.legalName,
          type: m.organization.type,
          document: maskDocument(m.organization.document),
          segment: m.organization.segment,
          status: m.organization.status,
        },
      })),
    };
  }

  async register(dto: RegisterDto, meta: RequestMeta): Promise<{ token: string; user: User }> {
    const email = normalizeEmail(dto.email);
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw errors.conflict("email_em_uso", "Já existe uma conta com este e-mail. Entre ou recupere a senha.", { param: "email" });
    }
    const user = await this.prisma.user.create({
      data: { name: dto.name, email, phone: onlyDigits(dto.phone), passwordHash: await hashPassword(dto.password), termsAcceptedAt: new Date() },
    });
    await this.audit.record({ actor: user, action: "user.registered", resource: "user", resourceId: user.id, meta });
    await this.sendEmailVerification(user);
    const { token } = await this.sessions.create(user.id, meta, false);
    return { token, user };
  }

  /** Devolve o token da sessão e se o login ainda precisa do segundo fator. */
  async login(dto: LoginDto, meta: RequestMeta): Promise<{ token: string; twoFactorRequired: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(dto.email) } });
    const invalid = () => errors.unauthorized("credenciais_invalidas", "E-mail ou senha incorretos.");

    if (!user) {
      // Gasta o mesmo tempo de um login real para não revelar se o e-mail tem conta.
      await verifyPassword(dto.password, await dummyPasswordHash());
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const seconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw errors.tooMany("conta_bloqueada", `Muitas tentativas erradas. Tente de novo em ${Math.ceil(seconds / 60)} minuto(s).`, seconds);
    }
    if (!(await verifyPassword(dto.password, user.passwordHash))) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      await this.audit.record({ actor: user, action: lock ? "auth.account_locked" : "auth.login_failed", resource: "user", resourceId: user.id, meta });
      throw invalid();
    }

    const twoFactorRequired = await this.twoFactor.isEnabled(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(dto.password) } : {}),
      },
    });
    const { token, session } = await this.sessions.create(user.id, meta, twoFactorRequired);
    await this.audit.record({ actor: user, action: "auth.login", resource: "session", resourceId: session.id, meta, metadata: { twoFactorRequired } });
    return { token, twoFactorRequired };
  }

  async logout(auth: AuthContext, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(auth.session.id);
    await this.audit.record({ actor: auth.user, action: "auth.logout", resource: "session", resourceId: auth.session.id, meta });
  }

  // ---------- Confirmação de e-mail e telefone ----------

  private async issueToken(userId: string, type: VerificationType, target: string, secret: string, ttlMs: number): Promise<void> {
    // Só o pedido mais recente vale: os anteriores do mesmo tipo são invalidados.
    await this.prisma.verificationToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.verificationToken.create({ data: { userId, type, target, tokenHash: sha256Hex(secret), expiresAt: new Date(Date.now() + ttlMs) } });
  }

  async sendEmailVerification(user: User): Promise<void> {
    if (user.emailVerifiedAt) throw errors.conflict("email_ja_verificado", "Este e-mail já foi confirmado.");
    const token = randomToken(32);
    await this.issueToken(user.id, "EMAIL_VERIFY", user.email, token, EMAIL_LINK_HOURS * 3_600_000);
    const link = `${loadEnv().appUrl}/verificar-email?token=${token}`;
    await this.notifications.sendEmail(
      user.email,
      "Confirme seu e-mail na VELQYRO PAY",
      `Olá, ${user.name.split(" ")[0]}.\n\nConfirme seu e-mail para liberar a conta:\n${link}\n\nO link vale por ${EMAIL_LINK_HOURS} horas. Se você não criou esta conta, ignore esta mensagem.`,
    );
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    const record = await this.prisma.verificationToken.findFirst({ where: { type: "EMAIL_VERIFY", tokenHash: sha256Hex(token) }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now() || record.target !== record.user.email) {
      throw errors.badRequest("link_invalido", "Este link expirou ou já foi usado. Peça um novo e-mail de confirmação.");
    }
    await this.prisma.$transaction([
      this.prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
    await this.audit.record({ actor: record.user, action: "user.email_verified", resource: "user", resourceId: record.userId, meta });
  }

  async sendPhoneCode(user: User): Promise<void> {
    if (user.phoneVerifiedAt) throw errors.conflict("telefone_ja_verificado", "Este telefone já foi confirmado.");
    const code = randomDigits(6);
    await this.issueToken(user.id, "PHONE_VERIFY", user.phone, code, PHONE_CODE_MINUTES * 60_000);
    await this.notifications.sendSms(user.phone, `VELQYRO PAY: seu código de confirmação é ${code}. Ele vale por ${PHONE_CODE_MINUTES} minutos.`);
  }

  async verifyPhone(user: User, code: string, meta: RequestMeta): Promise<void> {
    const record = await this.prisma.verificationToken.findFirst({ where: { userId: user.id, type: "PHONE_VERIFY", usedAt: null }, orderBy: { createdAt: "desc" } });
    if (!record || record.expiresAt.getTime() <= Date.now() || record.target !== user.phone) {
      throw errors.badRequest("codigo_expirado", "O código expirou. Peça um novo.", { param: "code" });
    }
    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      await this.prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      throw errors.badRequest("codigo_expirado", "Muitas tentativas erradas. Peça um novo código.", { param: "code" });
    }
    if (record.tokenHash !== sha256Hex(code)) {
      await this.prisma.verificationToken.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw errors.badRequest("codigo_incorreto", "Código incorreto. Confira a mensagem e tente de novo.", { param: "code" });
    }
    await this.prisma.$transaction([
      this.prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } }),
    ]);
    await this.audit.record({ actor: user, action: "user.phone_verified", resource: "user", resourceId: user.id, meta });
  }

  // ---------- Recuperação de senha ----------

  /** Sempre termina em silêncio: quem pede não descobre se o e-mail tem conta. */
  async forgotPassword(emailRaw: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(emailRaw) } });
    if (!user) return;
    const token = randomToken(32);
    await this.issueToken(user.id, "PASSWORD_RESET", user.email, token, RESET_LINK_MINUTES * 60_000);
    const link = `${loadEnv().appUrl}/redefinir-senha?token=${token}`;
    await this.notifications.sendEmail(
      user.email,
      "Redefinição de senha da VELQYRO PAY",
      `Olá, ${user.name.split(" ")[0]}.\n\nUse o link abaixo para criar uma nova senha:\n${link}\n\nO link vale por ${RESET_LINK_MINUTES} minutos e só pode ser usado uma vez. Se você não pediu, ignore esta mensagem.`,
    );
    await this.audit.record({ actor: user, action: "auth.password_reset_requested", resource: "user", resourceId: user.id, meta });
  }

  async resetPassword(token: string, password: string, meta: RequestMeta): Promise<void> {
    const record = await this.prisma.verificationToken.findFirst({ where: { type: "PASSWORD_RESET", tokenHash: sha256Hex(token) }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw errors.badRequest("link_invalido", "Este link expirou ou já foi usado. Peça uma nova redefinição de senha.");
    }
    const passwordHash = await hashPassword(password);
    // O "usedAt: null" na condição impede que duas requisições usem o mesmo link.
    const spent = await this.prisma.verificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (spent.count !== 1) throw errors.badRequest("link_invalido", "Este link já foi usado.");
    await this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
    const ended = await this.sessions.revokeAllForUser(record.userId);
    await this.audit.record({ actor: record.user, action: "auth.password_reset", resource: "user", resourceId: record.userId, meta, metadata: { sessionsEnded: ended } });
  }
}
