process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, uniqueEmail } from '../test-utils';

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = 'Password123';
const day = (n: number): string => DateTime.utc().plus({ days: n }).toISODate() as string;
const iso = (date: string, time: string): string => `${date}T${time}:00.000Z`;

describe('booking (integration, needs the database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  const server = () => app.getHttpServer();

  interface Shop {
    agent: Agent;
    businessId: string;
    slug: string;
    serviceId: string;
    staffIds: string[];
  }

  /** A business with one service, N employees working every day 09:00-18:00. */
  async function shop(
    opts: {
      staff?: number;
      business?: Record<string, unknown>;
      service?: Record<string, unknown>;
      breakAt?: [string, string];
      /** FREE allows 2 employees; a test with more needs PRO. */
      plan?: 'PRO';
    } = {},
  ): Promise<Shop> {
    const email = uniqueEmail('owner');
    emails.push(email);
    const agent = request.agent(server());
    const reg = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email, password: PASSWORD, terms: true });
    if (opts.plan)
      await prisma.business.update({
        where: { id: reg.body.businessId },
        data: { plan: opts.plan },
      });
    const slug = `shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await agent
      .patch('/businesses/me')
      .send({ slug, name: 'Test Shop', ...opts.business })
      .expect(200);
    const svc = await agent
      .post('/services')
      .send({ name: 'Coupe', durationMin: 30, price: 300, ...opts.service })
      .expect(201);
    const staffIds: string[] = [];
    for (let i = 0; i < (opts.staff ?? 1); i++) {
      const st = await agent
        .post('/staff')
        .send({ displayName: `Staff ${i + 1}`, serviceIds: [svc.body.id] })
        .expect(201);
      const rows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: '09:00',
        endTime: '18:00',
        ...(opts.breakAt ? { breakStart: opts.breakAt[0], breakEnd: opts.breakAt[1] } : {}),
      }));
      await agent.put(`/staff/${st.body.id}/working-hours`).send(rows).expect(200);
      staffIds.push(st.body.id);
    }
    return { agent, businessId: reg.body.businessId, slug, serviceId: svc.body.id, staffIds };
  }

  const slots = async (s: Shop, date: string, staffId?: string) =>
    (
      await request(server())
        .get(`/public/businesses/${s.slug}/slots`)
        .query({ serviceId: s.serviceId, date, ...(staffId ? { staffId } : {}) })
    ).body.slots as { start: string; end: string }[];

  let phoneSeq = 0;
  const book = (s: Shop, startsAt: string, over: Record<string, unknown> = {}, as?: Agent) =>
    (as ?? request(server())).post('/public/bookings').send({
      businessSlug: s.slug,
      serviceId: s.serviceId,
      staffId: s.staffIds[0],
      startsAt,
      customer: { name: 'Fatima', phone: `+2223${String(1000000 + phoneSeq++)}`, email: '' },
      ...over,
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

  describe('slots', () => {
    it('lists free slots quickly (NFR-02) and rejects bad input', async () => {
      const s = await shop();
      const t0 = Date.now();
      const list = await slots(s, day(5));
      expect(Date.now() - t0).toBeLessThan(500);
      expect(list[0].start).toBe(iso(day(5), '09:00'));
      expect(list).toHaveLength(35);
      const bad = await request(server())
        .get(`/public/businesses/${s.slug}/slots`)
        .query({ serviceId: s.serviceId, date: 'tomorrow' });
      expect(bad.status).toBe(400);
      expect(
        (
          await request(server())
            .get('/public/businesses/nope-nope/slots')
            .query({ serviceId: s.serviceId, date: day(5) })
        ).status,
      ).toBe(404);
    });

    it('hides breaks, days off, booked times and uses the business settings (AC-03)', async () => {
      const s = await shop({ breakAt: ['13:00', '14:00'] });
      const date = day(5);
      const times = (await slots(s, date)).map((x) => x.start.slice(11, 16));
      expect(times).not.toContain('13:00');
      expect(times).not.toContain('13:15');
      expect(times).toContain('12:30');
      expect(times).toContain('14:00');

      await book(s, iso(date, '10:00')).expect(201);
      const after = (await slots(s, date)).map((x) => x.start.slice(11, 16));
      expect(after).not.toContain('10:00');
      expect(after).not.toContain('09:45');
      expect(after).toContain('09:30');
      expect(after).toContain('10:30');

      await s.agent
        .post('/time-off')
        .send({ staffId: null, startsAt: iso(day(6), '00:00'), endsAt: iso(day(7), '00:00') })
        .expect(201);
      expect(await slots(s, day(6))).toEqual([]);

      await s.agent.patch('/businesses/me').send({ slotStepMin: 30, maxDaysAhead: 10 }).expect(200);
      expect((await slots(s, day(8)))[1].start.slice(11, 16)).toBe('09:30');
      await s.agent.patch('/businesses/me').send({ maxDaysAhead: 2 }).expect(200);
      expect(await slots(s, day(5))).toEqual([]);
    });
  });

  describe('create a booking', () => {
    it('confirms at once in automatic mode, creates the customer, removes the slot', async () => {
      const s = await shop();
      const date = day(5);
      const res = await book(s, iso(date, '10:00'), {
        customer: { name: 'Fatima', phone: '+222 33 11 22 33', email: 'f@example.com' },
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'CONFIRMED',
        canChange: true,
        service: { name: 'Coupe' },
        price: 300,
      });
      expect(res.body.cancelToken).toMatch(/^[0-9a-f-]{36}$/);
      expect((await slots(s, date)).some((x) => x.start === iso(date, '10:00'))).toBe(false);
      // Same phone again (other spelling): the same customer, updated.
      await book(s, iso(date, '11:00'), {
        customer: { name: 'Fatima B.', phone: '+22233112233' },
      }).expect(201);
      const customers = await prisma.customer.findMany({ where: { businessId: s.businessId } });
      expect(customers).toHaveLength(1);
      expect(customers[0]).toMatchObject({
        name: 'Fatima B.',
        phone: '+22233112233',
        email: 'f@example.com',
      });
    });

    it('stays pending in manual mode', async () => {
      const s = await shop({ business: { bookingMode: 'MANUAL' } });
      expect((await book(s, iso(day(5), '10:00'))).body.status).toBe('PENDING');
    });

    it('refuses a slot that is not offered (taken, break, off grid, before opening, too soon)', async () => {
      const s = await shop({ breakAt: ['13:00', '14:00'] });
      const date = day(5);
      await book(s, iso(date, '10:00')).expect(201);
      for (const t of ['10:00', '10:15', '13:00', '13:15', '09:07', '08:00', '18:00']) {
        const res = await book(s, iso(date, t));
        expect([t, res.status, res.body.code]).toEqual([t, 409, 'SLOT_TAKEN']);
      }
      const soon = await book(s, new Date(Date.now() + 30 * 60_000).toISOString());
      expect(soon.status).toBe(409);
      const past = await book(s, iso(day(-2), '10:00'));
      expect(past.status).toBe(409);
    });

    it('validates the body', async () => {
      const s = await shop();
      const res = await book(s, iso(day(5), '10:00'), { customer: { name: '', phone: '12' } });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect((await book(s, 'not a date')).status).toBe(400);
    });

    it('"any employee" spreads the work, then runs out (SLOT_TAKEN)', async () => {
      const s = await shop({ staff: 2 });
      const date = day(5);
      const a = await book(s, iso(date, '10:00'), { staffId: null });
      const b = await book(s, iso(date, '10:00'), { staffId: null });
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(new Set([a.body.staff.displayName, b.body.staff.displayName]).size).toBe(2);
      expect((await book(s, iso(date, '10:00'), { staffId: null })).status).toBe(409);
    });

    it('links the customer to a logged in client account', async () => {
      const s = await shop();
      const email = uniqueEmail('client');
      emails.push(email);
      const user = await prisma.user.create({
        data: { email, name: 'Client', role: 'CLIENT', passwordHash: await argon2.hash(PASSWORD) },
      });
      const client = request.agent(server());
      await client.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      await book(s, iso(day(5), '10:00'), {}, client).expect(201);
      const c = await prisma.customer.findFirstOrThrow({ where: { businessId: s.businessId } });
      expect(c.userId).toBe(user.id);
    });
  });

  // AC-02: the database decides who wins.
  describe('double booking (AC-02)', () => {
    const outcomes = (rs: request.Response[]) => ({
      ok: rs.filter((r) => r.status === 201).length,
      taken: rs.filter((r) => r.status === 409 && r.body.code === 'SLOT_TAKEN').length,
    });

    it('2 parallel requests for the same slot: exactly one wins', async () => {
      const s = await shop();
      const t = iso(day(5), '10:00');
      const rs = await Promise.all([book(s, t), book(s, t)]);
      expect(outcomes(rs)).toEqual({ ok: 1, taken: 1 });
    });

    it('20 parallel requests for the same slot: exactly one wins, 19 get SLOT_TAKEN', async () => {
      const s = await shop();
      const t = iso(day(5), '10:00');
      const rs = await Promise.all(Array.from({ length: 20 }, () => book(s, t)));
      expect(outcomes(rs)).toEqual({ ok: 1, taken: 19 });
      const rows = await prisma.booking.findMany({
        where: { businessId: s.businessId, status: { not: 'CANCELLED' } },
      });
      expect(rows).toHaveLength(1);
    });

    it('20 parallel requests with the SAME phone number still give exactly one booking', async () => {
      const s = await shop();
      const t = iso(day(5), '10:00');
      const rs = await Promise.all(
        Array.from({ length: 20 }, () =>
          book(s, t, { customer: { name: 'Same', phone: '+22233999999' } }),
        ),
      );
      expect(outcomes(rs)).toEqual({ ok: 1, taken: 19 });
      expect(await prisma.customer.count({ where: { businessId: s.businessId } })).toBe(1);
    });

    it('20 parallel "any employee" requests with 3 employees: exactly 3 win', async () => {
      const s = await shop({ staff: 3, plan: 'PRO' });
      const t = iso(day(5), '10:00');
      const rs = await Promise.all(Array.from({ length: 20 }, () => book(s, t, { staffId: null })));
      expect(outcomes(rs)).toEqual({ ok: 3, taken: 17 });
    });

    it('overlapping (not identical) parallel requests also give one winner', async () => {
      const s = await shop();
      const date = day(5);
      const rs = await Promise.all(
        ['10:00', '10:15', '10:00', '10:15', '09:45'].map((t) => book(s, iso(date, t))),
      );
      expect(outcomes(rs).ok).toBe(1);
    });

    it('the database itself refuses an overlap, even when the code is bypassed', async () => {
      const s = await shop();
      const created = await book(s, iso(day(5), '10:00')).expect(201);
      const b = await prisma.booking.findUniqueOrThrow({ where: { id: created.body.id } });
      await expect(
        prisma.booking.create({
          data: {
            businessId: s.businessId,
            customerId: b.customerId,
            staffId: b.staffId,
            serviceId: b.serviceId,
            startsAt: new Date(iso(day(5), '10:15')),
            endsAt: new Date(iso(day(5), '10:45')),
            price: 1,
          },
        }),
      ).rejects.toThrow(/no_overlap|exclusion/);
    });

    it('a cancelled booking frees the slot', async () => {
      const s = await shop();
      const t = iso(day(5), '10:00');
      const first = await book(s, t).expect(201);
      await request(server()).post(`/public/bookings/${first.body.cancelToken}/cancel`).expect(200);
      await book(s, t).expect(201);
    });
  });

  describe('cancel and reschedule by token', () => {
    it('cancels, once', async () => {
      const s = await shop();
      const { cancelToken } = (await book(s, iso(day(5), '10:00')).expect(201)).body;
      expect((await request(server()).get(`/public/bookings/${cancelToken}`)).body).toMatchObject({
        status: 'CONFIRMED',
        canChange: true,
      });
      const res = await request(server()).post(`/public/bookings/${cancelToken}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', canChange: false });
      const again = await request(server()).post(`/public/bookings/${cancelToken}/cancel`);
      expect([again.status, again.body.code]).toEqual([409, 'BOOKING_CLOSED']);
      expect(
        (await request(server()).get('/public/bookings/00000000-0000-4000-8000-000000000000'))
          .status,
      ).toBe(404);
      expect((await request(server()).get('/public/bookings/not-a-token')).status).toBe(400);
    });

    it('refuses after the cancel limit (FR-35)', async () => {
      const s = await shop({ business: { cancelLimitHours: 72 } });
      const { cancelToken } = (await book(s, iso(day(1), '15:00')).expect(201)).body;
      expect((await request(server()).get(`/public/bookings/${cancelToken}`)).body.canChange).toBe(
        false,
      );
      const res = await request(server()).post(`/public/bookings/${cancelToken}/cancel`);
      expect([res.status, res.body.code]).toEqual([403, 'CHANGE_WINDOW_PASSED']);
      const move = await request(server())
        .post(`/public/bookings/${cancelToken}/reschedule`)
        .send({ startsAt: iso(day(6), '10:00') });
      expect(move.status).toBe(403);
    });

    it('reschedules to a free slot, frees the old one, and refuses a taken one', async () => {
      const s = await shop();
      const date = day(5);
      const mine = (await book(s, iso(date, '10:00')).expect(201)).body;
      await book(s, iso(date, '12:00')).expect(201);
      const ok = await request(server())
        .post(`/public/bookings/${mine.cancelToken}/reschedule`)
        .send({ startsAt: iso(date, '10:15') });
      expect(ok.status).toBe(200); // overlaps its own old time: allowed
      expect(ok.body.startsAt).toBe(iso(date, '10:15'));
      const taken = await request(server())
        .post(`/public/bookings/${mine.cancelToken}/reschedule`)
        .send({ startsAt: iso(date, '12:00') });
      expect([taken.status, taken.body.code]).toEqual([409, 'SLOT_TAKEN']);
      const free = (await slots(s, date)).map((x) => x.start.slice(11, 16));
      expect(free).toContain('09:45');
      expect(free).not.toContain('10:15');
    });
  });

  describe('status machine and owner tools', () => {
    it('applies the transitions and counts visits and no-shows', async () => {
      const s = await shop({ business: { bookingMode: 'MANUAL' } });
      const customer = { name: 'Omar', phone: '+22233444444' };
      const manual = (date: string, time: string, status: 'PENDING' | 'CONFIRMED' = 'CONFIRMED') =>
        s.agent.post('/bookings').send({
          serviceId: s.serviceId,
          staffId: s.staffIds[0],
          startsAt: iso(date, time),
          customer,
          status,
        });

      const pending = (await manual(day(5), '10:00', 'PENDING').expect(201)).body;
      expect(
        (await s.agent.patch(`/bookings/${pending.id}/status`).send({ status: 'COMPLETED' })).body
          .code,
      ).toBe('INVALID_TRANSITION');
      expect(
        (await s.agent.patch(`/bookings/${pending.id}/status`).send({ status: 'CONFIRMED' })).body
          .status,
      ).toBe('CONFIRMED');
      expect(
        (await s.agent.patch(`/bookings/${pending.id}/status`).send({ status: 'COMPLETED' })).body
          .code,
      ).toBe('TOO_EARLY');

      const past1 = (await manual(day(-3), '10:00').expect(201)).body;
      expect(
        (await s.agent.patch(`/bookings/${past1.id}/status`).send({ status: 'COMPLETED' })).body
          .status,
      ).toBe('COMPLETED');
      const past2 = (await manual(day(-3), '11:00').expect(201)).body;
      expect(
        (await s.agent.patch(`/bookings/${past2.id}/status`).send({ status: 'NO_SHOW' })).body
          .status,
      ).toBe('NO_SHOW');
      const c = await prisma.customer.findFirstOrThrow({ where: { businessId: s.businessId } });
      expect([c.visitsCount, c.noShowCount]).toEqual([1, 1]);

      expect(
        (await s.agent.patch(`/bookings/${past1.id}/status`).send({ status: 'CANCELLED' })).status,
      ).toBe(409);
      expect(
        (await s.agent.patch(`/bookings/${pending.id}/status`).send({ status: 'CANCELLED' })).body
          .status,
      ).toBe('CANCELLED');
      expect(
        (await s.agent.patch(`/bookings/${pending.id}/status`).send({ status: 'CONFIRMED' })).body
          .code,
      ).toBe('INVALID_TRANSITION');
      expect(
        (await s.agent.patch(`/bookings/${pending.id}/status`).send({ status: 'NOPE' })).status,
      ).toBe(400);
    });

    it('lists with filters, moves, and refuses overlaps (FR-37, FR-41)', async () => {
      const s = await shop({ staff: 2 });
      const date = day(5);
      const a = (await book(s, iso(date, '10:00')).expect(201)).body;
      await book(s, iso(date, '11:00')).expect(201);
      await book(s, iso(date, '10:00'), { staffId: s.staffIds[1] }).expect(201);

      const all = await s.agent
        .get('/bookings')
        .query({ from: iso(date, '00:00'), to: iso(day(6), '00:00') });
      expect(all.body.total).toBe(3);
      expect(all.body.items[0].customer.name).toBe('Fatima');
      expect((await s.agent.get('/bookings').query({ staffId: s.staffIds[1] })).body.total).toBe(1);
      expect((await s.agent.get('/bookings').query({ status: 'CANCELLED' })).body.total).toBe(0);

      const moved = await s.agent.patch(`/bookings/${a.id}`).send({ startsAt: iso(date, '15:00') });
      expect(moved.status).toBe(200);
      expect(moved.body.startsAt).toBe(iso(date, '15:00'));
      const clash = await s.agent.patch(`/bookings/${a.id}`).send({ startsAt: iso(date, '11:15') });
      expect([clash.status, clash.body.code]).toEqual([409, 'SLOT_TAKEN']);
      const other = await s.agent
        .patch(`/bookings/${a.id}`)
        .send({ startsAt: iso(date, '11:00'), staffId: s.staffIds[1] });
      expect(other.status).toBe(200);
      expect(other.body.staff.id).toBe(s.staffIds[1]);

      const manualClash = await s.agent.post('/bookings').send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: iso(date, '11:00'),
        customer: { name: 'Xx', phone: '+22233000000' },
      });
      expect(manualClash.status).toBe(409);
      const noStaff = await s.agent.post('/bookings').send({
        serviceId: s.serviceId,
        staffId: '00000000-0000-4000-8000-000000000000',
        startsAt: iso(date, '16:00'),
        customer: { name: 'Xx', phone: '+22233000000' },
      });
      expect(noStaff.status).toBe(404);
    });

    it('needs a login and the OWNER or STAFF role', async () => {
      const s = await shop();
      expect((await request(server()).get('/bookings')).status).toBe(401);
      const email = uniqueEmail('client');
      emails.push(email);
      await prisma.user.create({
        data: { email, name: 'C', role: 'CLIENT', passwordHash: await argon2.hash(PASSWORD) },
      });
      const client = request.agent(server());
      await client.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      expect((await client.get('/bookings')).status).toBe(403);
      expect((await s.agent.get('/bookings')).status).toBe(200);
    });
  });
});
