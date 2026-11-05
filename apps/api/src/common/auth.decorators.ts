import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  role: Role;
  businessId: string | null;
}
export type AuthedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC = 'isPublic';
export const ALLOW_SUSPENDED = 'allowSuspended';
export const ROLES = 'roles';

/** Route needs no login. Every other route requires a valid access token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
/** Route still works when the business of the user is suspended (login, logout, who am I). */
export const AllowSuspended = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_SUSPENDED, true);
/** Route is allowed only for these roles (exact match, ADMIN is not a super-role). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not authenticated' });
  return user;
});

/** The business of the logged-in user. Never read a business id from the request body or URL. */
export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user?.businessId)
    throw new ForbiddenException({ code: 'NO_BUSINESS', message: 'No business for this account' });
  return user.businessId;
});

/** The logged-in user on a public route, if there is one (guests get undefined). */
export const OptionalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    return ctx.switchToHttp().getRequest<AuthedRequest>().user;
  },
);
