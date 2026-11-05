process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, MemoryMail, uniqueEmail } from '../test-utils';

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = 'Password123';
const day = (n: number): string => DateTime.utc().plus({ days: n }).toISODate() as string;

describe('admin area (integration, needs the database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MemoryMail;
  let admin: Agent;
  const emails: string[] = [];
  const server = () => app.getHttpServer();

  async function owner() {
    const email = uniqueEmail('owner');
    emails.push(email);
    const agent = request.agent(server());
    const reg = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email, password: PASSWORD, terms: true });
    const slug = `adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await agent
      .patch('/businesses/me')
      .send({ slug, name: 'Admin Test', timezone: 'UTC' })
      .expect(200);
    const svc = await agent
      .post('/services')
      .send({ name: 'Coupe', durationMin: 30, price: 300 })
      .expect(201);
    const st = await agent
      .post('/staff')
      .send({ displayName: 'Sidi', serviceIds: [svc.body.id] })
      .expect(201);
    await agent
      .put(`/staff/${st.body.id}/working-hours`)
      .send(
        [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' })),
      )
      .expect(200);
    return {
      agent,
      email,
      businessId: reg.body.businessId as string,
      slug,
      serviceId: svc.body.id as string,
      staffId: st.body.id as string,
    };
  }

  beforeAll(async () => {
    ({ app, prisma, mail } = await createTestApp());
    const email = uniqueEmail('admin');
    emails.push(email);
    await prisma.user.create({
      data: {
        email,
        name: 'Admin',
        role: 'ADMIN',
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      },
    });
    admin = request.agent(server());
    await admin.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    await prisma.business.deleteMany({
      where: { id: { in: users.flatMap((u) => (u.businessId ? [u.businessId] : [])) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('only the ADMIN role can use /admin (owners get 403, guests 401)', async () => {
    const o = await owner();
    for (const path of ['/admin/businesses', '/admin/stats', '/admin/ai-usage']) {
      await o.agent.get(path).expect(403);
      await request(server()).get(path).expect(401);
    }
    await o.agent
      .patch(`/admin/businesses/${o.businessId}/plan`)
      .send({ plan: 'BUSINESS' })
      .expect(403);
    await o.agent
      .patch(`/admin/businesses/${o.businessId}/suspension`)
      .send({ suspended: true })
      .expect(403);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: o.businessId } })).plan).toBe(
      'FREE',
    );
  });

  it('lists businesses with their owner, and filters by search, plan and suspension', async () => {
    const o = await owner();
    const list = await admin.get('/admin/businesses').query({ q: o.slug }).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      id: o.businessId,
      slug: o.slug,
      plan: 'FREE',
      suspendedAt: null,
      ownerEmail: o.email,
      staffCount: 1,
    });
    // search by the owner's email
    const byMail = await admin.get('/admin/businesses').query({ q: o.email }).expect(200);
    expect(byMail.body.items.map((b: { id: string }) => b.id)).toContain(o.businessId);
    const pro = await admin.get('/admin/businesses').query({ q: o.slug, plan: 'PRO' }).expect(200);
    expect(pro.body.total).toBe(0);
    await admin.get('/admin/businesses').query({ plan: 'GOLD' }).expect(400);
  });

  it('changes the plan: the limits of the owner change at once', async () => {
    const o = await owner();
    await o.agent.post('/staff').send({ displayName: 'Two', serviceIds: [] }).expect(201);
    expect(
      (await o.agent.post('/staff').send({ displayName: 'Three', serviceIds: [] })).body.code,
    ).toBe('PLAN_LIMIT_STAFF');
    const res = await admin
      .patch(`/admin/businesses/${o.businessId}/plan`)
      .send({ plan: 'PRO' })
      .expect(200);
    expect(res.body.plan).toBe('PRO');
    expect((await o.agent.get('/businesses/me/plan').expect(200)).body.plan).toBe('PRO');
    await o.agent.post('/staff').send({ displayName: 'Three', serviceIds: [] }).expect(201);
    await admin.patch(`/admin/businesses/${o.businessId}/plan`).send({ plan: 'GOLD' }).expect(400);
    await admin
      .patch(`/admin/businesses/${crypto.randomUUID()}/plan`)
      .send({ plan: 'PRO' })
      .expect(404);
  });

  it('suspending hides the public page, stops bookings and blocks the owner; reactivating restores everything', async () => {
    const o = await owner();
    const body = (time: string) => ({
      businessSlug: o.slug,
      serviceId: o.serviceId,
      staffId: o.staffId,
      startsAt: `${day(5)}T${time}:00.000Z`,
      customer: { name: 'Fatima', phone: `+2223${Math.floor(1000000 + Math.random() * 8999999)}` },
    });
    const before = await request(server()).post('/public/bookings').send(body('10:00')).expect(201);
    await request(server()).get(`/public/businesses/${o.slug}`).expect(200);

    const res = await admin
      .patch(`/admin/businesses/${o.businessId}/suspension`)
      .send({ suspended: true })
      .expect(200);
    expect(res.body.suspendedAt).not.toBeNull();

    // public side
    for (const r of [
      () => request(server()).get(`/public/businesses/${o.slug}`),
      () =>
        request(server())
          .get(`/public/businesses/${o.slug}/slots`)
          .query({ serviceId: o.serviceId, date: day(5) }),
      () => request(server()).get(`/public/businesses/${o.slug}/reviews`),
      () => request(server()).post('/public/bookings').send(body('11:00')),
      () =>
        request(server())
          .post('/public/ai/chat')
          .send({ businessSlug: o.slug, messages: [{ role: 'user', content: 'Bonjour' }] }),
    ]) {
      const out = await r();
      expect(out.status).toBe(403);
      expect(out.body.code).toBe('BUSINESS_SUSPENDED');
    }
    // ...and it leaves the sitemap
    const gone = (await request(server()).get('/public/sitemap').expect(200)).body;
    expect(gone.map((b: { slug: string }) => b.slug)).not.toContain(o.slug);
    // a customer can still see their booking
    await request(server()).get(`/public/bookings/${before.body.cancelToken}`).expect(200);

    // owner side: blocked at once, but can still see who they are
    const blocked = await o.agent.get('/services');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('BUSINESS_SUSPENDED');
    await o.agent.get('/auth/me').expect(200);
    await o.agent.post('/auth/logout').expect(204);

    // reactivated
    await admin
      .patch(`/admin/businesses/${o.businessId}/suspension`)
      .send({ suspended: false })
      .expect(200);
    await request(server()).get(`/public/businesses/${o.slug}`).expect(200);
    const listed = (await request(server()).get('/public/sitemap').expect(200)).body;
    expect(listed.map((b: { slug: string }) => b.slug)).toContain(o.slug);
    await request(server()).post('/public/bookings').send(body('11:00')).expect(201);
    const again = request.agent(server());
    await again.post('/auth/login').send({ email: o.email, password: PASSWORD }).expect(200);
    await again.get('/services').expect(200);

    const suspended = await admin.get('/admin/businesses').query({ suspended: 'true' }).expect(200);
    expect(suspended.body.items.map((b: { id: string }) => b.id)).not.toContain(o.businessId);
  });

  it('global statistics', async () => {
    const o = await owner();
    await prisma.business.update({ where: { id: o.businessId }, data: { plan: 'PRO' } });
    const s = (await admin.get('/admin/stats').expect(200)).body;
    expect(s.businesses.total).toBeGreaterThanOrEqual(1);
    expect(s.businesses.active + s.businesses.suspended).toBe(s.businesses.total);
    expect(s.businesses.byPlan.PRO).toBeGreaterThanOrEqual(1);
    expect(s.users).toBeGreaterThanOrEqual(2);
    expect(s.bookings.total).toBeGreaterThanOrEqual(s.bookings.thisMonth);
    expect(s.ai.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('AI usage and estimated cost per business, for one month', async () => {
    const o = await owner();
    const log = (model: string, tokensIn: number, tokensOut: number, error?: string) => ({
      businessId: o.businessId,
      feature: 'chat',
      model,
      tokensIn,
      tokensOut,
      latencyMs: 100,
      error: error ?? null,
    });
    await prisma.aiLog.createMany({
      data: [
        log('llama-3.3-70b-versatile', 1_000_000, 1_000_000),
        log('llama-3.1-8b-instant', 2_000_000, 0),
        log('llama-3.1-8b-instant', 0, 0, 'timeout'),
      ],
    });
    const rows = (await admin.get('/admin/ai-usage').expect(200)).body;
    const mine = rows.find((r: { businessId: string }) => r.businessId === o.businessId);
    expect(mine).toMatchObject({ calls: 3, errors: 1, tokensIn: 3_000_000, tokensOut: 1_000_000 });
    expect(mine.estimatedCostUsd).toBeCloseTo(1.48, 3); // 1.38 + 0.10
    expect(rows[0].estimatedCostUsd).toBeGreaterThanOrEqual(rows[rows.length - 1].estimatedCostUsd);

    const old = (await admin.get('/admin/ai-usage').query({ month: '2020-01' }).expect(200)).body;
    expect(old.find((r: { businessId: string }) => r.businessId === o.businessId)).toBeUndefined();
    await admin.get('/admin/ai-usage').query({ month: 'January' }).expect(400);

    const list = (await admin.get('/admin/businesses').query({ q: o.slug }).expect(200)).body;
    expect(list.items[0].aiCallsThisMonth).toBe(3);
  });

  describe('dead-letter list of failed emails', () => {
    async function failedMail(o: Awaited<ReturnType<typeof owner>>) {
      const customer = await prisma.customer.create({
        data: {
          businessId: o.businessId,
          name: 'Fatima',
          phone: `+2229${Math.floor(1000000 + Math.random() * 8999999)}`,
          email: uniqueEmail('dl'),
        },
      });
      const b = await prisma.booking.create({
        data: {
          businessId: o.businessId,
          customerId: customer.id,
          staffId: o.staffId,
          serviceId: o.serviceId,
          startsAt: new Date(Date.now() + 5 * 86_400_000),
          endsAt: new Date(Date.now() + 5 * 86_400_000 + 1_800_000),
          status: 'CONFIRMED',
          price: 300,
        },
      });
      return prisma.notification.create({
        data: {
          businessId: o.businessId,
          bookingId: b.id,
          channel: 'EMAIL',
          type: 'confirmation',
          status: 'FAILED',
          error: 'Resend error: domain not verified',
        },
      });
    }

    it('lists failed emails with their business and last error (admin only)', async () => {
      const o = await owner();
      const n = await failedMail(o);
      await o.agent.get('/admin/failed-notifications').expect(403);
      const res = await admin.get('/admin/failed-notifications').expect(200);
      const row = res.body.items.find((x: { id: string }) => x.id === n.id);
      expect(row).toMatchObject({
        type: 'confirmation',
        error: 'Resend error: domain not verified',
        business: { id: o.businessId, name: 'Admin Test' },
      });
    });

    it('retry puts the email back in the queue: it is sent and leaves the list', async () => {
      const o = await owner();
      const n = await failedMail(o);
      await admin.post(`/admin/failed-notifications/${n.id}/retry`).expect(200);
      await o.agent.post(`/admin/failed-notifications/${n.id}/retry`).expect(403);
      const end = Date.now() + 8000;
      let status = '';
      while (Date.now() < end) {
        status = (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status;
        if (status === 'SENT') break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(status).toBe('SENT');
      expect(
        mail.to(
          (await prisma.customer.findFirstOrThrow({ where: { businessId: o.businessId } })).email!,
        ).length,
      ).toBe(1);
      const again = await admin.post(`/admin/failed-notifications/${n.id}/retry`);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('NOT_FAILED');
      await admin.post(`/admin/failed-notifications/${crypto.randomUUID()}/retry`).expect(404);
    });
  });
});
