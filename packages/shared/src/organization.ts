export const ORGANIZATION_TYPES = ["PF", "PJ"] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_TYPE_LABEL: Record<OrganizationType, string> = {
  PF: "Pessoa física",
  PJ: "Pessoa jurídica",
};

export const SEGMENTS = ["ONLINE", "CREATOR", "LOCAL", "ECOMMERCE"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABEL: Record<Segment, string> = {
  ONLINE: "Negócios online em geral",
  CREATOR: "Infoprodutores e criadores",
  LOCAL: "Negócios locais de serviços",
  ECOMMERCE: "E-commerce e lojas",
};

export const ORGANIZATION_STATUSES = ["KYC_PENDING", "KYC_REVIEW", "ACTIVE", "RESTRICTED", "SUSPENDED"] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_STATUS_LABEL: Record<OrganizationStatus, string> = {
  KYC_PENDING: "KYC pendente",
  KYC_REVIEW: "KYC em análise",
  ACTIVE: "Ativa",
  RESTRICTED: "Restrita",
  SUSPENDED: "Suspensa",
};

/**
 * Estado da conta do ponto de vista de quem está logado.
 * PENDING e EMAIL_VERIFICATION acontecem antes de existir uma organização;
 * os demais estados vêm da organização selecionada.
 */
export type AccountState = "EMAIL_VERIFICATION" | "PENDING" | OrganizationStatus;

export function accountState(input: { emailVerified: boolean; organizationStatus: OrganizationStatus | null }): AccountState {
  if (!input.emailVerified) return "EMAIL_VERIFICATION";
  if (!input.organizationStatus) return "PENDING";
  return input.organizationStatus;
}
