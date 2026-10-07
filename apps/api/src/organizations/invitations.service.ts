import { Injectable } from "@nestjs/common";
import type { Invitation, Prisma, User } from "@prisma/client";
import { normalizeEmail, ROLE_LABEL } from "@velqyro/shared";
import type { Role } from "@velqyro/shared";
import { AuditService } from "../audit/audit.service";
import { errors } from "../common/errors";
import type { MembershipContext, RequestMeta } from "../common/request";
import { loadEnv } from "../config/env";
import { randomToken, sha256Hex } from "../crypto/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanGrant } from "./grants";

const INVITE_DAYS = 7;
const MAX_OPEN_INVITATIONS = 50;
const INVITATIONS_PAGE = 100;
const expiry = () => new Date(Date.now() + INVITE_DAYS * 24 * 3_600_000);
const isPending = (i: Invitation) => !i.acceptedAt && !i.revokedAt && i.expiresAt.getTime() > Date.now();

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** O e-mail é gravado na transação de quem chama: sem convite gravado não há mensagem, e vice-versa. */
  private async send(tx: Prisma.TransactionClient, email: string, token: string, organizationName: string, inviterName: string, role: Role): Promise<void> {
    const link = `${loadEnv().appUrl}/convite/${token}`;
    await this.notifications.sendEmail(
      email,
      `Convite para a equipe de ${organizationName} na VELQYRO PAY`,
      `${inviterName} convidou você para a equipe de ${organizationName}, com o papel ${ROLE_LABEL[role]}.\n\nAceite o convite:\n${link}\n\nO link vale por ${INVITE_DAYS} dias. Entre ou crie a conta com este mesmo e-mail.`,
      tx,
    );
  }

  async list(organizationId: string) {
    const rows = await this.prisma.invitation.findMany({ where: { organizationId, acceptedAt: null, revokedAt: null }, orderBy: { createdAt: "desc" }, take: INVITATIONS_PAGE });
    return rows.map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt, expired: i.expiresAt.getTime() <= Date.now() }));
  }

  async create(membership: MembershipContext, actor: User, emailRaw: string, role: Role, meta: RequestMeta) {
    assertCanGrant(membership.role, role);
    const email = normalizeEmail(emailRaw);
    const organizationId = membership.organizationId;
    const lockKey = `${organizationId}:${email}`;
    const token = randomToken(32);

    const invitation = await this.prisma.$transaction(async (tx) => {
      // Uma criação por vez para cada (organização, e-mail): sem isto, duas requisições simultâneas
      // passariam juntas pelas checagens abaixo e deixariam dois convites abertos para a mesma pessoa.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      const alreadyMember = await tx.organizationMember.findFirst({ where: { organizationId, user: { email } } });
      if (alreadyMember) throw errors.conflict("ja_e_membro", "Esta pessoa já faz parte da equipe.", { param: "email" });
      const now = new Date();
      const open = await tx.invitation.findFirst({ where: { organizationId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } });
      if (open) throw errors.conflict("convite_pendente", "Já existe um convite pendente para este e-mail. Reenvie o convite existente.", { param: "email" });
      const openInOrganization = await tx.invitation.count({ where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } });
      if (openInOrganization >= MAX_OPEN_INVITATIONS) {
        throw errors.conflict("limite_de_convites", "Esta organização já tem muitos convites pendentes. Cancele alguns antes de enviar novos.");
      }
      // O que sobrou para este e-mail é convite vencido e nunca cancelado: sai de cena antes do novo.
      await tx.invitation.updateMany({ where: { organizationId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });

      const created = await tx.invitation.create({ data: { organizationId, email, role, tokenHash: sha256Hex(token), invitedById: actor.id, expiresAt: expiry() } });
      await this.send(tx, email, token, membership.organization.name, actor.name, role);
      await this.audit.record({ actor, organizationId, action: "invitation.created", resource: "invitation", resourceId: created.id, meta, metadata: { email, role } }, tx);
      return created;
    });
    return { id: invitation.id, email, role, expiresAt: invitation.expiresAt };
  }

  /** Convite ainda aberto desta organização. Reenviar e cancelar exigem poder conceder o papel dele. */
  private async ofOrganization(membership: MembershipContext, invitationId: string): Promise<Invitation> {
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, organizationId: membership.organizationId, acceptedAt: null, revokedAt: null } });
    if (!invitation) throw this.gone();
    assertCanGrant(membership.role, invitation.role);
    return invitation;
  }

  private gone() {
    return errors.notFound("convite_nao_encontrado", "Este convite não existe ou já foi usado.");
  }

  /** Gera um link novo e invalida o anterior. Quem reenvia passa a responder pelo convite. */
  async resend(membership: MembershipContext, actor: User, invitationId: string, meta: RequestMeta) {
    const invitation = await this.ofOrganization(membership, invitationId);
    const token = randomToken(32);
    await this.prisma.$transaction(async (tx) => {
      // As condições repetem a leitura acima: se o convite foi aceito ou cancelado nesse meio-tempo, nada muda.
      const renewed = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null }, data: { tokenHash: sha256Hex(token), expiresAt: expiry(), invitedById: actor.id } });
      if (renewed.count !== 1) throw this.gone();
      await this.send(tx, invitation.email, token, membership.organization.name, actor.name, invitation.role);
      await this.audit.record(
        { actor, organizationId: membership.organizationId, action: "invitation.resent", resource: "invitation", resourceId: invitation.id, meta, metadata: { email: invitation.email } },
        tx,
      );
    });
    return { ok: true };
  }

  async revoke(membership: MembershipContext, actor: User, invitationId: string, meta: RequestMeta) {
    const invitation = await this.ofOrganization(membership, invitationId);
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      if (revoked.count !== 1) throw this.gone();
      await this.audit.record(
        { actor, organizationId: membership.organizationId, action: "invitation.revoked", resource: "invitation", resourceId: invitation.id, meta, metadata: { email: invitation.email } },
        tx,
      );
    });
    return { ok: true };
  }

  /** Dados mínimos para a tela de aceite. Público, porque quem recebe o link pode ainda não ter conta. */
  async preview(token: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { organization: true } });
    if (!invitation || !isPending(invitation)) throw errors.notFound("convite_invalido", "Este convite expirou, foi cancelado ou já foi aceito.");
    return { organizationName: invitation.organization.name, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt };
  }

  async accept(token: string, user: User, meta: RequestMeta) {
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { organization: true } });
    if (!invitation || !isPending(invitation)) throw errors.notFound("convite_invalido", "Este convite expirou, foi cancelado ou já foi aceito.");
    if (invitation.email !== user.email) {
      throw errors.forbidden("convite_de_outro_email", `Este convite foi enviado para ${invitation.email}. Entre com essa conta para aceitar.`);
    }
    if (invitation.organization.status === "SUSPENDED") {
      throw errors.forbidden("organizacao_suspensa", "Esta organização está suspensa e não pode receber novos membros.");
    }
    const role = await this.prisma.$transaction(async (tx) => {
      // O "acceptedAt: null" na condição impede aceitar o mesmo convite duas vezes.
      const spent = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
      if (spent.count !== 1) throw errors.notFound("convite_invalido", "Este convite já foi aceito.");
      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
        create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role },
        update: {},
      });
      await this.audit.record(
        { actor: user, organizationId: invitation.organizationId, action: "invitation.accepted", resource: "invitation", resourceId: invitation.id, meta, metadata: { role: member.role } },
        tx,
      );
      // Quem já era membro continua com o papel que tinha: o convite não rebaixa nem promove.
      return member.role;
    });
    return { organizationId: invitation.organizationId, organizationName: invitation.organization.name, role };
  }
}
