process.env.THROTTLE_DISABLED = 'true';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import * as argon2 from 'argon2';
import request from 'supertest';
import { IS_PUBLIC, ROLES } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, uniqueEmail } from '../test-utils';

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
  roles: string[] | undefined;
}

/**
 * OWASP A01 (broken access control). Every route of the API is found automatically. Each one must be
 * either explicitly @Public(), or protected by @Roles(...), or listed below as "any logged-in user"
 * with the reason. A new route that is none of these makes this test fail, so a forgotten guard cannot
 * reach production unnoticed.
 */
const PUBLIC_ROUTES = [
  'GET /health',
  'GET /public/bookings/:token',
  'GET /public/bookings/:token/calendar.ics',
  'GET /public/businesses/:slug',
  'GET /public/businesses/:slug/reviews',
  'GET /public/businesses/:slug/slots',
  'GET /public/reviews/:token',
  'GET /public/sitemap',
  'POST /auth/forgot-password',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /auth/refresh',
  'POST /auth/register',
  'POST /auth/reset-password',
  'POST /public/ai/chat',
  'POST /public/ai/chat/confirm',
  'POST /public/ai/chat/draft',
  'POST /public/bookings',
  'POST /public/bookings/:token/cancel',
  'POST /public/bookings/:token/payment',
  'POST /public/bookings/:token/reschedule',
  'POST /public/reviews/:token',
].sort();

/** Logged in, any role, and the data is scoped to the user or to their business inside the service. */
const ANY_LOGGED_IN_USER: string[] = [
  'GET /auth/me', // returns the profile of the caller only
];

describe('every route is guarded or explicitly public (OWASP A01, AC-07)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const routes: Route[] = [];
  const emails: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const controllers = [...app.get(ModulesContainer).values()].flatMap((m) => [
      ...m.controllers.values(),
    ]);
    const reflector = app.get(Reflector);
    const scanner = new MetadataScanner();
    for (const w of controllers) {
      const { instance, metatype } = w;
      if (!instance || !metatype) continue;
      const proto = Object.getPrototypeOf(instance) as Record<string, () => unknown>;
      const base = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = proto[name];
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (path === undefined || method === undefined) continue;
        routes.push({
          method: RequestMethod[method],
          path: `/${[base, path].filter(Boolean).join('/')}`
            .replace(/\/+/g, '/')
            .replace(/(.)\/$/, '$1'),
          isPublic: !!reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler, metatype]),
          roles: reflector.getAllAndOverride<string[] | undefined>(ROLES, [handler, metatype]),
        });
      }
    }
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const label = (r: Route) => `${r.method} ${r.path}`;
  const real = (r: Route) =>
    r.path.replace(/:\w+/g, (m) =>
      m === ':slug' ? 'some-slug' : '00000000-0000-4000-8000-000000000000',
    );

  it('finds the routes (sanity check of the scan)', () => {
    expect(routes.length).toBeGreaterThan(60);
  });

  it('the list of public routes is exactly the reviewed one', () => {
    const found = routes
      .filter((r) => r.isPublic)
      .map(label)
      .sort();
    expect(found).toEqual(PUBLIC_ROUTES);
  });

  it('every other route has @Roles, or is in the "any logged-in user" list', () => {
    const open = routes
      .filter((r) => !r.isPublic && !r.roles?.length)
      .map(label)
      .sort();
    expect(open).toEqual([...ANY_LOGGED_IN_USER].sort());
  });

  it('no route is reachable without a session unless it is public (401)', async () => {
    const guarded = routes.filter((r) => !r.isPublic);
    expect(guarded.length).toBeGreaterThan(40);
    for (const r of guarded) {
      const res = await request(app.getHttpServer())[r.method.toLowerCase() as 'get'](real(r));
      if (res.status !== 401) throw new Error(`${label(r)} answered ${res.status} without a login`);
    }
  });

  it('a route with @Roles refuses a logged-in user of another role (403)', async () => {
    const email = uniqueEmail('client');
    emails.push(email);
    await prisma.user.create({
      data: {
        email,
        name: 'Client',
        role: 'CLIENT',
        passwordHash: await argon2.hash('Password123', { type: argon2.argon2id }),
      },
    });
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: 'Password123' }).expect(200);
    const checked: Route[] = routes.filter((r) => r.roles?.length && !r.roles.includes('CLIENT'));
    expect(checked.length).toBeGreaterThan(40);
    for (const r of checked) {
      const res = await agent[r.method.toLowerCase() as 'get'](real(r));
      if (res.status !== 403) throw new Error(`${label(r)} answered ${res.status} to a CLIENT`);
    }
  });

  it('the admin routes refuse an owner and the owner routes refuse an admin', () => {
    const admin = routes.filter((r) => r.path.startsWith('/admin'));
    expect(admin.length).toBeGreaterThan(4);
    expect(admin.every((r) => r.roles?.length === 1 && r.roles[0] === 'ADMIN')).toBe(true);
    const nonAdmin = routes.filter(
      (r) => !r.path.startsWith('/admin') && r.roles?.includes('ADMIN'),
    );
    expect(nonAdmin.map(label)).toEqual([]);
  });
});
