import { isValidPhoneBR, passwordIssues } from "@velqyro/shared";
import { Transform } from "class-transformer";
import { Equals, IsEmail, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { IsValidBy } from "../common/validation";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const lowerTrim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value);

export const IsAcceptablePassword = () =>
  IsValidBy((value) => typeof value === "string" && passwordIssues(value).length === 0, {
    message: "A senha precisa ter ao menos 8 caracteres, com letras e números.",
  });

export const IsPhoneBR = () =>
  IsValidBy((value) => typeof value === "string" && isValidPhoneBR(value), { message: "Informe um telefone com DDD, por exemplo (11) 91234-5678." });

export class RegisterDto {
  @Transform(trim)
  @IsString({ message: "Informe seu nome completo." })
  @Length(3, 120, { message: "Informe seu nome completo." })
  @IsValidBy((value) => typeof value === "string" && value.trim().split(/\s+/).length >= 2, { message: "Informe nome e sobrenome." })
  name: string;

  @Transform(lowerTrim)
  @IsEmail({}, { message: "Informe um e-mail válido." })
  @MaxLength(254, { message: "Informe um e-mail válido." })
  email: string;

  @Transform(trim)
  @IsPhoneBR()
  phone: string;

  @IsString({ message: "Informe uma senha." })
  @IsAcceptablePassword()
  password: string;

  @Equals(true, { message: "Aceite os Termos de Uso e a Política de Privacidade para criar a conta." })
  acceptTerms: boolean;
}

export class LoginDto {
  @Transform(lowerTrim)
  @IsEmail({}, { message: "Informe um e-mail válido." })
  email: string;

  @IsString({ message: "Informe a senha." })
  @Length(1, 200, { message: "Informe a senha." })
  password: string;
}

export class TwoFactorLoginDto {
  @IsOptional()
  @IsString({ message: "Informe o código de 6 dígitos." })
  @MaxLength(12, { message: "Informe o código de 6 dígitos." })
  code?: string;

  @IsOptional()
  @IsString({ message: "Informe um código de recuperação." })
  @MaxLength(24, { message: "Informe um código de recuperação." })
  recoveryCode?: string;
}

export class TokenDto {
  @IsString({ message: "Link inválido." })
  @Length(20, 200, { message: "Link inválido." })
  token: string;
}

export class PhoneCodeDto {
  @Transform(({ value }) => (typeof value === "string" ? value.replace(/\D/g, "") : value))
  @IsString({ message: "Informe o código de 6 dígitos." })
  @Length(6, 6, { message: "Informe o código de 6 dígitos." })
  code: string;
}

export class ForgotPasswordDto {
  @Transform(lowerTrim)
  @IsEmail({}, { message: "Informe um e-mail válido." })
  email: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString({ message: "Informe a nova senha." })
  @IsAcceptablePassword()
  password: string;
}
