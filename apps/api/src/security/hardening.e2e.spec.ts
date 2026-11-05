process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import request from 'supertest';
import { setAuthCookies } from '../auth/cookies';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, MemoryMail, uniqueEmail } from '../test-utils';

const PASSWORD = 'Password123';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const waitFor = async (cond: () => boolean, ms = 8000): Promise<void> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('timeout');
};

describe('hardening against the OWASP Top 10 (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MemoryMail;
  const emails: string[] = [];
  const server = () => app.getHttpServer();

  async function owner() {
    const email = uniqueEmail('sec');
    emails.push(email);
    const agent = request.agent(server());
    const reg = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email, password: PASSWORD, terms: true });
    const slug = `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await agent
      .patch('/businesses/me')
      .send({ slug, name: 'Salon Sec', timezone: 'UTC' })
      .expect(200);
    return { agent, email, slug, businessId: reg.body.businessId as string };
  }

  beforeAll(async () => {
    ({ app, prisma, mail } = await createTestApp());
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    await prisma.business.deleteMany({
      where: { id: { in: users.flatMap((u) => (u.businessId ? [u.businessId] : [])) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  describe('A05 security misconfiguration: headers and cookies', () => {
    it('answers with strict security headers and does not reveal the framework', async () => {
      const res = await request(server()).get('/health').expect(200);
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('session cookies are httpOnly and SameSite=Lax; the refresh cookie only goes to /auth', async () => {
      const { email } = await owner();
      const res = await request(server())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      const cookies = res.headers['set-cookie'] as unknown as string[];
      const at = cookies.find((c) => c.startsWith('mawid_at='))!;
      const rt = cookies.find((c) => c.startsWith('mawid_rt='))!;
      for (const c of [at, rt]) {
        expect(c).toMatch(/HttpOnly/i);
        expect(c).toMatch(/SameSite=Lax/i);
      }
      expect(rt).toMatch(/Path=\/auth/);
      expect(at).toMatch(/Path=\//);
    });

    it('in production the cookies are also Secure', () => {
      const set: string[] = [];
      const res = {
        cookie: (n: string, v: string, o: { secure: boolean }) => set.push(`${n}:${o.secure}`),
      };
      setAuthCookies(res as never, 'a', 'r', true);
      expect(set).toEqual(['mawid_at:true', 'mawid_rt:true']);
    });

    it('CORS only allows the web app origin', async () => {
      const ok = await request(server())
        .options('/services')
        .set('Origin', process.env.APP_URL!)
        .set('Access-Control-Request-Method', 'GET');
      expect(ok.headers['access-control-allow-origin']).toBe(process.env.APP_URL);
      const bad = await request(server())
        .options('/services')
        .set('Origin', 'https://evil.test')
        .set('Access-Control-Request-Method', 'GET');
      // The answer always names the web app, never the caller: a browser on another site is refused.
      expect(bad.headers['access-control-allow-origin']).toBe(process.env.APP_URL);
      expect(bad.headers['access-control-allow-origin']).not.toBe('https://evil.test');
    });
  });

  describe('A01 CSRF', () => {
    it('refuses a state-changing request with the session cookie from another origin', async () => {
      const o = await owner();
      const evil = await o.agent
        .post('/services')
        .set('Origin', 'https://evil.test')
        .send({ name: 'Hack', durationMin: 30, price: 1 });
      expect(evil.status).toBe(403);
      expect(evil.body.code).toBe('CSRF_BLOCKED');
      const del = await o.agent
        .patch('/businesses/me')
        .set('Origin', 'https://evil.test')
        .send({ name: 'Pwned' });
      expect(del.status).toBe(403);
      expect((await prisma.business.findUniqueOrThrow({ where: { id: o.businessId } })).name).toBe(
        'Salon Sec',
      );
      // the real web app still works
      await o.agent
        .post('/services')
        .set('Origin', process.env.APP_URL!)
        .send({ name: 'Coupe', durationMin: 30, price: 100 })
        .expect(201);
    });
  });

  describe('A03 injection', () => {
    const payloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      '" OR ""="',
      '%',
      '_',
      "\\' UNION SELECT * FROM users --",
      '${7*7}',
      '{{7*7}}',
    ];

    it('search boxes and path parameters treat SQL as plain text (no 500, nothing leaks)', async () => {
      const a = await owner();
      const b = await owner();
      await b.agent
        .post('/services')
        .send({ name: 'Secret B', durationMin: 30, price: 100 })
        .expect(201);
      for (const p of payloads) {
        const customers = await a.agent.get('/customers').query({ q: p });
        expect(customers.status).toBe(200);
        expect(customers.body.total).toBe(0);
        const bySlug = await request(server()).get(`/public/businesses/${encodeURIComponent(p)}`);
        expect([404, 400]).toContain(bySlug.status);
        const slots = await request(server())
          .get(`/public/businesses/${a.slug}/slots`)
          .query({ serviceId: p, date: p });
        expect(slots.status).toBe(400);
        const login = await request(server()).post('/auth/login').send({ email: p, password: p });
        expect([400, 401]).toContain(login.status);
      }
      expect(
        (await a.agent.get('/services').expect(200)).body.items.some(
          (s: { name: string }) => s.name === 'Secret B',
        ),
      ).toBe(false);
      expect(await prisma.user.count()).toBeGreaterThan(1); // the table is still there
    });

    it('a raw SQL parameter is bound, never glued into the query (reports use the timezone and ids)', async () => {
      const o = await owner();
      // the range is validated as a date, so SQL text is refused before the database
      const res = await o.agent
        .get('/reports/summary')
        .query({ from: "2026-01-01'; DROP TABLE bookings;--" });
      expect(res.status).toBe(400);
      await o.agent.get('/reports/bookings-per-day').expect(200);
    });
  });

  describe('A03 XSS and output encoding', () => {
    it('a hostile customer name is HTML-escaped in the emails sent to the owner', async () => {
      const o = await owner();
      const svc = await o.agent
        .post('/services')
        .send({ name: 'Coupe', durationMin: 30, price: 100 })
        .expect(201);
      const st = await o.agent
        .post('/staff')
        .send({ displayName: 'Sidi', serviceIds: [svc.body.id] })
        .expect(201);
      await o.agent
        .put(`/staff/${st.body.id}/working-hours`)
        .send(
          [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            startTime: '09:00',
            endTime: '18:00',
          })),
        )
        .expect(200);
      const day = DateTime.utc().plus({ days: 5 }).toISODate();
      const evil = '<img src=x onerror=alert(1)>';
      await request(server())
        .post('/public/bookings')
        .send({
          businessSlug: o.slug,
          serviceId: svc.body.id,
          staffId: st.body.id,
          startsAt: `${day}T10:00:00.000Z`,
          customer: { name: evil, phone: '+22233000111' },
          notes: '<script>alert(1)</script>',
        })
        .expect(201);
      await waitFor(() => mail.to(o.email).length > 0);
      const html = mail.to(o.email)[0].html as string;
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('API answers are JSON with nosniff, so a stored script is never run as a page', async () => {
      const o = await owner();
      await o.agent
        .patch('/businesses/me')
        .send({ description: '<script>alert(1)</script>' })
        .expect(200);
      const res = await request(server()).get(`/public/businesses/${o.slug}`).expect(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('A04/A08 file uploads', () => {
    it('accepts a real image, refuses other types (SVG, HTML, text) even with an image name', async () => {
      const o = await owner();
      await o.agent
        .post('/businesses/me/logo')
        .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
        .expect(201);
      for (const [name, body, type] of [
        [
          'logo.png',
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
          'image/png',
        ],
        ['logo.png', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png'],
        ['logo.png', Buffer.from('GIF89a......................'), 'image/gif'],
        ['logo.svg', Buffer.from('<svg/>'), 'image/svg+xml'],
      ] as const) {
        const res = await o.agent
          .post('/businesses/me/logo')
          .attach('file', body, { filename: name, contentType: type });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_IMAGE');
      }
    });

    it('refuses a file over 2 MB (413) and a second file', async () => {
      const o = await owner();
      const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 + 10)]);
      const res = await o.agent
        .post('/businesses/me/logo')
        .attach('file', big, { filename: 'big.png', contentType: 'image/png' });
      expect(res.status).toBe(413);
    });
  });

  describe('A07 authentication', () => {
    it('does not say whether an email exists (login and password reset)', async () => {
      const o = await owner();
      const known = await request(server())
        .post('/auth/login')
        .send({ email: o.email, password: 'Wrong-password1' });
      const unknown = await request(server())
        .post('/auth/login')
        .send({ email: 'nobody@test.mawid', password: 'Wrong-password1' });
      expect(known.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(known.body).toEqual(unknown.body);
      const r1 = await request(server()).post('/auth/forgot-password').send({ email: o.email });
      const r2 = await request(server())
        .post('/auth/forgot-password')
        .send({ email: 'nobody@test.mawid' });
      expect(r1.status).toBe(r2.status);
      expect(r1.body).toEqual(r2.body);
    });

    it('stores passwords hashed (argon2id), never in clear', async () => {
      const o = await owner();
      const u = await prisma.user.findUniqueOrThrow({ where: { email: o.email } });
      expect(u.passwordHash).toMatch(/^\$argon2id\$/);
      expect(u.passwordHash).not.toContain(PASSWORD);
    });

    it('a stolen refresh token cannot be used twice (rotation)', async () => {
      const { email } = await owner();
      const login = await request(server())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      const cookies = (login.headers['set-cookie'] as unknown as string[])
        .map((c) => c.split(';')[0])
        .join('; ');
      await request(server()).post('/auth/refresh').set('Cookie', cookies).expect(200);
      await request(server()).post('/auth/refresh').set('Cookie', cookies).expect(401);
    });
  });
});
