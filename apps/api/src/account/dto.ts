import { Transform } from "class-transformer";
import { IsString, Length, MaxLength } from "class-validator";
import { IsPhoneBR, IsAcceptablePassword } from "../auth/dto";
import { IsValidBy } from "../common/validation";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class UpdateProfileDto {
  @Transform(trim)
  @IsString({ message: "Informe seu nome completo." })
  @Length(3, 120, { message: "Informe seu nome completo." })
  @IsValidBy((value) => typeof value === "string" && value.trim().split(/\s+/).length >= 2, { message: "Informe nome e sobrenome." })
  name: string;

  @Transform(trim)
  @IsPhoneBR()
  phone: string;
}

export class ChangePasswordDto {
  @IsString({ message: "Informe a senha atual." })
  @Length(1, 200, { message: "Informe a senha atual." })
  currentPassword: string;

  @IsString({ message: "Informe a nova senha." })
  @IsAcceptablePassword()
  newPassword: string;
}

export class SetupTwoFactorDto {
  @IsString({ message: "Informe a senha atual." })
  @Length(1, 200, { message: "Informe a senha atual." })
  password: string;
}

export class TwoFactorCodeDto {
  @IsString({ message: "Informe o código de 6 dígitos." })
  @MaxLength(12, { message: "Informe o código de 6 dígitos." })
  code: string;
}

export class DisableTwoFactorDto {
  @IsString({ message: "Informe a senha atual." })
  @Length(1, 200, { message: "Informe a senha atual." })
  password: string;

  @IsString({ message: "Informe o código do aplicativo ou um código de recuperação." })
  @MaxLength(24, { message: "Informe o código do aplicativo ou um código de recuperação." })
  code: string;
}
