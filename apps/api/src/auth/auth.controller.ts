import { Body, Controller, Get, HttpCode, Post, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { AllowMfaPending, AllowUnverified, CurrentAuth, Meta, Public } from "../common/decorators";
import type { AuthContext, RequestMeta } from "../common/request";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, LoginDto, PhoneCodeDto, RegisterDto, ResetPasswordDto, TokenDto, TwoFactorLoginDto } from "./dto";
import { SessionsService } from "./sessions.service";
import { TwoFactorService } from "./two-factor.service";

const STRICT = { default: { limit: 10, ttl: 60_000 } };
const VERY_STRICT = { default: { limit: 5, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post("register")
  async register(@Body() dto: RegisterDto, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token } = await this.auth.register(dto, meta);
    this.sessions.setCookie(res, token);
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post("login")
  async login(@Body() dto: LoginDto, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { token, twoFactorRequired } = await this.auth.login(dto, meta);
    this.sessions.setCookie(res, token);
    return { twoFactorRequired };
  }

  @AllowMfaPending()
  @AllowUnverified()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post("2fa/verify")
  async verifyTwoFactor(@CurrentAuth() auth: AuthContext, @Body() dto: TwoFactorLoginDto, @Meta() meta: RequestMeta) {
    await this.twoFactor.completeLogin(auth.user, auth.session, dto, meta);
    return { ok: true };
  }

  @AllowMfaPending()
  @AllowUnverified()
  @HttpCode(200)
  @Post("logout")
  async logout(@CurrentAuth() auth: AuthContext, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth, meta);
    this.sessions.clearCookie(res);
    return { ok: true };
  }

  @AllowMfaPending()
  @AllowUnverified()
  @Get("me")
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @AllowUnverified()
  @Throttle(VERY_STRICT)
  @HttpCode(200)
  @Post("email/resend")
  async resendEmail(@CurrentAuth() auth: AuthContext) {
    await this.auth.sendEmailVerification(auth.user);
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post("email/verify")
  async verifyEmail(@Body() dto: TokenDto, @Meta() meta: RequestMeta) {
    await this.auth.verifyEmail(dto.token, meta);
    return { ok: true };
  }

  @Throttle(VERY_STRICT)
  @HttpCode(200)
  @Post("phone/send")
  async sendPhoneCode(@CurrentAuth() auth: AuthContext) {
    await this.auth.sendPhoneCode(auth.user);
    return { ok: true };
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post("phone/verify")
  async verifyPhone(@CurrentAuth() auth: AuthContext, @Body() dto: PhoneCodeDto, @Meta() meta: RequestMeta) {
    await this.auth.verifyPhone(auth.user, dto.code, meta);
    return { ok: true };
  }

  @Public()
  @Throttle(VERY_STRICT)
  @HttpCode(200)
  @Post("password/forgot")
  async forgot(@Body() dto: ForgotPasswordDto, @Meta() meta: RequestMeta) {
    await this.auth.forgotPassword(dto.email, meta);
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post("password/reset")
  async reset(@Body() dto: ResetPasswordDto, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    await this.auth.resetPassword(dto.token, dto.password, meta);
    this.sessions.clearCookie(res);
    return { ok: true };
  }
}
