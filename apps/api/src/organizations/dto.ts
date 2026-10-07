import { ASSIGNABLE_ROLES, isValidDocument, ORGANIZATION_TYPES, SEGMENTS } from "@velqyro/shared";
import type { OrganizationType, Role, Segment } from "@velqyro/shared";
import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { IsValidBy } from "../common/validation";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const lowerTrim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value);

export class CreateOrganizationDto {
  @Transform(trim)
  @IsString({ message: "Informe o nome do negócio." })
  @Length(2, 120, { message: "Informe o nome do negócio." })
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: "Informe a razão social." })
  @MaxLength(160, { message: "A razão social é longa demais." })
  legalName?: string;

  @IsIn(ORGANIZATION_TYPES, { message: "Escolha pessoa física ou pessoa jurídica." })
  type: OrganizationType;

  @IsString({ message: "Informe o documento." })
  @IsValidBy((value, object) => typeof value === "string" && (object.type === "PF" || object.type === "PJ") && isValidDocument(object.type, value), {
    message: "Documento inválido. Use um CPF para pessoa física ou um CNPJ para pessoa jurídica.",
  })
  document: string;

  @IsIn(SEGMENTS, { message: "Escolha um segmento." })
  segment: Segment;
}

export class UpdateOrganizationDto {
  @Transform(trim)
  @IsString({ message: "Informe o nome do negócio." })
  @Length(2, 120, { message: "Informe o nome do negócio." })
  name: string;

  @IsIn(SEGMENTS, { message: "Escolha um segmento." })
  segment: Segment;
}

export class InviteDto {
  @Transform(lowerTrim)
  @IsEmail({}, { message: "Informe um e-mail válido." })
  @MaxLength(254, { message: "Informe um e-mail válido." })
  email: string;

  @IsIn(ASSIGNABLE_ROLES, { message: "Escolha um papel válido. A posse da organização não é atribuída por convite." })
  role: Role;
}

export class ChangeRoleDto {
  @IsIn(ASSIGNABLE_ROLES, { message: "Escolha um papel válido. A posse da organização não é atribuída por aqui." })
  role: Role;
}
