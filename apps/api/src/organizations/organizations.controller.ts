import { Body, Controller, DefaultValuePipe, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { isUUID } from "class-validator";
import { AuditService } from "../audit/audit.service";
import { CurrentAuth, CurrentMembership, Meta, Public, RequirePermission } from "../common/decorators";
import type { AuthContext, MembershipContext, RequestMeta } from "../common/request";
import { PrismaService } from "../prisma/prisma.service";
import { ChangeRoleDto, CreateOrganizationDto, InviteDto, UpdateOrganizationDto } from "./dto";
import { InvitationsService } from "./invitations.service";
import { OrgAccessGuard } from "./org-access.guard";
import { OrganizationsService, presentOrganization } from "./organizations.service";

const STRICT = { default: { limit: 20, ttl: 60_000 } };

@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async listMine(@CurrentAuth() auth: AuthContext) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId: auth.user.id }, include: { organization: true }, orderBy: { createdAt: "asc" } });
    return { organizations: memberships.map((m) => ({ ...presentOrganization(m.organization), role: m.role })) };
  }

  @Throttle(STRICT)
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateOrganizationDto, @Meta() meta: RequestMeta) {
    return this.organizations.create(auth.user, dto, meta);
  }

  @UseGuards(OrgAccessGuard)
  @Get(":orgId")
  get(@CurrentMembership() membership: MembershipContext) {
    return { ...presentOrganization(membership.organization), role: membership.role };
  }

  @UseGuards(OrgAccessGuard)
  @RequirePermission("business", "manage")
  @Patch(":orgId")
  update(@CurrentAuth() auth: AuthContext, @CurrentMembership() membership: MembershipContext, @Body() dto: UpdateOrganizationDto, @Meta() meta: RequestMeta) {
    return this.organizations.update(membership, auth.user, dto, meta);
  }

  // ---------- Equipe ----------

  @UseGuards(OrgAccessGuard)
  @RequirePermission("team", "view")
  @Get(":orgId/members")
  async members(@CurrentMembership() membership: MembershipContext) {
    return { members: await this.organizations.listMembers(membership.organizationId) };
  }

  @UseGuards(OrgAccessGuard)
  @RequirePermission("team", "manage")
  @Patch(":orgId/members/:memberId")
  changeRole(
    @CurrentAuth() auth: AuthContext,
    @CurrentMembership() membership: MembershipContext,
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
    @Body() dto: ChangeRoleDto,
    @Meta() meta: RequestMeta,
  ) {
    return this.organizations.changeRole(membership, auth.user, memberId, dto.role, meta);
  }

  @UseGuards(OrgAccessGuard)
  @RequirePermission("team", "manage")
  @Delete(":orgId/members/:memberId")
  removeMember(
    @CurrentAuth() auth: AuthContext,
    @CurrentMembership() membership: MembershipContext,
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.organizations.removeMember(membership, auth.user, memberId, meta);
  }

  // ---------- Convites ----------

  @UseGuards(OrgAccessGuard)
  @RequirePermission("team", "view")
  @Get(":orgId/invitations")
  async listInvitations(@CurrentMembership() membership: MembershipContext) {
    return { invitations: await this.invitations.list(membership.organizationId) };
  }

  @UseGuards(OrgAccessGuard)
  @RequirePermission("team", "manage")
  @Throttle(STRICT)
  @Post(":orgId/invitations")
  invite(@CurrentAuth() auth: AuthContext, @CurrentMembership() membership: MembershipContext, @Body() dto: InviteDto, @Meta() meta: RequestMeta) {
    return this.invitations.create(membership, auth.user, dto.email, dto.role, meta);
  }

  @UseGuards(OrgAccessGuard)
  @RequirePermission("team", "manage")
  @Throttle(STRICT)
  @HttpCode(200)
  @Post(":orgId/invitations/:invitationId/resend")
  resendInvitation(
    @CurrentAuth() auth: AuthContext,
    @CurrentMembership() membership: MembershipContext,
    @Param("invitationId", new ParseUUIDPipe()) invitationId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.invitations.resend(membership, auth.user, invitationId, meta);
  }

  @UseGuards(OrgAccessGuard)
  @RequirePermission("team", "manage")
  @Delete(":orgId/invitations/:invitationId")
  revokeInvitation(
    @CurrentAuth() auth: AuthContext,
    @CurrentMembership() membership: MembershipContext,
    @Param("invitationId", new ParseUUIDPipe()) invitationId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.invitations.revoke(membership, auth.user, invitationId, meta);
  }

  // ---------- Auditoria ----------

  @UseGuards(OrgAccessGuard)
  @RequirePermission("audit", "view")
  @Get(":orgId/audit-logs")
  async auditLogs(
    @CurrentMembership() membership: MembershipContext,
    @Query("limit", new DefaultValuePipe(30), ParseIntPipe) limit: number,
    @Query("cursor") cursor?: string,
  ) {
    const page = await this.audit.listForOrganization(membership.organizationId, Math.min(Math.max(limit, 1), 100), cursor && isUUID(cursor) ? cursor : undefined);
    return {
      items: page.items.map((a) => ({ id: a.id, actor: a.actorLabel, action: a.action, resource: a.resource, resourceId: a.resourceId, ip: a.ip, metadata: a.metadata, createdAt: a.createdAt })),
      nextCursor: page.nextCursor,
    };
  }
}

/** Aceite de convite: fica fora de /organizations/:orgId porque quem aceita ainda não é membro. */
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Throttle(STRICT)
  @Get(":token")
  preview(@Param("token") token: string) {
    return this.invitations.preview(token);
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post(":token/accept")
  accept(@Param("token") token: string, @CurrentAuth() auth: AuthContext, @Meta() meta: RequestMeta) {
    return this.invitations.accept(token, auth.user, meta);
  }
}
