import type { AccountState, OrganizationStatus, OrganizationType, Role, Segment } from "@velqyro/shared";

export interface OrganizationSummary {
  id: string;
  name: string;
  legalName: string;
  type: OrganizationType;
  /** Já vem mascarado da API. */
  document: string;
  segment: Segment;
  status: OrganizationStatus;
}

export interface Membership {
  id: string;
  role: Role;
  organization: OrganizationSummary;
}

export interface Me {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    twoFactorEnabled: boolean;
    createdAt: string;
  };
  session: { id: string; twoFactorPending: boolean };
  accountState: AccountState;
  memberships: Membership[];
}

export interface Member {
  id: string;
  role: Role;
  since: string;
  user: { id: string; name: string; email: string };
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface AuditItem {
  id: string;
  actor: string;
  action: string;
  resource: string;
  resourceId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SessionItem {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface OutboxMessage {
  id: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  subject: string;
  body: string;
  createdAt: string;
}
