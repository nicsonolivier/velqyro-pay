import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { can, ROLE_LABEL } from "@velqyro/shared";
import { isUUID } from "class-validator";
import type { Request } from "express";
import { PERMISSION, PermissionRequirement } from "../common/decorators";
import { errors } from "../common/errors";
import { PrismaService } from "../prisma/prisma.service";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Isolamento entre organizações. Toda rota com :orgId passa por aqui:
 * 1. a pessoa precisa ser membro da organização (quem não é recebe 404, igual a uma organização inexistente);
 * 2. o papel dela precisa alcançar a permissão declarada em @RequirePermission.
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const orgId = req.params.orgId;
    const notFound = () => errors.notFound("organizacao_nao_encontrada", "Organização não encontrada.");
    if (!req.auth || !isUUID(orgId)) throw notFound();

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.auth.user.id } },
      include: { organization: true },
    });
    if (!membership) throw notFound();

    if (membership.organization.status === "SUSPENDED" && !READ_METHODS.has(req.method)) {
      throw errors.forbidden("organizacao_suspensa", "Esta conta está suspensa. Só é possível consultar os dados.");
    }

    const required = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(PERMISSION, [context.getHandler(), context.getClass()]);
    if (required && !can(membership.role, required.area, required.level)) {
      throw errors.forbidden("sem_permissao", `O papel ${ROLE_LABEL[membership.role]} não tem acesso a esta ação.`);
    }
    req.membership = membership;
    return true;
  }
}
