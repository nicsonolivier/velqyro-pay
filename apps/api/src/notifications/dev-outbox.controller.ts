import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/decorators";
import { errors } from "../common/errors";
import { loadEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

/** Caixa de saída de desenvolvimento. Só responde com DEV_OUTBOX=true, que a API recusa em produção. */
@Controller("dev/outbox")
export class DevOutboxController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async list() {
    if (!loadEnv().devOutbox) throw errors.notFound("nao_encontrado", "O recurso pedido não existe.");
    const messages = await this.prisma.outboxMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return { messages };
  }
}
