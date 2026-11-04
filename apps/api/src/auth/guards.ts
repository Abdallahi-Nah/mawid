import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { AuthedRequest, IS_PUBLIC, ROLES } from '../common/auth.decorators';
import { ENV, Env } from '../config/env.module';
import { ACCESS_COOKIE } from './cookies';

interface AccessPayload {
  sub: string;
  role: Role;
  businessId: string | null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE] ?? bearer;
    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Login required' });
    }
    try {
      const p = this.jwt.verify<AccessPayload>(token, { secret: this.env.JWT_SECRET });
      req.user = { id: p.sub, role: p.role, businessId: p.businessId };
      return true;
    } catch {
      // A public route still works with a bad or expired token: the visitor is simply a guest.
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Session expired' });
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have access to this resource',
      });
    }
    return true;
  }
}
