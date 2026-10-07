import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AppError, errors } from "../common/errors";
import type { RequestMeta } from "../common/request";
import { verifyPassword } from "../crypto/password";
import { PrismaService } from "../prisma/prisma.service";

export const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Contador único de tentativas erradas por conta. Senha no login, segundo fator e as rotas
 * que pedem a senha de novo somam no mesmo contador: ao chegar a 5 a conta fica bloqueada por 15 minutos.
 */
@Injectable()
export class LoginAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  lockedError(until: Date): AppError {
    const seconds = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
    return errors.tooMany("conta_bloqueada", `Muitas tentativas erradas. Tente de novo em ${Math.ceil(seconds / 60)} minuto(s).`, seconds);
  }

  /** Recusa com 429 enquanto o bloqueio estiver valendo. */
  assertNotLocked(user: Pick<User, "lockedUntil">): void {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw this.lockedError(user.lockedUntil);
  }

  /**
   * Relê o bloqueio no banco. Usado depois de conferir a senha ou o código: uma requisição que
   * começou antes do bloqueio não pode passar só porque a conferência demorou.
   */
  async assertNotLockedNow(userId: string): Promise<void> {
    const fresh = await this.prisma.user.findUnique({ where: { id: userId }, select: { lockedUntil: true } });
    if (fresh) this.assertNotLocked(fresh);
  }

  /**
   * Soma uma tentativa errada. O incremento é feito pelo banco, então duas requisições simultâneas
   * contam duas vezes. Devolve até quando a conta ficou bloqueada, ou null se o limite não foi atingido.
   */
  async registerFailure(userId: string): Promise<Date | null> {
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
    if (updated.failedLoginCount < MAX_FAILED_ATTEMPTS) return null;
    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
    // O contador volta a zero junto com o bloqueio: quando ele vencer, a contagem recomeça.
    await this.prisma.user.updateMany({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil } });
    return lockedUntil;
  }

  /** Zera o contador depois de um login completo. Não mexe em lockedUntil: um bloqueio vencido não atrapalha. */
  async reset(userId: string): Promise<void> {
    await this.prisma.user.updateMany({ where: { id: userId, failedLoginCount: { gt: 0 } }, data: { failedLoginCount: 0 } });
  }

  /**
   * Confere a senha nas rotas que a pedem de novo (trocar a senha, ativar ou desativar o 2FA).
   * Sem o contador, quem tem uma sessão aberta poderia testar senhas à vontade.
   */
  async confirmPassword(user: User, password: string, param: string, meta: RequestMeta): Promise<void> {
    this.assertNotLocked(user);
    if (await verifyPassword(password, user.passwordHash)) return this.assertNotLockedNow(user.id);
    const lockedUntil = await this.registerFailure(user.id);
    if (!lockedUntil) throw errors.badRequest("senha_incorreta", "A senha atual não confere.", { param });
    await this.audit.record({ actor: user, action: "auth.account_locked", resource: "user", resourceId: user.id, meta, metadata: { reason: "reauth" } });
    throw this.lockedError(lockedUntil);
  }
}
