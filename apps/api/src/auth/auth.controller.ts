import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@mawid/shared';
import type { Request, Response } from 'express';
import { AllowSuspended, AuthUser, CurrentUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, Env } from '../config/env.module';
import { AuthService, PublicUser } from './auth.service';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies';

const LIMIT = { default: { limit: 5, ttl: 60_000 } };
const strings = (...keys: string[]) => ({
  type: 'object' as const,
  required: keys,
  properties: Object.fromEntries(keys.map((k) => [k, { type: 'string' as const }])),
});

@ApiTags('auth')
@AllowSuspended()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get secure(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  @Public()
  @Throttle(LIMIT)
  @Post('register')
  @ApiOperation({ summary: 'Create an owner account and its business, and log in' })
  @ApiBody({
    schema: {
      ...strings('name', 'email', 'password'),
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string', minLength: 8 },
        terms: { type: 'boolean', enum: [true] },
      },
    },
  })
  async register(
    @Body(new ZodPipe(registerSchema)) dto: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const locale = dto.locale ?? (req.acceptsLanguages('ar', 'fr', 'en') || 'ar');
    const { user, tokens } = await this.auth.register(dto, locale);
    setAuthCookies(res, tokens.access, tokens.refresh, this.secure, this.env.COOKIE_PATH_PREFIX);
    return user;
  }

  @Public()
  @Throttle(LIMIT)
  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'Log in (sets httpOnly cookies)' })
  @ApiBody({ schema: strings('email', 'password') })
  async login(
    @Body(new ZodPipe(loginSchema)) dto: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.auth.login(dto.email, dto.password);
    setAuthCookies(res, tokens.access, tokens.refresh, this.secure, this.env.COOKIE_PATH_PREFIX);
    return user;
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    try {
      const { user, tokens } = await this.auth.refresh(token);
      setAuthCookies(res, tokens.access, tokens.refresh, this.secure, this.env.COOKIE_PATH_PREFIX);
      return user;
    } catch (e) {
      clearAuthCookies(res, this.secure, this.env.COOKIE_PATH_PREFIX);
      throw e;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  @ApiOperation({ summary: 'Log out and revoke the refresh token' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout((req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.secure, this.env.COOKIE_PATH_PREFIX);
  }

  @ApiCookieAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user' })
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.auth.me(user.id);
  }

  @Public()
  @Throttle(LIMIT)
  @HttpCode(204)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Send a reset link by email (always answers 204)' })
  @ApiBody({ schema: strings('email') })
  async forgot(@Body(new ZodPipe(forgotPasswordSchema)) dto: ForgotPasswordInput): Promise<void> {
    await this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(LIMIT)
  @HttpCode(204)
  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password with the emailed token' })
  @ApiBody({ schema: strings('token', 'password') })
  async reset(@Body(new ZodPipe(resetPasswordSchema)) dto: ResetPasswordInput): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }
}
