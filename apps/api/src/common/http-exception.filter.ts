import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError } from "./errors";

const GENERIC: Record<number, [code: string, message: string]> = {
  400: ["requisicao_invalida", "A requisição veio em um formato inválido."],
  401: ["nao_autenticado", "Entre na sua conta para continuar."],
  403: ["sem_permissao", "Você não tem permissão para esta ação."],
  404: ["nao_encontrado", "O recurso pedido não existe."],
  409: ["conflito", "Esta ação entra em conflito com o estado atual."],
  413: ["corpo_muito_grande", "O conteúdo enviado é grande demais."],
  429: ["limite_de_requisicoes", "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo."],
};

/** Padroniza toda resposta de erro: { error: { code, message, param?, fields? }, requestId }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Erro");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = req.id;

    if (exception instanceof AppError) {
      if (exception.extra.retryAfterSeconds) res.setHeader("Retry-After", String(exception.extra.retryAfterSeconds));
      res.status(exception.getStatus()).json({
        error: { code: exception.code, message: exception.message, param: exception.extra.param, fields: exception.extra.fields },
        requestId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const [code, message] = GENERIC[status] ?? ["erro", "Não foi possível concluir a requisição."];
      res.status(status).json({ error: { code, message }, requestId });
      return;
    }

    // Violação de unicidade do Prisma que escapou das checagens dos serviços (corrida entre duas requisições).
    if (typeof exception === "object" && exception !== null && (exception as { code?: string }).code === "P2002") {
      res.status(HttpStatus.CONFLICT).json({ error: { code: "conflito", message: "Já existe um registro com esses dados." }, requestId });
      return;
    }

    const err = exception as Error;
    this.logger.error(`${req.method} ${req.path} [${requestId}] ${err?.message ?? exception}`, err?.stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "erro_interno", message: "Algo deu errado do nosso lado. Tente de novo em instantes." },
      requestId,
    });
  }
}
