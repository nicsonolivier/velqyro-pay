import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ALLOW_MFA_PENDING, ALLOW_UNVERIFIED, IS_PUBLIC } from "../common/decorators";
import { errors } from "../common/errors";
import { loadEnv } from "../config/env";
import { SessionsService } from "./sessions.service";

/**
 * Guarda global. Toda rota exige sessão válida, 2FA concluído e e-mail confirmado,
 * a não ser que a rota declare o contrário com @Public, @AllowMfaPending ou @AllowUnverified.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const req = context.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[loadEnv().sessionCookieName];
    const session = typeof token === "string" ? await this.sessions.findValid(token) : null;

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      if (session && !session.mfaPending) req.auth = { user: session.user, session };
      return true;
    }

    if (!session) throw errors.unauthorized("nao_autenticado", "Entre na sua conta para continuar.");
    if (session.mfaPending && !this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING, targets)) {
      throw errors.unauthorized("verificacao_2fa_pendente", "Digite o código do aplicativo autenticador para concluir o login.");
    }
    if (!session.user.emailVerifiedAt && !this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED, targets)) {
      throw errors.forbidden("email_nao_verificado", "Confirme seu e-mail para continuar.");
    }
    req.auth = { user: session.user, session };
    return true;
  }
}
