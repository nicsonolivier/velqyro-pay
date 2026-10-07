/** Cliente da API. Toda chamada passa por aqui para tratar erros do mesmo jeito. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Avisa o resto do painel que a sessão caiu (expirou ou foi encerrada em outro lugar). */
export const UNAUTHORIZED_EVENT = "vq:nao-autenticado";

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
    const payload = (data ?? {}) as { error?: { code?: string; message?: string; fields?: Record<string, string> }; requestId?: string };
    const error = new ApiError(
      res.status,
      payload.error?.code ?? "erro",
      payload.error?.message ?? "Não foi possível concluir. Tente de novo em instantes.",
      payload.error?.fields ?? {},
      payload.requestId,
    );
    if (res.status === 401 && error.code === "nao_autenticado") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
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

/** Erros por campo, quando a API devolve. */
export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}
