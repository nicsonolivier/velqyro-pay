import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Ponto único de envio de e-mail e SMS.
 * Nesta etapa o único adaptador é a caixa de saída: a mensagem é gravada no banco e
 * aparece em /dev/caixa-de-saida, sem sair para a internet.
 * Um provedor real (SMTP, API de e-mail, SMS) entra aqui depois, sem mudar quem chama.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    await this.prisma.outboxMessage.create({ data: { channel: "EMAIL", recipient: to, subject, body } });
  }

  async sendSms(to: string, body: string): Promise<void> {
    await this.prisma.outboxMessage.create({ data: { channel: "SMS", recipient: to, subject: "SMS", body } });
  }
}
