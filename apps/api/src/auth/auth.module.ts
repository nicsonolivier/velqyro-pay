import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginAttemptsService } from "./login-attempts.service";
import { SessionGuard } from "./session.guard";
import { SessionsService } from "./sessions.service";
import { TwoFactorService } from "./two-factor.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, LoginAttemptsService, SessionsService, TwoFactorService, { provide: APP_GUARD, useClass: SessionGuard }],
  exports: [AuthService, LoginAttemptsService, SessionsService, TwoFactorService],
})
export class AuthModule {}
