import type { Organization, OrganizationMember, Session, User } from "@prisma/client";
import type { Request } from "express";

export interface AuthContext {
  user: User;
  session: Session;
}

export type MembershipContext = OrganizationMember & { organization: Organization };

/** Dados da requisição que vão para a auditoria e para as sessões. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

declare module "express-serve-static-core" {
  interface Request {
    id: string;
    auth?: AuthContext;
    membership?: MembershipContext;
  }
}

export function requestMeta(req: Request): RequestMeta {
  const ua = req.headers["user-agent"];
  return { ip: req.ip ?? null, userAgent: typeof ua === "string" ? ua.slice(0, 300) : null, requestId: req.id };
}
