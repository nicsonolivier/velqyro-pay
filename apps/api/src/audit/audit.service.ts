import { Injectable } from "@nestjs/common";
import type { Prisma, User } from "@prisma/client";
import type { RequestMeta } from "../common/request";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  /** Quem fez. Nulo para ações do sistema ou de quem ainda não tem conta. */
  actor: Pick<User, "id" | "name" | "email"> | null;
  organizationId?: string | null;
  /** Verbo estável, por exemplo "member.role_changed". */
  action: string;
  resource: string;
  resourceId?: string | null;
  meta?: RequestMeta;
  /** Só dados seguros: nada de senhas, tokens ou segredos. */
  metadata?: Prisma.InputJsonObject;
}

type Db = PrismaService | Prisma.TransactionClient;

/** Registro de ações sensíveis. A tabela só aceita inserção (há um gatilho no banco). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        actorUserId: entry.actor?.id ?? null,
        actorLabel: entry.actor ? `${entry.actor.name} <${entry.actor.email}>` : "Sistema",
        organizationId: entry.organizationId ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        ip: entry.meta?.ip ?? null,
        userAgent: entry.meta?.userAgent ?? null,
        metadata: { ...(entry.metadata ?? {}), requestId: entry.meta?.requestId ?? null },
      },
    });
  }

  async listForOrganization(organizationId: string, limit: number, cursor?: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }
}
