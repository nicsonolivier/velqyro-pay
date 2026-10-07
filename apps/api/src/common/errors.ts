import { HttpException, HttpStatus } from "@nestjs/common";

export interface ErrorExtra {
  /** Campo que causou o erro, quando houver um só. */
  param?: string;
  /** Mensagem por campo, para formulários. */
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
}

/** Erro de regra de negócio com código estável e mensagem em português para mostrar ao usuário. */
export class AppError extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly extra: ErrorExtra = {},
  ) {
    super({ code, message, ...extra }, status);
  }
}

export const errors = {
  badRequest: (code: string, message: string, extra?: ErrorExtra) => new AppError(HttpStatus.BAD_REQUEST, code, message, extra),
  unauthorized: (code: string, message: string) => new AppError(HttpStatus.UNAUTHORIZED, code, message),
  forbidden: (code: string, message: string) => new AppError(HttpStatus.FORBIDDEN, code, message),
  notFound: (code: string, message: string) => new AppError(HttpStatus.NOT_FOUND, code, message),
  conflict: (code: string, message: string, extra?: ErrorExtra) => new AppError(HttpStatus.CONFLICT, code, message, extra),
  tooMany: (code: string, message: string, retryAfterSeconds?: number) => new AppError(HttpStatus.TOO_MANY_REQUESTS, code, message, { retryAfterSeconds }),
};
