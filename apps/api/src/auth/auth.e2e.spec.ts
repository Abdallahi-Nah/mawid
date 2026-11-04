process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, MemoryMail, uniqueEmail } from '../test-utils';
import { PrismaService } from '../prisma/prisma.service';

describe('auth (integration, needs the database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MemoryMail;
  const created: string[] = [];

  beforeAll(async () => ({ app, prisma, mail } = await createTestApp()));
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: created } } });
    await prisma.business.deleteMany({
      where: { id: { in: users.flatMap((u) => (u.businessId ? [u.businessId] : [])) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: created } } });
    await app.close();
  });

  const register = async (email = uniqueEmail('owner')) => {
    created.push(email);
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/auth/register')
      .send({ name: 'Test Owner', email, password: 'Password123', terms: true });
    return { agent, res, email };
  };

  it('registers an OWNER with a business and sets httpOnly cookies', async () => {
    const { res } = await register();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'OWNER' });
    expect(res.body.businessId).toBeTruthy();
    expect(res.body.passwordHash).toBeUndefined();
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(2);
    for (const c of cookies) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Lax/i);
    }
  });

  it('stores an argon2 hash, never the password', async () => {
    const { email } = await register();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain('Password123');
  });

  it('rejects invalid input and duplicate emails with the standard error shape', async () => {
    const bad = await request(app.getHttpServer()).post('/auth/register').send({ email: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    const { email } = await register();
    const dup = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Dup', email, password: 'Password123', terms: true });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
  });

  it('logs in, reads /auth/me, and logs out', async () => {
    const { email } = await register();
    const agent = request.agent(app.getHttpServer());
    expect((await agent.post('/auth/login').send({ email, password: 'Password123' })).status).toBe(
      200,
    );
    expect((await agent.get('/auth/me')).body.email).toBe(email);
    expect((await agent.post('/auth/logout')).status).toBe(204);
    expect((await agent.post('/auth/refresh')).status).toBe(401);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { email } = await register();
    const wrong = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Wrong-password1' });
    const unknown = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: uniqueEmail('ghost'), password: 'Password123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('requires login on protected routes and keeps /health public', async () => {
    expect((await request(app.getHttpServer()).get('/auth/me')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
  });

  it('rotates the refresh token and revokes the family when an old one is reused', async () => {
    const { res } = await register();
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const oldRefresh = cookies.find((c) => c.startsWith('mawid_rt='))!.split(';')[0];

    const first = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', oldRefresh);
    expect(first.status).toBe(200);
    const newRefresh = (first.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('mawid_rt='))!
      .split(';')[0];
    expect(newRefresh).not.toBe(oldRefresh);

    // Reusing the old token is theft: it fails and kills the new token too.
    expect(
      (await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', oldRefresh)).status,
    ).toBe(401);
    expect(
      (await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', newRefresh)).status,
    ).toBe(401);
  });

  it('resets the password with the emailed link, once, and revokes sessions', async () => {
    const { email } = await register();
    const before = mail.sent.length;
    expect(
      (await request(app.getHttpServer()).post('/auth/forgot-password').send({ email })).status,
    ).toBe(204);
    expect(
      (
        await request(app.getHttpServer())
          .post('/auth/forgot-password')
          .send({ email: uniqueEmail('ghost') })
      ).status,
    ).toBe(204);
    expect(mail.sent).toHaveLength(before + 1); // nothing sent for an unknown email
    const token = /token=([a-f0-9]+)/.exec(mail.sent[before].text)![1];

    const ok = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'NewPassword456' });
    expect(ok.status).toBe(204);
    expect(
      (
        await request(app.getHttpServer())
          .post('/auth/reset-password')
          .send({ token, password: 'Another789xx' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'Password123' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password: 'NewPassword456' })
      ).status,
    ).toBe(200);
  });
});
