import { Injectable } from "@nestjs/common";
import type { Session, User } from "@prisma/client";
import type { CookieOptions, Response } from "express";
import type { RequestMeta } from "../common/request";
import { loadEnv } from "../config/env";
import { randomToken, sha256Hex } from "../crypto/tokens";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A sessão só regrava "visto por último" a cada 5 minutos, para não escrever no banco a cada requisição. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sessões opacas: o navegador guarda um token aleatório em cookie httpOnly e o banco guarda só o hash.
 * Encerrar uma sessão é marcar a linha como revogada, o que vale na requisição seguinte.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, meta: RequestMeta, mfaPending: boolean): Promise<{ token: string; session: Session }> {
    const token = randomToken(32);
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        mfaPending,
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + loadEnv().sessionTtlDays * DAY_MS),
      },
    });
    return { token, session };
  }

  async findValid(token: string): Promise<(Session & { user: User }) | null> {
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Encerra todas as sessões do usuário, com a opção de poupar a atual. Devolve quantas foram encerradas. */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  listActive(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, mfaPending: false, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  private cookieOptions(): CookieOptions {
    const env = loadEnv();
    return { httpOnly: true, secure: env.cookieSecure, sameSite: "lax", path: "/" };
  }

  setCookie(res: Response, token: string): void {
    const env = loadEnv();
    res.cookie(env.sessionCookieName, token, { ...this.cookieOptions(), maxAge: env.sessionTtlDays * DAY_MS });
  }

  clearCookie(res: Response): void {
    res.clearCookie(loadEnv().sessionCookieName, this.cookieOptions());
  }
}
