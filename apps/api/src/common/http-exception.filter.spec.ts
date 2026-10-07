import { Logger } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { errors } from "./errors";
import { AllExceptionsFilter } from "./http-exception.filter";

interface FakeResponse {
  setHeader(name: string, value: string): void;
  status(code: number): FakeResponse;
  json(body: unknown): FakeResponse;
}

/** Passa uma exceção pelo filtro e devolve o que ele respondeu. */
function respond(exception: unknown): { status: number; body: unknown } {
  const sent = { status: 0, body: undefined as unknown };
  const res: FakeResponse = {
    setHeader: () => undefined,
    status: (code) => {
      sent.status = code;
      return res;
    },
    json: (body) => {
      sent.body = body;
      return res;
    },
  };
  const req = { id: "req-teste", method: "POST", path: "/api/teste" };
  const host = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) };
  new AllExceptionsFilter().catch(exception, host as unknown as ArgumentsHost);
  return sent;
}

describe("filtro de erros", () => {
  let logged: jest.SpyInstance;
  beforeEach(() => {
    logged = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    logged.mockRestore();
  });

  it("mantém o código e a mensagem dos erros de regra de negócio", () => {
    expect(respond(errors.conflict("documento_em_uso", "Já existe uma conta com este documento.", { param: "document" }))).toEqual({
      status: 409,
      body: { error: { code: "documento_em_uso", message: "Já existe uma conta com este documento.", param: "document", fields: undefined }, requestId: "req-teste" },
    });
  });

  it("responde 404 quando o Prisma não encontra o registro (P2025) e 409 na violação de unicidade (P2002)", () => {
    const missing = respond(Object.assign(new Error("Record to update not found."), { code: "P2025" }));
    expect(missing).toEqual({ status: 404, body: { error: { code: "nao_encontrado", message: "O recurso pedido não existe." }, requestId: "req-teste" } });
    expect(respond(Object.assign(new Error("Unique constraint failed"), { code: "P2002" })).status).toEqual(409);
    expect(logged).not.toHaveBeenCalled();
  });

  it("respeita o status 4xx de erros que não são HttpException, sem registrar pilha", () => {
    const tooLarge = respond(Object.assign(new Error("request entity too large"), { status: 413, statusCode: 413, expose: true }));
    expect(tooLarge).toEqual({ status: 413, body: { error: { code: "corpo_muito_grande", message: "O conteúdo enviado é grande demais." }, requestId: "req-teste" } });
    const unknownStatus = respond(Object.assign(new Error("unprocessable"), { statusCode: 422, expose: true }));
    expect(unknownStatus).toEqual({ status: 422, body: { error: { code: "erro", message: "Não foi possível concluir a requisição." }, requestId: "req-teste" } });
    expect(logged).not.toHaveBeenCalled();
  });

  it("trata o resto como erro interno, sem vazar a mensagem original", () => {
    const internal = [
      new Error("segredo interno"),
      Object.assign(new Error("fora do ar"), { status: 503, expose: true }),
      Object.assign(new Error("status inválido"), { status: "404", expose: true }),
      // 4xx sem a marca "expose": veio de outro lugar (um serviço externo, por exemplo), não do cliente.
      Object.assign(new Error("recusado pelo provedor"), { status: 403 }),
      "texto solto",
    ];
    for (const exception of internal) {
      const sent = respond(exception);
      expect(sent.status).toEqual(500);
      expect(sent.body).toEqual({ error: { code: "erro_interno", message: "Algo deu errado do nosso lado. Tente de novo em instantes." }, requestId: "req-teste" });
    }
    expect(logged).toHaveBeenCalledTimes(internal.length);
  });
});
