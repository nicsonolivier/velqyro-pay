import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { loadEnv } from "./config/env";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  // O corpo JSON aceita até 100 kB, o padrão do Express.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  await app.listen(env.port);

  const log = new Logger("VELQYRO PAY");
  log.log(`API no ar em http://localhost:${env.port}/api (${env.nodeEnv})`);
  if (env.nodeEnv === "production") {
    log.warn("Nenhum provedor de e-mail ou SMS está configurado: as mensagens ficam apenas na caixa de saída do banco.");
  }
}

void bootstrap();
