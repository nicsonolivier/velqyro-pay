import { Injectable } from "@nestjs/common";
import type { Organization, User } from "@prisma/client";
import { grantableRoles, maskDocument, normalizeDocument } from "@velqyro/shared";
import type { Role } from "@velqyro/shared";
import { AuditService } from "../audit/audit.service";
import { errors } from "../common/errors";
import type { MembershipContext, RequestMeta } from "../common/request";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateOrganizationDto, UpdateOrganizationDto } from "./dto";
import { assertCanGrant } from "./grants";

const MEMBERS_PAGE = 200;

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
    const document = normalizeDocument(dto.type, dto.document);
    const lockKey = `documento:${document}`;
    const org = await this.prisma.$transaction(async (tx) => {
      // Uma criação por vez para cada documento: dois cliques no mesmo botão não viram duas organizações.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      // O documento não é único no banco. Antes do KYC (Etapa 2) ninguém provou ser dono dele, então
      // digitar o CNPJ de outra empresa não pode impedir a dona de se cadastrar. Só há recusa quando a mesma
      // pessoa repete o documento ou quando ele já pertence a uma organização verificada.
      // Duplicatas entre organizações pendentes são resolvidas na análise de KYC.
      const taken = await tx.organization.findFirst({
        where: { document, OR: [{ status: { in: ["ACTIVE", "RESTRICTED", "SUSPENDED"] } }, { members: { some: { userId: user.id } } }] },
      });
      if (taken) throw errors.conflict("documento_em_uso", "Já existe uma conta com este documento.", { param: "document" });
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
    const org = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({ where: { id: membership.organizationId }, data: { name: dto.name, segment: dto.segment } });
      await this.audit.record(
        { actor: user, organizationId: updated.id, action: "organization.updated", resource: "organization", resourceId: updated.id, meta, metadata: { name: dto.name, segment: dto.segment } },
        tx,
      );
      return updated;
    });
    return presentOrganization(org);
  }

  async listMembers(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({ where: { organizationId }, include: { user: true }, orderBy: { createdAt: "asc" }, take: MEMBERS_PAGE });
    return members.map((m) => ({ id: m.id, role: m.role, since: m.createdAt, user: { id: m.user.id, name: m.user.name, email: m.user.email } }));
  }

  private async memberOf(organizationId: string, memberId: string) {
    // A condição por organizationId impede mexer em membro de outra organização adivinhando o ID.
    const member = await this.prisma.organizationMember.findFirst({ where: { id: memberId, organizationId }, include: { user: true } });
    if (!member) throw errors.notFound("membro_nao_encontrado", "Esta pessoa não faz parte da equipe.");
    return member;
  }

  /** O membro mudou ou saiu entre a leitura e a escrita (dois cliques, ou outra pessoa agindo ao mesmo tempo). */
  private staleMember() {
    return errors.conflict("conflito", "A equipe mudou enquanto você fazia esta alteração. Atualize a página e tente de novo.");
  }

  async changeRole(membership: MembershipContext, actor: User, memberId: string, role: Role, meta: RequestMeta) {
    const organizationId = membership.organizationId;
    const member = await this.memberOf(organizationId, memberId);
    if (member.role === "OWNER") throw errors.forbidden("proprietario_protegido", "O papel do proprietário só muda por transferência de posse.");
    if (member.userId === actor.id) throw errors.forbidden("proprio_papel", "Você não pode alterar o seu próprio papel.");
    assertCanGrant(membership.role, member.role, role);
    if (member.role === role) return { ok: true };
    // Quem deixa de poder conceder um papel perde os convites pendentes que fez com ele.
    // Para um papel que não gerencia a equipe a lista é vazia, e todos os convites dele caem.
    const stillGrantable = grantableRoles(role);
    await this.prisma.$transaction(async (tx) => {
      // O "role" na condição garante que a checagem acima valeu para o papel que está sendo trocado.
      const changed = await tx.organizationMember.updateMany({ where: { id: member.id, organizationId, role: member.role }, data: { role } });
      if (changed.count !== 1) throw this.staleMember();
      const revoked = await tx.invitation.updateMany({
        where: { organizationId, invitedById: member.userId, acceptedAt: null, revokedAt: null, ...(stillGrantable.length ? { role: { notIn: stillGrantable } } : {}) },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          actor,
          organizationId,
          action: "member.role_changed",
          resource: "organization_member",
          resourceId: member.id,
          meta,
          metadata: { member: member.user.email, from: member.role, to: role, invitationsRevoked: revoked.count },
        },
        tx,
      );
    });
    return { ok: true };
  }

  async removeMember(membership: MembershipContext, actor: User, memberId: string, meta: RequestMeta) {
    const organizationId = membership.organizationId;
    const member = await this.memberOf(organizationId, memberId);
    if (member.role === "OWNER") throw errors.forbidden("proprietario_protegido", "O proprietário não pode ser removido da organização.");
    if (member.userId === actor.id) throw errors.forbidden("remover_a_si_mesmo", "Você não pode remover a si mesmo da equipe.");
    assertCanGrant(membership.role, member.role);
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.organizationMember.deleteMany({ where: { id: member.id, organizationId, role: member.role } });
      if (removed.count !== 1) throw this.staleMember();
      // Quem saiu da equipe não deixa convites valendo em nome dela.
      const revoked = await tx.invitation.updateMany({
        where: { organizationId, invitedById: member.userId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          actor,
          organizationId,
          action: "member.removed",
          resource: "organization_member",
          resourceId: member.id,
          meta,
          metadata: { member: member.user.email, role: member.role, invitationsRevoked: revoked.count },
        },
        tx,
      );
    });
    return { ok: true };
  }
}
