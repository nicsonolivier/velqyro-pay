/** Cliente da API. Toda chamada passa por aqui para tratar erros do mesmo jeito. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly requestId?: string,
    /** Campo que causou o erro, quando a API aponta um só. */
    public readonly param?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Avisa o resto do painel que a sessão caiu (expirou ou foi encerrada em outro lugar). */
export const UNAUTHORIZED_EVENT = "vq:nao-autenticado";

/**
 * Avisa que o acesso de quem está logado pode ter mudado em outra sessão
 * (papel trocado, saída da organização, login ainda esperando o segundo fator).
 * Quem guarda a sessão busca os dados de novo.
 */
export const ACCESS_CHANGED_EVENT = "vq:acesso-mudou";
const ACCESS_CHANGED_CODES = new Set(["sem_permissao", "organizacao_nao_encontrada", "papel_nao_permitido", "verificacao_2fa_pendente"]);

/** Rota que diz quem está logado. */
export const SESSION_PATH = "/auth/me";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "sem_conexao", "Não foi possível falar com o servidor. Confira sua conexão e tente de novo.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Resposta sem corpo JSON.
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { error?: { code?: string; message?: string; param?: string; fields?: Record<string, string> }; requestId?: string };
    const error = new ApiError(
      res.status,
      payload.error?.code ?? "erro",
      payload.error?.message ?? "Não foi possível concluir. Tente de novo em instantes.",
      payload.error?.fields ?? {},
      payload.requestId,
      payload.error?.param,
    );
    // O 401 de /auth/me não vira aviso: quem confere a sessão trata a própria resposta e sabe se ela
    // chegou atrasada (por exemplo, uma conferência feita logo antes de um login que deu certo).
    if (res.status === 401 && error.code === "nao_autenticado") {
      if (path !== SESSION_PATH) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    } else if (ACCESS_CHANGED_CODES.has(error.code)) {
      window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
    }
    throw error;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Mensagem para mostrar ao usuário a partir de qualquer erro. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Algo deu errado. Tente de novo em instantes.";
}

/** Erros por campo. Quando a API aponta só o campo (param), a mensagem do erro vai para ele. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  if (Object.keys(error.fields).length) return error.fields;
  return error.param ? { [error.param]: error.message } : {};
}
