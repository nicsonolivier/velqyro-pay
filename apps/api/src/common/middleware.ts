import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../config/env";

/** Dá um ID a cada requisição e devolve no cabeçalho X-Request-Id, para cruzar com os logs. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  req.id = typeof incoming === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Proteção contra CSRF: requisições que alteram dados e trazem o cabeçalho Origin
 * só passam se a origem estiver em WEB_ORIGINS. O cookie de sessão já é SameSite=Lax;
 * esta checagem é a segunda barreira.
 */
export function originCheckMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin || loadEnv().webOrigins.includes(origin.replace(/\/+$/, ""))) return next();
  res.status(403).json({ error: { code: "origem_nao_permitida", message: "Requisição recusada: origem não reconhecida." }, requestId: req.id });
}
