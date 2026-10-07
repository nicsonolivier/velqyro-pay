import { ValidationError, ValidationPipe } from "@nestjs/common";
import { registerDecorator, ValidationOptions } from "class-validator";
import { errors } from "./errors";

/** Cria um validador de campo a partir de uma função simples. */
export function IsValidBy(check: (value: unknown, object: Record<string, unknown>) => boolean, options: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: "isValidBy",
      target: target.constructor,
      propertyName: String(propertyKey),
      options,
      validator: { validate: (value: unknown, args) => check(value, (args?.object ?? {}) as Record<string, unknown>) },
    });
  };
}

function collect(list: ValidationError[], prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const item of list) {
    const key = prefix ? `${prefix}.${item.property}` : item.property;
    const first = item.constraints ? Object.values(item.constraints)[0] : undefined;
    if (first && !out[key]) out[key] = first;
    if (item.children?.length) collect(item.children, key, out);
  }
  return out;
}

/** Valida o corpo de toda rota, recusa campos desconhecidos e devolve uma mensagem por campo. */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: true,
    exceptionFactory: (list) => {
      const fields = collect(list);
      const [param] = Object.keys(fields);
      return errors.badRequest("parametro_invalido", fields[param] ?? "Confira os campos e tente de novo.", { param, fields });
    },
  });
}
