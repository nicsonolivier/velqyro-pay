/** Papéis de um membro dentro de uma organização (conta de lojista). */
export const ROLES = ["OWNER", "ADMIN", "FINANCE", "DEVELOPER", "SUPPORT", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  FINANCE: "Financeiro",
  DEVELOPER: "Desenvolvedor",
  SUPPORT: "Suporte",
  VIEWER: "Visualizador",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Acesso total, incluindo transferir ou encerrar a organização.",
  ADMIN: "Gerencia vendas, catálogo, equipe e integrações. Não saca.",
  FINANCE: "Vê saldo e extrato, saca e reembolsa.",
  DEVELOPER: "Gerencia chaves de API, webhooks e logs.",
  SUPPORT: "Atende pedidos e clientes e solicita reembolsos.",
  VIEWER: "Só consulta.",
};

/** Papéis que podem ser atribuídos por convite ou troca de papel. A posse só muda por transferência. */
export const ASSIGNABLE_ROLES: readonly Role[] = ROLES.filter((r) => r !== "OWNER");

/** Áreas do painel. Cada rota da API e cada item de menu pertence a uma delas. */
export const AREAS = [
  "dashboard",
  "catalog",
  "orders",
  "refunds",
  "balance",
  "payouts",
  "developers",
  "risk",
  "team",
  "audit",
  "business",
] as const;
export type Area = (typeof AREAS)[number];

/** Nível de acesso, do menor para o maior. "request" é pedir uma ação que outra pessoa aprova. */
export type Level = "view" | "request" | "manage";
const LEVEL_RANK: Record<Level, number> = { view: 1, request: 2, manage: 3 };

/**
 * Matriz de permissões. Ausência de entrada significa sem acesso.
 * Esta é a única fonte da regra: a API aplica e o web só esconde o que a API já negaria.
 */
export const PERMISSIONS: Record<Area, Partial<Record<Role, Level>>> = {
  dashboard: { OWNER: "manage", ADMIN: "manage", FINANCE: "view", DEVELOPER: "view", SUPPORT: "view", VIEWER: "view" },
  catalog: { OWNER: "manage", ADMIN: "manage", FINANCE: "view", DEVELOPER: "view", SUPPORT: "view", VIEWER: "view" },
  orders: { OWNER: "manage", ADMIN: "manage", FINANCE: "view", DEVELOPER: "view", SUPPORT: "manage", VIEWER: "view" },
  refunds: { OWNER: "manage", ADMIN: "manage", FINANCE: "manage", SUPPORT: "request" },
  balance: { OWNER: "view", ADMIN: "view", FINANCE: "view", VIEWER: "view" },
  payouts: { OWNER: "manage", ADMIN: "view", FINANCE: "manage" },
  developers: { OWNER: "manage", ADMIN: "manage", DEVELOPER: "manage" },
  risk: { OWNER: "manage", ADMIN: "manage", FINANCE: "view", SUPPORT: "view" },
  team: { OWNER: "manage", ADMIN: "manage" },
  audit: { OWNER: "view", ADMIN: "view" },
  business: { OWNER: "manage", ADMIN: "view" },
};

/** Diz se um papel alcança o nível pedido em uma área. */
export function can(role: Role, area: Area, level: Level = "view"): boolean {
  const granted = PERMISSIONS[area][role];
  if (!granted) return false;
  return LEVEL_RANK[granted] >= LEVEL_RANK[level];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
