import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Area, Level } from "@velqyro/shared";
import type { Request } from "express";
import { AuthContext, MembershipContext, RequestMeta, requestMeta } from "./request";

export const IS_PUBLIC = "vq:public";
/** Rota que não exige sessão. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_MFA_PENDING = "vq:allowMfaPending";
/** Rota acessível enquanto o login ainda espera o código de 2FA. */
export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING, true);

export const ALLOW_UNVERIFIED = "vq:allowUnverified";
/** Rota acessível antes de o e-mail ser confirmado. */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED, true);

export const PERMISSION = "vq:permission";
export interface PermissionRequirement {
  area: Area;
  level: Level;
}
/** Exige um nível de acesso em uma área. Só funciona junto do OrgAccessGuard. */
export const RequirePermission = (area: Area, level: Level = "view") => SetMetadata(PERMISSION, { area, level } satisfies PermissionRequirement);

export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.auth) throw new Error("CurrentAuth usado em rota sem sessão.");
  return req.auth;
});

export const CurrentMembership = createParamDecorator((_data: unknown, ctx: ExecutionContext): MembershipContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.membership) throw new Error("CurrentMembership usado em rota sem OrgAccessGuard.");
  return req.membership;
});

export const Meta = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestMeta => requestMeta(ctx.switchToHttp().getRequest<Request>()));
