process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, uniqueEmail } from '../test-utils';

type Agent = ReturnType<typeof request.agent>;
const MIN = 60_000;
const DAY = 86_400_000;

describe('no appointment in the past (integration, needs the database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  async function shop() {
    const email = uniqueEmail('past');
    emails.push(email);
    const agent: Agent = request.agent(app.getHttpServer());
    const reg = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email, password: 'Password123', terms: true });
    await agent
      .patch('/businesses/me')
      .send({
        slug: `past-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: 'Salon',
        timezone: 'UTC',
      })
      .expect(200);
    const svc = await agent
      .post('/services')
      .send({ name: 'Coupe', durationMin: 30, price: 300 })
      .expect(201);
    const st = await agent
      .post('/staff')
      .send({ displayName: 'Sidi', serviceIds: [svc.body.id] })
      .expect(201);
    return {
      agent,
      businessId: reg.body.businessId as string,
      serviceId: svc.body.id as string,
      staffId: st.body.id as string,
    };
  }
  type Shop = Awaited<ReturnType<typeof shop>>;

  let phone = 0;
  const manual = (s: Shop, startsAt: Date) =>
    s.agent.post('/bookings').send({
      serviceId: s.serviceId,
      staffId: s.staffId,
      startsAt: startsAt.toISOString(),
      customer: { name: 'Walk in', phone: `+2227${String(1000000 + phone++)}` },
      status: 'CONFIRMED',
    });

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    await prisma.business.deleteMany({
      where: { id: { in: users.flatMap((u) => (u.businessId ? [u.businessId] : [])) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  describe('booking made by the owner (phone or walk-in): 15 minutes of tolerance', () => {
    it('refuses yesterday, last week and last year', async () => {
      const s = await shop();
      for (const back of [DAY, 7 * DAY, 365 * DAY]) {
        const res = await manual(s, new Date(Date.now() - back));
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PAST_NOT_ALLOWED');
      }
      expect(await prisma.booking.count({ where: { businessId: s.businessId } })).toBe(0);
    });

    it('accepts a customer who arrived 10 minutes ago, refuses 20 minutes ago', async () => {
      const s = await shop();
      await manual(s, new Date(Date.now() - 10 * MIN)).expect(201);
      const late = await manual(s, new Date(Date.now() - 20 * MIN));
      expect(late.status).toBe(400);
      expect(late.body.code).toBe('PAST_NOT_ALLOWED');
    });

    it('accepts now and any future time', async () => {
      const s = await shop();
      await manual(s, new Date(Date.now() + 1000)).expect(201);
      await manual(s, new Date(Date.now() + 3 * DAY)).expect(201);
    });
  });

  describe('moving a booking (drag and drop): no tolerance', () => {
    it('refuses yesterday and one second ago, accepts the future', async () => {
      const s = await shop();
      const b = (await manual(s, new Date(Date.now() + 2 * DAY)).expect(201)).body;
      for (const back of [DAY, 60 * MIN, 1000]) {
        const res = await s.agent
          .patch(`/bookings/${b.id}`)
          .send({ startsAt: new Date(Date.now() - back).toISOString() });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PAST_NOT_ALLOWED');
      }
      const target = new Date(Date.now() + 4 * DAY);
      const ok = await s.agent
        .patch(`/bookings/${b.id}`)
        .send({ startsAt: target.toISOString() })
        .expect(200);
      expect(new Date(ok.body.startsAt).getTime()).toBe(target.getTime());
    });

    it('a refused move leaves the booking where it was', async () => {
      const s = await shop();
      const when = new Date(Date.now() + 2 * DAY);
      const b = (await manual(s, when).expect(201)).body;
      await s.agent
        .patch(`/bookings/${b.id}`)
        .send({ startsAt: new Date(Date.now() - DAY).toISOString() })
        .expect(400);
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
      expect(row.startsAt.getTime()).toBe(when.getTime());
    });
  });

  it('a past booking can still get its status (Completed, No-show): only a new start time is checked', async () => {
    const s = await shop();
    const customer = await prisma.customer.create({
      data: { businessId: s.businessId, name: 'Old', phone: '+22270000001' },
    });
    const start = new Date(Date.now() - 3 * DAY);
    const past = await prisma.booking.create({
      data: {
        businessId: s.businessId,
        customerId: customer.id,
        staffId: s.staffId,
        serviceId: s.serviceId,
        startsAt: start,
        endsAt: new Date(start.getTime() + 30 * MIN),
        status: 'CONFIRMED',
        price: 300,
      },
    });
    const done = await s.agent
      .patch(`/bookings/${past.id}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(done.body.status).toBe('COMPLETED');
  });
});
