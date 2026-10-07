import { Injectable } from "@nestjs/common";
import type { Invitation, User } from "@prisma/client";
import { normalizeEmail, ROLE_LABEL } from "@velqyro/shared";
import type { Role } from "@velqyro/shared";
import { AuditService } from "../audit/audit.service";
import { errors } from "../common/errors";
import type { MembershipContext, RequestMeta } from "../common/request";
import { loadEnv } from "../config/env";
import { randomToken, sha256Hex } from "../crypto/tokens";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const INVITE_DAYS = 7;
const expiry = () => new Date(Date.now() + INVITE_DAYS * 24 * 3_600_000);
const isPending = (i: Invitation) => !i.acceptedAt && !i.revokedAt && i.expiresAt.getTime() > Date.now();

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private async send(email: string, token: string, organizationName: string, inviterName: string, role: Role): Promise<void> {
    const link = `${loadEnv().appUrl}/convite/${token}`;
    await this.notifications.sendEmail(
      email,
      `Convite para a equipe de ${organizationName} na VELQYRO PAY`,
      `${inviterName} convidou você para a equipe de ${organizationName}, com o papel ${ROLE_LABEL[role]}.\n\nAceite o convite:\n${link}\n\nO link vale por ${INVITE_DAYS} dias. Entre ou crie a conta com este mesmo e-mail.`,
    );
  }

  async list(organizationId: string) {
    const rows = await this.prisma.invitation.findMany({ where: { organizationId, acceptedAt: null, revokedAt: null }, orderBy: { createdAt: "desc" } });
    return rows.map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt, expired: i.expiresAt.getTime() <= Date.now() }));
  }

  async create(membership: MembershipContext, actor: User, emailRaw: string, role: Role, meta: RequestMeta) {
    const email = normalizeEmail(emailRaw);
    const organizationId = membership.organizationId;
    const alreadyMember = await this.prisma.organizationMember.findFirst({ where: { organizationId, user: { email } } });
    if (alreadyMember) throw errors.conflict("ja_e_membro", "Esta pessoa já faz parte da equipe.", { param: "email" });
    const open = await this.prisma.invitation.findFirst({ where: { organizationId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (open) throw errors.conflict("convite_pendente", "Já existe um convite pendente para este e-mail. Reenvie o convite existente.", { param: "email" });

    const token = randomToken(32);
    const invitation = await this.prisma.invitation.create({ data: { organizationId, email, role, tokenHash: sha256Hex(token), invitedById: actor.id, expiresAt: expiry() } });
    await this.send(email, token, membership.organization.name, actor.name, role);
    await this.audit.record({ actor, organizationId, action: "invitation.created", resource: "invitation", resourceId: invitation.id, meta, metadata: { email, role } });
    return { id: invitation.id, email, role, expiresAt: invitation.expiresAt };
  }

  private async ofOrganization(organizationId: string, invitationId: string): Promise<Invitation> {
    const invitation = await this.prisma.invitation.findFirst({ where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null } });
    if (!invitation) throw errors.notFound("convite_nao_encontrado", "Este convite não existe ou já foi usado.");
    return invitation;
  }

  /** Gera um link novo e invalida o anterior. */
  async resend(membership: MembershipContext, actor: User, invitationId: string, meta: RequestMeta) {
    const invitation = await this.ofOrganization(membership.organizationId, invitationId);
    const token = randomToken(32);
    await this.prisma.invitation.update({ where: { id: invitation.id }, data: { tokenHash: sha256Hex(token), expiresAt: expiry() } });
    await this.send(invitation.email, token, membership.organization.name, actor.name, invitation.role);
    await this.audit.record({ actor, organizationId: membership.organizationId, action: "invitation.resent", resource: "invitation", resourceId: invitation.id, meta, metadata: { email: invitation.email } });
    return { ok: true };
  }

  async revoke(membership: MembershipContext, actor: User, invitationId: string, meta: RequestMeta) {
    const invitation = await this.ofOrganization(membership.organizationId, invitationId);
    await this.prisma.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    await this.audit.record({ actor, organizationId: membership.organizationId, action: "invitation.revoked", resource: "invitation", resourceId: invitation.id, meta, metadata: { email: invitation.email } });
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
    await this.prisma.$transaction(async (tx) => {
      // O "acceptedAt: null" na condição impede aceitar o mesmo convite duas vezes.
      const spent = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
      if (spent.count !== 1) throw errors.notFound("convite_invalido", "Este convite já foi aceito.");
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
        create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role },
        update: {},
      });
      await this.audit.record(
        { actor: user, organizationId: invitation.organizationId, action: "invitation.accepted", resource: "invitation", resourceId: invitation.id, meta, metadata: { role: invitation.role } },
        tx,
      );
    });
    return { organizationId: invitation.organizationId, organizationName: invitation.organization.name, role: invitation.role };
  }
}
