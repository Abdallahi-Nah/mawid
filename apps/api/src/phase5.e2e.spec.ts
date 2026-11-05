process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import request from 'supertest';
import { PaymentProvider } from './payments/payment-provider';
import { PrismaService } from './prisma/prisma.service';
import { createTestApp, MemoryMail, uniqueEmail } from './test-utils';

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = 'Password123';
const day = (n: number): string => DateTime.utc().plus({ days: n }).toISODate() as string;
const iso = (date: string, time: string): string => `${date}T${time}:00.000Z`;
const waitFor = async (cond: () => boolean | Promise<boolean>, ms = 8000): Promise<void> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('timeout waiting for condition');
};
// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('phase 5 (integration, needs the database and Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MemoryMail;
  const emails: string[] = [];
  const server = () => app.getHttpServer();

  interface Shop {
    agent: Agent;
    ownerEmail: string;
    businessId: string;
    slug: string;
    serviceId: string;
    staffId: string;
  }

  /** A business with one service and one employee working every day 09:00-18:00 (UTC, no offset). */
  async function shop(
    opts: { business?: Record<string, unknown>; service?: Record<string, unknown> } = {},
  ): Promise<Shop> {
    const ownerEmail = uniqueEmail('owner');
    emails.push(ownerEmail);
    const agent = request.agent(server());
    const reg = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email: ownerEmail, password: PASSWORD, terms: true });
    const slug = `p5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await agent
      .patch('/businesses/me')
      .send({ slug, name: 'Salon P5', timezone: 'UTC', ...opts.business })
      .expect(200);
    const svc = await agent
      .post('/services')
      .send({ name: 'Coupe', durationMin: 30, price: 300, ...opts.service })
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
      ownerEmail,
      businessId: reg.body.businessId,
      slug,
      serviceId: svc.body.id,
      staffId: st.body.id,
    };
  }

  let phoneSeq = 0;
  const book = (s: Shop, startsAt: string, over: Record<string, unknown> = {}) =>
    request(server())
      .post('/public/bookings')
      .send({
        businessSlug: s.slug,
        serviceId: s.serviceId,
        staffId: s.staffId,
        startsAt,
        customer: {
          name: 'Fatima Zahra',
          phone: `+2223${String(2000000 + phoneSeq++)}`,
          email: uniqueEmail('cust'),
        },
        locale: 'en',
        ...over,
      });

  /** A booking written straight in the database (to put it in the past). */
  async function insertBooking(
    s: Shop,
    o: {
      startsAt: Date;
      status: BookingStatus;
      price?: number;
      serviceId?: string;
      customerName?: string;
      email?: string | null;
      locale?: string;
    },
  ) {
    const phone = `+2224${String(3000000 + phoneSeq++)}`;
    const customer = await prisma.customer.create({
      data: {
        businessId: s.businessId,
        name: o.customerName ?? 'Fatima Zahra',
        phone,
        email: o.email === undefined ? uniqueEmail('c') : o.email,
      },
    });
    return prisma.booking.create({
      data: {
        businessId: s.businessId,
        customerId: customer.id,
        staffId: s.staffId,
        serviceId: o.serviceId ?? s.serviceId,
        startsAt: o.startsAt,
        endsAt: new Date(o.startsAt.getTime() + 30 * 60_000),
        status: o.status,
        price: o.price ?? 300,
        locale: o.locale ?? 'en',
      },
    });
  }
  const at = (dayOffset: number, time: string): Date => new Date(iso(day(dayOffset), time));

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

  // -----------------------------------------------------------------------------------------------
  describe('plans and limits (FR-91)', () => {
    it('FREE allows 2 active employees; the 3rd is refused with PLAN_LIMIT_STAFF; PRO lifts it', async () => {
      const s = await shop(); // already has 1
      await s.agent.post('/staff').send({ displayName: 'Two', serviceIds: [] }).expect(201);
      const refused = await s.agent.post('/staff').send({ displayName: 'Three', serviceIds: [] });
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('PLAN_LIMIT_STAFF');
      expect(refused.body.details).toEqual({ plan: 'FREE', limit: 2 });

      const plan = await s.agent.get('/businesses/me/plan').expect(200);
      expect(plan.body.plan).toBe('FREE');
      expect(plan.body.limits.staff).toBe(2);
      expect(plan.body.usage.staff).toBe(2);

      await prisma.business.update({ where: { id: s.businessId }, data: { plan: 'PRO' } });
      await s.agent.post('/staff').send({ displayName: 'Three', serviceIds: [] }).expect(201);
    });

    it('an inactive employee does not count, but turning them on again does', async () => {
      const s = await shop();
      await s.agent.post('/staff').send({ displayName: 'Two', serviceIds: [] }).expect(201);
      const off = await s.agent
        .post('/staff')
        .send({ displayName: 'Off', serviceIds: [], active: false })
        .expect(201);
      const on = await s.agent.patch(`/staff/${off.body.id}`).send({ active: true });
      expect(on.status).toBe(403);
      expect(on.body.code).toBe('PLAN_LIMIT_STAFF');
    });

    it('refuses new bookings (web and owner) when the monthly limit is reached: PLAN_LIMIT_BOOKINGS', async () => {
      const s = await shop();
      const customer = await prisma.customer.create({
        data: { businessId: s.businessId, name: 'Bulk', phone: '+22240000000' },
      });
      await prisma.booking.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          businessId: s.businessId,
          customerId: customer.id,
          staffId: s.staffId,
          serviceId: s.serviceId,
          startsAt: new Date(at(200, '00:00').getTime() + i * 2 * 3_600_000),
          endsAt: new Date(at(200, '00:30').getTime() + i * 2 * 3_600_000),
          status: 'CONFIRMED' as const,
          price: 300,
        })),
      });
      const web = await book(s, iso(day(5), '10:00'));
      expect(web.status).toBe(403);
      expect(web.body.code).toBe('PLAN_LIMIT_BOOKINGS');
      const manual = await s.agent.post('/bookings').send({
        serviceId: s.serviceId,
        staffId: s.staffId,
        startsAt: iso(day(5), '11:00'),
        customer: { name: 'Walk in', phone: '+22233999888' },
        status: 'CONFIRMED',
      });
      expect(manual.status).toBe(403);
      expect(manual.body.code).toBe('PLAN_LIMIT_BOOKINGS');

      await prisma.business.update({ where: { id: s.businessId }, data: { plan: 'PRO' } });
      await book(s, iso(day(5), '10:00')).expect(201);
    });
  });

  // -----------------------------------------------------------------------------------------------
  describe('buffer between appointments (FR-24) and confirmation mode (FR-36)', () => {
    it('the business buffer blocks the time after a booking, in the slots and in the database', async () => {
      const s = await shop({ business: { bufferMin: 30 } });
      const b = await book(s, iso(day(5), '10:00')).expect(201);
      const list = (
        await request(server())
          .get(`/public/businesses/${s.slug}/slots`)
          .query({ serviceId: s.serviceId, staffId: s.staffId, date: day(5) })
      ).body.slots.map((x: { start: string }) => x.start.slice(11, 16));
      expect(list).toContain('09:00'); // 09:00-09:30 + 30 min buffer ends exactly at 10:00
      expect(list).not.toContain('09:30'); // would end its buffer after 10:00
      expect(list).not.toContain('10:30'); // inside the buffer of the 10:00 booking
      expect(list).toContain('11:00');
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: b.body.id } });
      expect(row.bufferMin).toBe(30);
    });

    it('a service that needs more time than the business default keeps its own buffer', async () => {
      const s = await shop({ business: { bufferMin: 30 }, service: { bufferMin: 45 } });
      const b = await book(s, iso(day(5), '10:00')).expect(201);
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: b.body.id } });
      expect(row.bufferMin).toBe(45);
    });

    it('AUTO confirms at once, MANUAL waits for the owner', async () => {
      const auto = await shop({ business: { bookingMode: 'AUTO' } });
      expect((await book(auto, iso(day(5), '10:00')).expect(201)).body.status).toBe('CONFIRMED');
      const manual = await shop({ business: { bookingMode: 'MANUAL' } });
      const b = await book(manual, iso(day(5), '10:00')).expect(201);
      expect(b.body.status).toBe('PENDING');
      await manual.agent
        .patch(`/bookings/${b.body.id}/status`)
        .send({ status: 'CONFIRMED' })
        .expect(200);
    });
  });

  // -----------------------------------------------------------------------------------------------
  describe('deposit (FR-61)', () => {
    const deposited = (): Promise<Shop> =>
      shop({
        business: { bookingMode: 'AUTO', paymentInstructions: 'Bankily 22 00 11 22' },
        service: { depositAmount: 100 },
      });

    it('a deposit can not be more than the price', async () => {
      const s = await shop();
      const res = await s.agent
        .post('/services')
        .send({ name: 'Xx', durationMin: 30, price: 300, depositAmount: 400 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DEPOSIT_TOO_HIGH');
      const ok = await s.agent
        .post('/services')
        .send({ name: 'Yy', durationMin: 30, price: 300, depositAmount: 100 })
        .expect(201);
      expect(ok.body.depositAmount).toBe(100);
      const lower = await s.agent.patch(`/services/${ok.body.id}`).send({ price: 50 });
      expect(lower.body.code).toBe('DEPOSIT_TOO_HIGH');
    });

    it('the whole flow: PENDING even in AUTO, proof, reject, new proof, validate -> CONFIRMED', async () => {
      const s = await deposited();
      const customerEmail = uniqueEmail('cust');
      const created = await book(s, iso(day(5), '10:00'), {
        customer: { name: 'Fatima', phone: '+22233555111', email: customerEmail },
      }).expect(201);
      const token = created.body.cancelToken as string;
      expect(created.body.status).toBe('PENDING'); // AUTO mode, but a deposit is due
      expect(created.body.deposit).toEqual({
        amount: 100,
        status: 'PENDING',
        submitted: false,
        instructions: 'Bankily 22 00 11 22',
      });

      // The owner can not confirm by hand, and can not validate nothing.
      const early = await s.agent
        .patch(`/bookings/${created.body.id}/status`)
        .send({ status: 'CONFIRMED' });
      expect(early.status).toBe(409);
      expect(early.body.code).toBe('DEPOSIT_REQUIRED');
      const pending = await s.agent.get('/payments').query({ status: 'PENDING' }).expect(200);
      const payment = pending.body.items.find(
        (p: { booking: { id: string } }) => p.booking.id === created.body.id,
      );
      expect(payment.amount).toBe(100);
      const noProof = await s.agent.post(`/payments/${payment.id}/validate`);
      expect(noProof.status).toBe(409);
      expect(noProof.body.code).toBe('NO_PROOF');

      // The customer must send something.
      const empty = await request(server()).post(`/public/bookings/${token}/payment`).send({});
      expect(empty.status).toBe(400);
      expect(empty.body.code).toBe('PROOF_REQUIRED');
      const sent = await request(server())
        .post(`/public/bookings/${token}/payment`)
        .send({ reference: 'BK-778899' })
        .expect(200);
      expect(sent.body.deposit.submitted).toBe(true);
      expect(
        await prisma.notification.count({
          where: { bookingId: created.body.id, type: 'owner_payment' },
        }),
      ).toBe(1);

      // Rejected: the booking stays PENDING and the customer sends a screenshot.
      await s.agent.post(`/payments/${payment.id}/reject`).expect(200);
      const rejected = await request(server()).get(`/public/bookings/${token}`).expect(200);
      expect(rejected.body.status).toBe('PENDING');
      expect(rejected.body.deposit.status).toBe('FAILED');
      const again = await s.agent.post(`/payments/${payment.id}/reject`);
      expect(again.body.code).toBe('PAYMENT_DECIDED');

      const resent = await request(server())
        .post(`/public/bookings/${token}/payment`)
        .field('reference', 'BK-112233')
        .attach('file', PNG, { filename: 'proof.png', contentType: 'image/png' })
        .expect(200);
      expect(resent.body.deposit.status).toBe('PENDING');
      const row = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(row.reference).toBe('BK-112233');
      expect(row.proofUrl).toMatch(/\/uploads\/.+\/proofs\/.+\.png$/);
      expect(row.provider).toBe('manual');

      // Validated: PAID and CONFIRMED, the customer gets the confirmation.
      const ok = await s.agent.post(`/payments/${payment.id}/validate`).expect(200);
      expect(ok.body.status).toBe('PAID');
      const after = await request(server()).get(`/public/bookings/${token}`).expect(200);
      expect(after.body.status).toBe('CONFIRMED');
      await waitFor(() => mail.to(customerEmail).some((m) => /confirmed/i.test(m.subject)));

      const late = await request(server())
        .post(`/public/bookings/${token}/payment`)
        .send({ reference: 'BK-000000' });
      expect(late.status).toBe(409);
    });

    it('refuses a file that is not an image, and a booking without deposit', async () => {
      const s = await deposited();
      const b = await book(s, iso(day(5), '10:00')).expect(201);
      const bad = await request(server())
        .post(`/public/bookings/${b.body.cancelToken}/payment`)
        .attach('file', Buffer.from('not an image at all, just text'), 'proof.png');
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('INVALID_IMAGE');

      const plain = await shop();
      const nb = await book(plain, iso(day(5), '10:00')).expect(201);
      const res = await request(server())
        .post(`/public/bookings/${nb.body.cancelToken}/payment`)
        .send({ reference: 'BK-123456' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NO_DEPOSIT_DUE');
    });

    it('a real provider that answers PAID confirms the booking with the same flow', async () => {
      const s = await deposited();
      const b = await book(s, iso(day(5), '10:00')).expect(201);
      const provider = app.get(PaymentProvider);
      const spy = jest.spyOn(provider, 'verify').mockResolvedValue('PAID');
      try {
        const res = await request(server())
          .post(`/public/bookings/${b.body.cancelToken}/payment`)
          .send({ reference: 'API-OK-1' })
          .expect(200);
        expect(res.body.status).toBe('CONFIRMED');
        expect(res.body.deposit.status).toBe('PAID');
      } finally {
        spy.mockRestore();
      }
    });

    it("another business can not see, validate or reject this business's payments (AC-07)", async () => {
      const s = await deposited();
      const other = await shop();
      const b = await book(s, iso(day(5), '10:00')).expect(201);
      await request(server())
        .post(`/public/bookings/${b.body.cancelToken}/payment`)
        .send({ reference: 'BK-555555' })
        .expect(200);
      const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.body.id } });
      expect((await other.agent.get('/payments').expect(200)).body.total).toBe(0);
      await other.agent.post(`/payments/${payment.id}/validate`).expect(404);
      await other.agent.post(`/payments/${payment.id}/reject`).expect(404);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
        'PENDING',
      );
    });
  });

  // -----------------------------------------------------------------------------------------------
  describe('reviews (FR-71, FR-72)', () => {
    /** A CONFIRMED visit that already took place, completed by the owner (this sends the email). */
    async function completedVisit(s: Shop, name = 'Fatima Zahra Mint Ali', hoursAgo = 3) {
      const email = uniqueEmail('rev');
      const b = await insertBooking(s, {
        startsAt: new Date(Date.now() - hoursAgo * 3_600_000),
        status: 'CONFIRMED',
        customerName: name,
        email,
      });
      await s.agent.patch(`/bookings/${b.id}/status`).send({ status: 'COMPLETED' }).expect(200);
      return { b, email };
    }

    it('COMPLETED sends an email with a secret link to the rating page', async () => {
      const s = await shop();
      const { b, email } = await completedVisit(s);
      await waitFor(() => mail.to(email).some((m) => m.text.includes('/review/')));
      const msg = mail.to(email).find((m) => m.text.includes('/review/'))!;
      expect(msg.text).toContain(`/en/review/${b.reviewToken}`);
      expect(msg.subject).toMatch(/How was your visit/);
    });

    it('one review per booking, only after the visit, rating 1 to 5', async () => {
      const s = await shop();
      const { b } = await completedVisit(s);
      const url = `/public/reviews/${b.reviewToken}`;

      const form = await request(server()).get(url).expect(200);
      expect(form.body).toMatchObject({
        businessName: 'Salon P5',
        serviceName: 'Coupe',
        reviewed: false,
      });
      await request(server()).get(`/public/reviews/${crypto.randomUUID()}`).expect(404);
      await request(server()).get('/public/reviews/not-a-token').expect(400);

      expect((await request(server()).post(url).send({ rating: 0 })).status).toBe(400);
      expect((await request(server()).post(url).send({ rating: 6 })).status).toBe(400);
      expect((await request(server()).post(url).send({ rating: 4.5 })).status).toBe(400);
      const ok = await request(server())
        .post(url)
        .send({ rating: 5, comment: 'Super service' })
        .expect(200);
      expect(ok.body.reviewed).toBe(true);
      const twice = await request(server()).post(url).send({ rating: 1 });
      expect(twice.status).toBe(409);
      expect(twice.body.code).toBe('REVIEW_EXISTS');
      expect((await request(server()).get(url)).body.reviewed).toBe(true);
    });

    it('a visit that is not COMPLETED can not be rated', async () => {
      const s = await shop();
      const b = await insertBooking(s, { startsAt: at(5, '10:00'), status: 'CONFIRMED' });
      const res = await request(server())
        .post(`/public/reviews/${b.reviewToken}`)
        .send({ rating: 5 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NOT_COMPLETED');
    });

    it('the public page shows first name and initial, the average, and the owner reply', async () => {
      const s = await shop();
      const one = await completedVisit(s);
      const two = await completedVisit(s, 'Ahmed', 6);
      await request(server())
        .post(`/public/reviews/${one.b.reviewToken}`)
        .send({ rating: 5, comment: 'Parfait' })
        .expect(200);
      await request(server())
        .post(`/public/reviews/${two.b.reviewToken}`)
        .send({ rating: 4 })
        .expect(200);

      const page = (await request(server()).get(`/public/businesses/${s.slug}`).expect(200)).body;
      expect(page.ratingAverage).toBe(4.5);
      expect(page.reviewCount).toBe(2);

      const list = (await request(server()).get(`/public/businesses/${s.slug}/reviews`).expect(200))
        .body;
      expect(list.ratingAverage).toBe(4.5);
      expect(list.total).toBe(2);
      const authors = list.items.map((r: { author: string }) => r.author).sort();
      expect(authors).toEqual(['Ahmed', 'Fatima Z.']);
      expect(JSON.stringify(list)).not.toMatch(/Mint|phone|\+222/);

      const owner = (await s.agent.get('/reviews').expect(200)).body;
      const target = owner.items.find((r: { rating: number }) => r.rating === 5);
      expect(target.customerName).toBe('Fatima Zahra Mint Ali');
      await s.agent.patch(`/reviews/${target.id}/reply`).send({ reply: '' }).expect(400);
      const replied = await s.agent
        .patch(`/reviews/${target.id}/reply`)
        .send({ reply: 'Merci beaucoup !' })
        .expect(200);
      expect(replied.body.repliedAt).not.toBeNull();
      const again = (await request(server()).get(`/public/businesses/${s.slug}/reviews`)).body;
      expect(again.items.find((r: { id: string }) => r.id === target.id).reply).toBe(
        'Merci beaucoup !',
      );
    });

    it("another business can not reply to this business's review (AC-07)", async () => {
      const s = await shop();
      const other = await shop();
      const { b } = await completedVisit(s);
      await request(server())
        .post(`/public/reviews/${b.reviewToken}`)
        .send({ rating: 3 })
        .expect(200);
      const review = await prisma.review.findFirstOrThrow({ where: { bookingId: b.id } });
      await other.agent.patch(`/reviews/${review.id}/reply`).send({ reply: 'Hack' }).expect(404);
      expect(
        (await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).reply,
      ).toBeNull();
      expect((await other.agent.get('/reviews').expect(200)).body.total).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------------
  describe('reports (FR-80 to FR-82)', () => {
    async function reportShop() {
      const s = await shop();
      const b = await s.agent
        .post('/services')
        .send({ name: 'Barbe', durationMin: 30, price: 500 })
        .expect(201);
      // Two days ago: 2 COMPLETED coupes, 1 CONFIRMED barbe. Yesterday: CANCELLED, NO_SHOW, COMPLETED. Today: 1 CONFIRMED.
      await insertBooking(s, { startsAt: at(-2, '10:00'), status: 'COMPLETED' });
      await insertBooking(s, { startsAt: at(-2, '11:00'), status: 'COMPLETED' });
      await insertBooking(s, {
        startsAt: at(-2, '14:00'),
        status: 'CONFIRMED',
        price: 500,
        serviceId: b.body.id,
        customerName: '=HYPERLINK("http://evil.test","click")',
      });
      await insertBooking(s, { startsAt: at(-1, '10:00'), status: 'CANCELLED' });
      await insertBooking(s, { startsAt: at(-1, '10:00'), status: 'NO_SHOW' });
      await insertBooking(s, {
        startsAt: at(-1, '15:00'),
        status: 'COMPLETED',
        customerName: 'Aïcha, "Mint" Sidi',
      });
      await insertBooking(s, { startsAt: new Date(), status: 'CONFIRMED' });
      return s;
    }
    const range = { from: day(-2), to: day(-1) };

    it('summary: counts, estimated revenue, cancellation and no-show rates', async () => {
      const s = await reportShop();
      const r = (await s.agent.get('/reports/summary').query(range).expect(200)).body;
      expect(r.range).toEqual(range);
      expect(r.total).toBe(6);
      expect(r.byStatus).toMatchObject({ COMPLETED: 3, CONFIRMED: 1, CANCELLED: 1, NO_SHOW: 1 });
      expect(r.estimatedRevenue).toBe(1400); // 3 x 300 + 500
      expect(r.cancellationRate).toBeCloseTo(1 / 6);
      expect(r.noShowRate).toBeCloseTo(1 / 6);
      expect(r.today).toBeGreaterThanOrEqual(1);
      expect(r.thisWeek).toBeGreaterThanOrEqual(r.today);
      expect(r.ratingAverage).toBeNull();
    });

    it('bookings per day (cancelled ones are left out, empty days are 0), top services, peak hours', async () => {
      const s = await reportShop();
      const days = (await s.agent.get('/reports/bookings-per-day').query(range).expect(200)).body;
      expect(days).toEqual([
        { date: day(-2), bookings: 3, revenue: 1100 },
        { date: day(-1), bookings: 2, revenue: 300 },
      ]);
      const month = (await s.agent.get('/reports/bookings-per-day').expect(200)).body;
      expect(month).toHaveLength(30);
      expect(month.filter((d: { bookings: number }) => d.bookings === 0).length).toBeGreaterThan(
        20,
      );

      const top = (await s.agent.get('/reports/top-services').query(range).expect(200)).body;
      expect(top).toEqual([
        expect.objectContaining({ name: 'Coupe', bookings: 4, revenue: 900 }),
        expect.objectContaining({ name: 'Barbe', bookings: 1, revenue: 500 }),
      ]);

      const hours = (await s.agent.get('/reports/peak-hours').query(range).expect(200)).body;
      expect(hours).toHaveLength(24);
      expect(hours[10].bookings).toBe(2);
      expect(hours[11].bookings).toBe(1);
      expect(hours[14].bookings).toBe(1);
      expect(hours[15].bookings).toBe(1);
      expect(hours[3].bookings).toBe(0);
    });

    it('CSV export: header, one line per booking, escaped cells, no active formulas', async () => {
      const s = await reportShop();
      const res = await s.agent.get('/reports/bookings.csv').query(range).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/bookings\.csv/);
      const text = res.text.replace(/^\uFEFF/, '');
      const lines = text.trim().split('\r\n');
      expect(lines[0]).toBe('date,time,customer,phone,service,staff,status,source,price');
      expect(lines).toHaveLength(7);
      expect(text).toContain(`"Aïcha, ""Mint"" Sidi"`);
      expect(text).toContain(`"'=HYPERLINK(""http://evil.test"",""click"")"`);
      expect(text).not.toMatch(/(^|,)=HYPERLINK/m);
      expect(lines[1]).toContain(`${day(-2)},10:00,`);
    });

    it('refuses a bad range and anyone who is not the owner of the business', async () => {
      const s = await reportShop();
      await s.agent
        .get('/reports/summary')
        .query({ from: day(-1), to: day(-5) })
        .expect(400);
      await s.agent.get('/reports/summary').query({ from: 'yesterday' }).expect(400);
      const big = await s.agent.get('/reports/summary').query({ from: '2020-01-01', to: day(0) });
      expect(big.status).toBe(400);
      expect(big.body.code).toBe('RANGE_TOO_LARGE');
      await request(server()).get('/reports/summary').expect(401);
    });

    it("a business never sees another business's numbers (AC-07)", async () => {
      await reportShop();
      const other = await shop();
      const r = (await other.agent.get('/reports/summary').query(range).expect(200)).body;
      expect(r.total).toBe(0);
      expect(r.estimatedRevenue).toBe(0);
      expect((await other.agent.get('/reports/top-services').query(range)).body).toEqual([]);
      const csv = (await other.agent.get('/reports/bookings.csv').query(range)).text;
      expect(csv.trim().split('\r\n')).toHaveLength(1);
    });

    it('is fast on a business with many bookings (indexed, NFR-02)', async () => {
      const s = await shop();
      const customer = await prisma.customer.create({
        data: { businessId: s.businessId, name: 'Bulk', phone: '+22250000000' },
      });
      await prisma.booking.createMany({
        data: Array.from({ length: 3000 }, (_, i) => ({
          businessId: s.businessId,
          customerId: customer.id,
          staffId: s.staffId,
          serviceId: s.serviceId,
          startsAt: new Date(at(-90, '00:00').getTime() + i * 40 * 60_000),
          endsAt: new Date(at(-90, '00:30').getTime() + i * 40 * 60_000),
          status: 'COMPLETED' as const,
          price: 300,
        })),
      });
      const q = { from: day(-90), to: day(0) };
      const t0 = Date.now();
      const [sum, perDay, top, peak] = await Promise.all([
        s.agent.get('/reports/summary').query(q),
        s.agent.get('/reports/bookings-per-day').query(q),
        s.agent.get('/reports/top-services').query(q),
        s.agent.get('/reports/peak-hours').query(q),
      ]);
      expect(Date.now() - t0).toBeLessThan(1500);
      expect(sum.body.total).toBe(3000);
      expect(perDay.body).toHaveLength(91);
      expect(top.body[0].bookings).toBe(3000);
      expect(peak.body).toHaveLength(24);
    });
  });
});
