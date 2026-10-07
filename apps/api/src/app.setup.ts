import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AllExceptionsFilter } from "./common/http-exception.filter";
import { originCheckMiddleware, requestIdMiddleware } from "./common/middleware";
import { buildValidationPipe } from "./common/validation";
import { loadEnv } from "./config/env";

/** Configuração compartilhada entre a aplicação real (main.ts) e os testes de ponta a ponta. */
export function configureApp(app: INestApplication): void {
  const env = loadEnv();
  const express = app as NestExpressApplication;
  express.set("trust proxy", env.trustProxyHops);
  express.disable("x-powered-by");

  app.setGlobalPrefix("api");
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.use(originCheckMiddleware);
  app.enableCors({ origin: env.webOrigins, credentials: true });
  app.useGlobalPipes(buildValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
