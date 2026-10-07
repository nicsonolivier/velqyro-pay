import { Injectable } from "@nestjs/common";
import type { Session, User } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { errors } from "../common/errors";
import type { RequestMeta } from "../common/request";
import { loadEnv } from "../config/env";
import { verifyPassword } from "../crypto/password";
import { decryptSecret, encryptSecret } from "../crypto/secretbox";
import { normalizeRecoveryCode, randomRecoveryCode, sha256Hex } from "../crypto/tokens";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../crypto/totp";
import { PrismaService } from "../prisma/prisma.service";
import { SessionsService } from "./sessions.service";

const ISSUER = "VELQYRO PAY";
const RECOVERY_CODES = 8;
const MAX_LOGIN_ATTEMPTS = 5;

/** Verificação em duas etapas por aplicativo autenticador (TOTP), com códigos de recuperação de uso único. */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  async isEnabled(userId: string): Promise<boolean> {
    const method = await this.prisma.twoFactorMethod.findUnique({ where: { userId } });
    return Boolean(method?.enabledAt);
  }

  /** Gera um segredo novo e devolve os dados para o aplicativo autenticador. Só vale depois de enable(). */
  async setup(user: User): Promise<{ secret: string; otpauthUri: string }> {
    const existing = await this.prisma.twoFactorMethod.findUnique({ where: { userId: user.id } });
    if (existing?.enabledAt) throw errors.conflict("2fa_ja_ativo", "A verificação em duas etapas já está ativa.");
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret, loadEnv().encryptionKey);
    await this.prisma.twoFactorMethod.upsert({
      where: { userId: user.id },
      create: { userId: user.id, secretEncrypted },
      update: { secretEncrypted, enabledAt: null },
    });
    return { secret, otpauthUri: otpauthUri({ issuer: ISSUER, account: user.email, secret }) };
  }

  async enable(user: User, code: string, meta: RequestMeta): Promise<{ recoveryCodes: string[] }> {
    const method = await this.prisma.twoFactorMethod.findUnique({ where: { userId: user.id } });
    if (!method) throw errors.badRequest("2fa_nao_iniciado", "Comece a ativação antes de informar o código.");
    if (method.enabledAt) throw errors.conflict("2fa_ja_ativo", "A verificação em duas etapas já está ativa.");
    const secret = decryptSecret(method.secretEncrypted, loadEnv().encryptionKey);
    if (!verifyTotp(secret, code)) throw errors.badRequest("codigo_incorreto", "Código incorreto. Confira o aplicativo autenticador.", { param: "code" });

    const recoveryCodes = Array.from({ length: RECOVERY_CODES }, () => randomRecoveryCode());
    await this.prisma.$transaction(async (tx) => {
      await tx.twoFactorMethod.update({ where: { userId: user.id }, data: { enabledAt: new Date() } });
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.recoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId: user.id, codeHash: sha256Hex(c) })) });
      await this.audit.record({ actor: user, action: "two_factor.enabled", resource: "user", resourceId: user.id, meta }, tx);
    });
    return { recoveryCodes };
  }

  async disable(user: User, password: string, code: string, meta: RequestMeta): Promise<void> {
    const method = await this.prisma.twoFactorMethod.findUnique({ where: { userId: user.id } });
    if (!method?.enabledAt) throw errors.badRequest("2fa_inativo", "A verificação em duas etapas não está ativa.");
    if (!(await verifyPassword(password, user.passwordHash))) throw errors.badRequest("senha_incorreta", "A senha atual não confere.", { param: "password" });
    if (!(await this.checkCode(user.id, method.secretEncrypted, { code, recoveryCode: code }))) {
      throw errors.badRequest("codigo_incorreto", "Código incorreto. Use o aplicativo autenticador ou um código de recuperação.", { param: "code" });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.twoFactorMethod.delete({ where: { userId: user.id } });
      await this.audit.record({ actor: user, action: "two_factor.disabled", resource: "user", resourceId: user.id, meta }, tx);
    });
  }

  /** Conclui um login que estava esperando o segundo fator. Depois de 5 erros a sessão é encerrada. */
  async completeLogin(user: User, session: Session, input: { code?: string; recoveryCode?: string }, meta: RequestMeta): Promise<void> {
    if (!session.mfaPending) throw errors.badRequest("2fa_nao_pendente", "Este login não está esperando um código.");
    const method = await this.prisma.twoFactorMethod.findUnique({ where: { userId: user.id } });
    if (!method?.enabledAt) throw errors.badRequest("2fa_inativo", "A verificação em duas etapas não está ativa.");

    const usedRecovery = !input.code && Boolean(input.recoveryCode);
    if (await this.checkCode(user.id, method.secretEncrypted, input)) {
      await this.prisma.session.update({ where: { id: session.id }, data: { mfaPending: false, mfaAttempts: 0 } });
      await this.audit.record({ actor: user, action: "auth.two_factor_passed", resource: "session", resourceId: session.id, meta, metadata: { recoveryCode: usedRecovery } });
      return;
    }

    const updated = await this.prisma.session.update({ where: { id: session.id }, data: { mfaAttempts: { increment: 1 } } });
    if (updated.mfaAttempts >= MAX_LOGIN_ATTEMPTS) {
      await this.sessions.revoke(session.id);
      await this.audit.record({ actor: user, action: "auth.two_factor_locked", resource: "session", resourceId: session.id, meta });
      throw errors.unauthorized("sessao_encerrada", "Muitos códigos errados. Entre de novo com e-mail e senha.");
    }
    throw errors.badRequest("codigo_incorreto", "Código incorreto. Confira o aplicativo autenticador.", { param: usedRecovery ? "recoveryCode" : "code" });
  }

  /** Confere um código TOTP ou gasta um código de recuperação. */
  private async checkCode(userId: string, secretEncrypted: string, input: { code?: string; recoveryCode?: string }): Promise<boolean> {
    const digits = String(input.code ?? "").replace(/\D/g, "");
    if (digits.length === 6 && verifyTotp(decryptSecret(secretEncrypted, loadEnv().encryptionKey), digits)) return true;

    const recovery = normalizeRecoveryCode(input.recoveryCode ?? "");
    if (recovery.length !== 11) return false;
    // updateMany com "usedAt: null" garante que o mesmo código não vale em duas requisições simultâneas.
    const spent = await this.prisma.recoveryCode.updateMany({ where: { userId, codeHash: sha256Hex(recovery), usedAt: null }, data: { usedAt: new Date() } });
    return spent.count === 1;
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }
}
