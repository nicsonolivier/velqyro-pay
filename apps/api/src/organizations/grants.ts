import { canGrant } from "@velqyro/shared";
import type { Role } from "@velqyro/shared";
import { errors } from "../common/errors";

/**
 * Recusa quando o papel de quem age não pode conceder, alterar ou retirar algum dos papéis envolvidos.
 * A regra (canGrant) fica no pacote compartilhado: ninguém mexe em um papel com mais poder que o seu.
 */
export function assertCanGrant(actorRole: Role, ...targetRoles: Role[]): void {
  if (!targetRoles.every((target) => canGrant(actorRole, target))) {
    throw errors.forbidden("papel_nao_permitido", "Seu papel não permite conceder ou alterar este papel.");
  }
}
