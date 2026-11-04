import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { RegisterInput } from '@mawid/shared';
import type { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ENV, Env } from '../config/env.module';
import { MailService } from '../mail/mail.service';
import { resetPasswordEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from './cookies';

export interface Tokens {
  access: string;
  refresh: string;
}
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  businessId: string | null;
  locale: string;
}

const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');
const invalid = (): UnauthorizedException =>
  new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  businessId: u.businessId,
  locale: u.locale,
});

export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'business';
}

@Injectable()
export class AuthService {
  // Hash of a random password: used to spend the same time when the email does not exist.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(
    input: RegisterInput,
    locale: string,
  ): Promise<{ user: PublicUser; tokens: Tokens }> {
    const email = input.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'This email is already used' });
    }
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    // The business gets a temporary name; the owner sets the real one during onboarding.
    const user = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: input.name,
          slug: `${slugify(input.name)}-${randomBytes(3).toString('hex')}`,
          defaultLocale: locale,
        },
      });
      return tx.user.create({
        data: {
          email,
          passwordHash,
          name: input.name,
          role: 'OWNER',
          locale,
          businessId: business.id,
        },
      });
    });
    return { user: toPublicUser(user), tokens: await this.issueTokens(user, randomUUID()) };
  }

  async login(emailRaw: string, password: string): Promise<{ user: PublicUser; tokens: Tokens }> {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.toLowerCase() } });
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
    const ok = await argon2
      .verify(user?.passwordHash ?? (await this.dummyHash), password)
      .catch(() => false);
    if (!user || !ok) throw invalid();
    return { user: toPublicUser(user), tokens: await this.issueTokens(user, randomUUID()) };
  }

  /** Rotation: each refresh token works once. Reusing an old one revokes the whole family. */
  async refresh(token: string | undefined): Promise<{ user: PublicUser; tokens: Tokens }> {
    const fail = (): UnauthorizedException =>
      new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Session expired' });
    if (!token) throw fail();
    let payload: { sub: string; jti: string; fam: string };
    try {
      payload = this.jwt.verify(token, { secret: this.env.JWT_REFRESH_SECRET });
    } catch {
      throw fail();
    }
    const row = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!row || row.expiresAt < new Date()) throw fail();
    if (row.revokedAt) {
      await this.revokeFamily(row.familyId);
      throw fail();
    }
    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw fail();
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return { user: toPublicUser(user), tokens: await this.issueTokens(user, row.familyId) };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    try {
      const p = this.jwt.verify<{ fam: string }>(token, { secret: this.env.JWT_REFRESH_SECRET });
      await this.revokeFamily(p.fam);
    } catch {
      // Invalid token: nothing to revoke.
    }
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Session expired' });
    return toPublicUser(user);
  }

  /** Always succeeds from the outside, so nobody can find out which emails have an account. */
  async forgotPassword(emailRaw: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: emailRaw.toLowerCase() } });
    if (!user) return;
    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    const link = `${this.env.APP_URL}/${user.locale}/reset-password?token=${token}`;
    await this.mail.send(resetPasswordEmail(user.email, user.locale, link));
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'INVALID_RESET_TOKEN',
        message: 'This link is invalid or expired',
      });
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User, familyId: string): Promise<Tokens> {
    const jti = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
      },
    });
    return {
      access: this.jwt.sign(
        { sub: user.id, role: user.role, businessId: user.businessId },
        { secret: this.env.JWT_SECRET, expiresIn: ACCESS_TTL_SEC },
      ),
      refresh: this.jwt.sign(
        { sub: user.id, jti, fam: familyId },
        { secret: this.env.JWT_REFRESH_SECRET, expiresIn: REFRESH_TTL_SEC },
      ),
    };
  }
}
