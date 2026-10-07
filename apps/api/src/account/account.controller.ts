import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { onlyDigits } from "@velqyro/shared";
import { AuditService } from "../audit/audit.service";
import { LoginAttemptsService } from "../auth/login-attempts.service";
import { SessionsService } from "../auth/sessions.service";
import { TwoFactorService } from "../auth/two-factor.service";
import { CurrentAuth, Meta } from "../common/decorators";
import { errors } from "../common/errors";
import type { AuthContext, RequestMeta } from "../common/request";
import { hashPassword } from "../crypto/password";
import { PrismaService } from "../prisma/prisma.service";
import { ChangePasswordDto, DisableTwoFactorDto, SetupTwoFactorDto, TwoFactorCodeDto, UpdateProfileDto } from "./dto";

const STRICT = { default: { limit: 10, ttl: 60_000 } };

/** Dados e segurança da própria conta: perfil, senha, sessões e 2FA. */
@Controller("account")
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorService,
    private readonly attempts: LoginAttemptsService,
    private readonly audit: AuditService,
  ) {}

  @Patch()
  async updateProfile(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateProfileDto, @Meta() meta: RequestMeta) {
    const phone = onlyDigits(dto.phone);
    const phoneChanged = phone !== auth.user.phone;
    await this.prisma.user.update({
      where: { id: auth.user.id },
      // Trocar o telefone exige confirmar o número novo.
      data: { name: dto.name, phone, ...(phoneChanged ? { phoneVerifiedAt: null } : {}) },
    });
    await this.audit.record({ actor: auth.user, action: "user.profile_updated", resource: "user", resourceId: auth.user.id, meta, metadata: { phoneChanged } });
    return { ok: true };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post("password")
  async changePassword(@CurrentAuth() auth: AuthContext, @Body() dto: ChangePasswordDto, @Meta() meta: RequestMeta) {
    await this.attempts.confirmPassword(auth.user, dto.currentPassword, "currentPassword", meta);
    await this.prisma.user.update({ where: { id: auth.user.id }, data: { passwordHash: await hashPassword(dto.newPassword) } });
    const ended = await this.sessions.revokeAllForUser(auth.user.id, auth.session.id);
    await this.audit.record({ actor: auth.user, action: "user.password_changed", resource: "user", resourceId: auth.user.id, meta, metadata: { sessionsEnded: ended } });
    return { ok: true, sessionsEnded: ended };
  }

  @Get("sessions")
  async listSessions(@CurrentAuth() auth: AuthContext) {
    const list = await this.sessions.listActive(auth.user.id);
    return {
      sessions: list.map((s) => ({ id: s.id, current: s.id === auth.session.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt })),
    };
  }

  @HttpCode(200)
  @Post("sessions/revoke-others")
  async revokeOthers(@CurrentAuth() auth: AuthContext, @Meta() meta: RequestMeta) {
    const ended = await this.sessions.revokeAllForUser(auth.user.id, auth.session.id);
    await this.audit.record({ actor: auth.user, action: "session.revoked_others", resource: "user", resourceId: auth.user.id, meta, metadata: { sessionsEnded: ended } });
    return { ok: true, sessionsEnded: ended };
  }

  @Delete("sessions/:sessionId")
  async revokeSession(@CurrentAuth() auth: AuthContext, @Param("sessionId", new ParseUUIDPipe()) sessionId: string, @Meta() meta: RequestMeta) {
    // A condição por userId impede encerrar a sessão de outra pessoa adivinhando o ID.
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId: auth.user.id, revokedAt: null } });
    if (!session) throw errors.notFound("sessao_nao_encontrada", "Esta sessão não existe ou já foi encerrada.");
    if (session.id === auth.session.id) throw errors.badRequest("sessao_atual", "Para encerrar a sessão atual, use Sair.");
    await this.sessions.revoke(session.id);
    await this.audit.record({ actor: auth.user, action: "session.revoked", resource: "session", resourceId: session.id, meta });
    return { ok: true };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post("2fa/setup")
  async setupTwoFactor(@CurrentAuth() auth: AuthContext, @Body() dto: SetupTwoFactorDto, @Meta() meta: RequestMeta) {
    // Pede a senha de novo: uma sessão esquecida aberta não basta para trocar o segundo fator da conta.
    await this.attempts.confirmPassword(auth.user, dto.password, "password", meta);
    return this.twoFactor.setup(auth.user);
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post("2fa/enable")
  enableTwoFactor(@CurrentAuth() auth: AuthContext, @Body() dto: TwoFactorCodeDto, @Meta() meta: RequestMeta) {
    return this.twoFactor.enable(auth.user, dto.code, auth.session.id, meta);
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post("2fa/disable")
  async disableTwoFactor(@CurrentAuth() auth: AuthContext, @Body() dto: DisableTwoFactorDto, @Meta() meta: RequestMeta) {
    await this.twoFactor.disable(auth.user, dto.password, dto.code, meta);
    return { ok: true };
  }

  @Get("2fa")
  async twoFactorStatus(@CurrentAuth() auth: AuthContext) {
    const enabled = await this.twoFactor.isEnabled(auth.user.id);
    return { enabled, recoveryCodesLeft: enabled ? await this.twoFactor.remainingRecoveryCodes(auth.user.id) : 0 };
  }
}
