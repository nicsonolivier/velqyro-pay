import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccountModule } from "./account/account.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { loadEnv } from "./config/env";
import { HealthController } from "./health/health.controller";
import { NotificationsModule } from "./notifications/notifications.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { PrismaModule } from "./prisma/prisma.module";

/**
 * Monólito modular. Cada pasta é um módulo com fronteira clara:
 * as próximas etapas acrescentam Catálogo, Checkout, Pagamentos, Livro-razão, Saques, Webhooks e Admin.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: 120 }],
      // Os testes fazem muitas chamadas em sequência com o mesmo IP.
      skipIf: () => loadEnv().nodeEnv === "test",
    }),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    AccountModule,
    OrganizationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
