import { Injectable } from "@nestjs/common";
import type { Organization, User } from "@prisma/client";
import { maskDocument, onlyDigits } from "@velqyro/shared";
import type { Role } from "@velqyro/shared";
import { AuditService } from "../audit/audit.service";
import { errors } from "../common/errors";
import type { MembershipContext, RequestMeta } from "../common/request";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateOrganizationDto, UpdateOrganizationDto } from "./dto";

export function presentOrganization(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    legalName: org.legalName,
    type: org.type,
    document: maskDocument(org.document),
    segment: org.segment,
    status: org.status,
    createdAt: org.createdAt,
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Cria a organização e torna quem criou o proprietário, na mesma transação. */
  async create(user: User, dto: CreateOrganizationDto, meta: RequestMeta) {
    const document = onlyDigits(dto.document);
    if (await this.prisma.organization.findUnique({ where: { document } })) {
      throw errors.conflict("documento_em_uso", "Já existe uma conta com este documento.", { param: "document" });
    }
    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name: dto.name, legalName: dto.legalName?.trim() || (dto.type === "PF" ? user.name : dto.name), type: dto.type, document, segment: dto.segment },
      });
      await tx.organizationMember.create({ data: { organizationId: created.id, userId: user.id, role: "OWNER" } });
      await this.audit.record(
        { actor: user, organizationId: created.id, action: "organization.created", resource: "organization", resourceId: created.id, meta, metadata: { type: dto.type, segment: dto.segment } },
        tx,
      );
      return created;
    });
    return presentOrganization(org);
  }

  async update(membership: MembershipContext, user: User, dto: UpdateOrganizationDto, meta: RequestMeta) {
    const org = await this.prisma.organization.update({ where: { id: membership.organizationId }, data: { name: dto.name, segment: dto.segment } });
    await this.audit.record({ actor: user, organizationId: org.id, action: "organization.updated", resource: "organization", resourceId: org.id, meta, metadata: { name: dto.name, segment: dto.segment } });
    return presentOrganization(org);
  }

  async listMembers(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({ where: { organizationId }, include: { user: true }, orderBy: { createdAt: "asc" } });
    return members.map((m) => ({ id: m.id, role: m.role, since: m.createdAt, user: { id: m.user.id, name: m.user.name, email: m.user.email } }));
  }

  private async memberOf(organizationId: string, memberId: string) {
    // A condição por organizationId impede mexer em membro de outra organização adivinhando o ID.
    const member = await this.prisma.organizationMember.findFirst({ where: { id: memberId, organizationId }, include: { user: true } });
    if (!member) throw errors.notFound("membro_nao_encontrado", "Esta pessoa não faz parte da equipe.");
    return member;
  }

  async changeRole(membership: MembershipContext, actor: User, memberId: string, role: Role, meta: RequestMeta) {
    const member = await this.memberOf(membership.organizationId, memberId);
    if (member.role === "OWNER") throw errors.forbidden("proprietario_protegido", "O papel do proprietário só muda por transferência de posse.");
    if (member.userId === actor.id) throw errors.forbidden("proprio_papel", "Você não pode alterar o seu próprio papel.");
    if (member.role === role) return { ok: true };
    await this.prisma.organizationMember.update({ where: { id: member.id }, data: { role } });
    await this.audit.record({
      actor,
      organizationId: membership.organizationId,
      action: "member.role_changed",
      resource: "organization_member",
      resourceId: member.id,
      meta,
      metadata: { member: member.user.email, from: member.role, to: role },
    });
    return { ok: true };
  }

  async removeMember(membership: MembershipContext, actor: User, memberId: string, meta: RequestMeta) {
    const member = await this.memberOf(membership.organizationId, memberId);
    if (member.role === "OWNER") throw errors.forbidden("proprietario_protegido", "O proprietário não pode ser removido da organização.");
    if (member.userId === actor.id) throw errors.forbidden("remover_a_si_mesmo", "Você não pode remover a si mesmo da equipe.");
    await this.prisma.organizationMember.delete({ where: { id: member.id } });
    await this.audit.record({
      actor,
      organizationId: membership.organizationId,
      action: "member.removed",
      resource: "organization_member",
      resourceId: member.id,
      meta,
      metadata: { member: member.user.email, role: member.role },
    });
    return { ok: true };
  }
}
