const TIME_ZONE = "America/Sao_Paulo";
const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

/** "há 5 min", "há 3 h", "há 2 dias" ou a data, para o que é mais antigo. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  if (diff < minute) return "agora";
  if (diff < 60 * minute) return `há ${Math.floor(diff / minute)} min`;
  if (diff < 24 * 60 * minute) return `há ${Math.floor(diff / (60 * minute))} h`;
  const days = Math.floor(diff / (24 * 60 * minute));
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  return formatDate(iso);
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3_600_000));
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Resume o navegador e o sistema a partir do User-Agent, para a lista de sessões. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo desconhecido";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Navegador";
  const system = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS X/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "";
  return system ? `${browser} em ${system}` : browser;
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  "organization.created": "Criou a organização",
  "organization.updated": "Editou os dados do negócio",
  "invitation.created": "Convidou uma pessoa",
  "invitation.resent": "Reenviou um convite",
  "invitation.revoked": "Cancelou um convite",
  "invitation.accepted": "Aceitou o convite",
  "member.role_changed": "Alterou o papel de um membro",
  "member.removed": "Removeu um membro",
};
export const auditActionLabel = (action: string) => AUDIT_ACTION_LABEL[action] ?? action;
