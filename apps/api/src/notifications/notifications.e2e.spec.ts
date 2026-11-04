process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, MemoryMail, uniqueEmail } from '../test-utils';
import { JobQueue } from './job-queue';
import { NotificationProcessor } from './notification-processor';

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

describe('notifications (integration, needs the database and Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MemoryMail;
  let queue: JobQueue;
  let processor: NotificationProcessor;
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
  async function shop(business: Record<string, unknown> = {}): Promise<Shop> {
    const ownerEmail = uniqueEmail('owner');
    emails.push(ownerEmail);
    const agent = request.agent(server());
    const reg = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email: ownerEmail, password: PASSWORD, terms: true, locale: 'fr' });
    const slug = `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await agent
      .patch('/businesses/me')
      .send({ slug, name: 'Salon Test', address: 'Tevragh Zeina', ...business })
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
      ownerEmail,
      businessId: reg.body.businessId,
      slug,
      serviceId: svc.body.id,
      staffId: st.body.id,
    };
  }
  const book = (s: Shop, startsAt: string, over: Record<string, unknown> = {}) =>
    request(server())
      .post('/public/bookings')
      .send({
        businessSlug: s.slug,
        serviceId: s.serviceId,
        staffId: s.staffId,
        startsAt,
        customer: {
          name: 'Fatima',
          phone: `+2223${Math.floor(1000000 + Math.random() * 8999999)}`,
          email: uniqueEmail('cust'),
        },
        locale: 'fr',
        ...over,
      });
  const rows = (s: Shop, where: Record<string, unknown> = {}) =>
    prisma.notification.findMany({
      where: { businessId: s.businessId, ...where },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    ({ app, prisma, mail } = await createTestApp());
    queue = app.get(JobQueue);
    processor = app.get(NotificationProcessor);
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    await prisma.business.deleteMany({
      where: { id: { in: users.flatMap((u) => (u.businessId ? [u.businessId] : [])) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('sends the confirmation (with .ics) to the customer and the new-booking alert to the owner (FR-33, FR-50, FR-52)', async () => {
    const s = await shop();
    const customerEmail = uniqueEmail('cust');
    const res = await book(s, iso(day(5), '10:00'), {
      customer: { name: 'Fatima', phone: '+22233111222', email: customerEmail },
    }).expect(201);

    await waitFor(() => mail.to(customerEmail).length === 1 && mail.to(s.ownerEmail).length === 1);
    const toCustomer = mail.to(customerEmail)[0];
    expect(toCustomer.subject).toMatch(/Réservation confirmée/);
    expect(toCustomer.text).toContain(`/fr/booking/${res.body.cancelToken}`);
    expect(toCustomer.text).toContain(`/public/bookings/${res.body.cancelToken}/calendar.ics`);
    expect(toCustomer.attachments?.[0]).toMatchObject({
      filename: 'booking.ics',
      contentType: 'text/calendar',
    });
    expect(toCustomer.attachments?.[0].content).toContain('BEGIN:VEVENT');
    expect(mail.to(s.ownerEmail)[0].subject).toMatch(/Nouvelle réservation/);

    await waitFor(async () => (await rows(s, { channel: 'EMAIL', status: 'SENT' })).length === 2);
    const inApp = await rows(s, { channel: 'IN_APP' });
    expect(inApp).toHaveLength(1);
    expect(inApp[0]).toMatchObject({ type: 'owner_new_booking', readAt: null });
  });

  it('writes the email in the language of the customer, RTL for Arabic', async () => {
    const s = await shop();
    const customerEmail = uniqueEmail('cust');
    await book(s, iso(day(5), '10:00'), {
      locale: 'ar',
      customer: { name: 'فاطمة', phone: '+22233111333', email: customerEmail },
    }).expect(201);
    await waitFor(() => mail.to(customerEmail).length === 1);
    const m = mail.to(customerEmail)[0];
    expect(m.subject).toMatch(/تم تأكيد الحجز/);
    expect(m.html).toContain('dir="rtl"');
  });

  it('manual confirmation: a "request received" email first, the confirmation when the owner accepts', async () => {
    const s = await shop({ bookingMode: 'MANUAL' });
    const customerEmail = uniqueEmail('cust');
    const res = await book(s, iso(day(5), '10:00'), {
      customer: { name: 'Fatima', phone: '+22233111444', email: customerEmail },
    }).expect(201);
    expect(res.body.status).toBe('PENDING');
    await waitFor(() => mail.to(customerEmail).length === 1);
    expect(mail.to(customerEmail)[0].subject).toMatch(/Demande de réservation reçue/);
    expect(await rows(s, { type: 'reminder' })).toHaveLength(0); // not confirmed yet

    const id = (await prisma.booking.findFirstOrThrow({ where: { businessId: s.businessId } })).id;
    await s.agent.patch(`/bookings/${id}/status`).send({ status: 'CONFIRMED' }).expect(200);
    await waitFor(() => mail.to(customerEmail).length === 2);
    expect(mail.to(customerEmail)[1].subject).toMatch(/Réservation confirmée/);
    expect(await rows(s, { type: 'reminder', status: 'PENDING' })).toHaveLength(1);
  });

  it('sends nothing to a customer without email, but still alerts the owner', async () => {
    const s = await shop();
    await book(s, iso(day(5), '10:00'), {
      customer: { name: 'Omar', phone: '+22233111555' },
    }).expect(201);
    await waitFor(() => mail.to(s.ownerEmail).length === 1);
    expect(await rows(s, { channel: 'EMAIL', type: 'confirmation' })).toHaveLength(0);
  });

  it('a booking made by the owner does not alert the owner', async () => {
    const s = await shop();
    const customerEmail = uniqueEmail('cust');
    await s.agent
      .post('/bookings')
      .send({
        serviceId: s.serviceId,
        staffId: s.staffId,
        startsAt: iso(day(5), '10:00'),
        customer: { name: 'Omar', phone: '+22233111666', email: customerEmail },
      })
      .expect(201);
    await waitFor(() => mail.to(customerEmail).length === 1);
    expect(mail.to(s.ownerEmail)).toHaveLength(0);
    expect(await rows(s, { channel: 'IN_APP' })).toHaveLength(0);
  });

  describe('reminder 24 h before (FR-50)', () => {
    it('is a delayed job at start - 24 h, replaced when the booking moves, removed when it is cancelled', async () => {
      const s = await shop();
      const date = day(5);
      const res = await book(s, iso(date, '10:00')).expect(201);
      const reminder = async () => (await rows(s, { type: 'reminder' }))[0];

      const first = await reminder();
      expect(first.status).toBe('PENDING');
      const delay = await queue.delayOf(`reminder-${first.id}`);
      const expected = new Date(iso(date, '10:00')).getTime() - 24 * 3_600_000 - Date.now();
      expect(Math.abs((delay as number) - expected)).toBeLessThan(5000);

      await request(server())
        .post(`/public/bookings/${res.body.cancelToken}/reschedule`)
        .send({ startsAt: iso(date, '15:00') })
        .expect(200);
      expect(await queue.delayOf(`reminder-${first.id}`)).toBeNull(); // old one is gone
      const second = await reminder();
      expect(second.id).not.toBe(first.id);
      const delay2 = await queue.delayOf(`reminder-${second.id}`);
      expect((delay2 as number) - (delay as number)).toBeGreaterThan(5 * 3_600_000 - 5000); // 5 h later

      await request(server()).post(`/public/bookings/${res.body.cancelToken}/cancel`).expect(200);
      expect(await queue.delayOf(`reminder-${second.id}`)).toBeNull();
      expect(await rows(s, { type: 'reminder' })).toHaveLength(0);
    });

    it('is not scheduled when the appointment is less than 24 h away', async () => {
      const s = await shop();
      const soon = new Date(Date.now() + 3 * 3_600_000);
      soon.setUTCMinutes(0, 0, 0);
      await s.agent
        .post('/bookings')
        .send({
          serviceId: s.serviceId,
          staffId: s.staffId,
          startsAt: soon.toISOString(),
          customer: { name: 'Omar', phone: '+22233111777', email: uniqueEmail('c') },
        })
        .expect(201);
      await new Promise((r) => setTimeout(r, 300));
      expect(await rows(s, { type: 'reminder' })).toHaveLength(0);
    });

    it('sends the reminder email when its time comes, and skips it if the booking was cancelled', async () => {
      const s = await shop();
      const customerEmail = uniqueEmail('cust');
      const res = await book(s, iso(day(5), '10:00'), {
        customer: { name: 'Fatima', phone: '+22233111888', email: customerEmail },
      }).expect(201);
      await waitFor(() => mail.to(customerEmail).length === 1);
      const bookingId = (
        await prisma.booking.findFirstOrThrow({ where: { businessId: s.businessId } })
      ).id;
      const row = (await rows(s, { type: 'reminder' }))[0];

      await processor.handle({
        kind: 'customer',
        type: 'reminder',
        bookingId,
        notificationId: row.id,
      });
      expect(mail.to(customerEmail)[1].subject).toMatch(/Rappel/);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
        'SENT',
      );

      // A reminder that survives a cancellation (for example it was already running) sends nothing.
      await request(server()).post(`/public/bookings/${res.body.cancelToken}/cancel`).expect(200);
      await waitFor(() => mail.to(customerEmail).length === 3); // the cancellation email
      const late = await prisma.notification.create({
        data: {
          businessId: s.businessId,
          bookingId,
          channel: 'EMAIL',
          type: 'reminder',
          status: 'PENDING',
        },
      });
      await processor.handle({
        kind: 'customer',
        type: 'reminder',
        bookingId,
        notificationId: late.id,
      });
      expect(mail.to(customerEmail)).toHaveLength(3);
      expect(await prisma.notification.findUnique({ where: { id: late.id } })).toBeNull();
    });
  });

  it('cancellation by the customer: email to the customer, alert and email to the owner', async () => {
    const s = await shop();
    const customerEmail = uniqueEmail('cust');
    const res = await book(s, iso(day(5), '10:00'), {
      customer: { name: 'Fatima', phone: '+22233111999', email: customerEmail },
    }).expect(201);
    await waitFor(() => mail.to(customerEmail).length === 1 && mail.to(s.ownerEmail).length === 1);
    await request(server()).post(`/public/bookings/${res.body.cancelToken}/cancel`).expect(200);
    await waitFor(() => mail.to(customerEmail).length === 2 && mail.to(s.ownerEmail).length === 2);
    expect(mail.to(customerEmail)[1].subject).toMatch(/Réservation annulée/);
    expect(mail.to(s.ownerEmail)[1].subject).toMatch(/annulée par Fatima/);
    expect((await rows(s, { channel: 'IN_APP' })).map((n) => n.type)).toEqual([
      'owner_new_booking',
      'owner_cancelled',
    ]);
  });

  it('cancellation by the owner: email to the customer only', async () => {
    const s = await shop();
    const customerEmail = uniqueEmail('cust');
    const res = await book(s, iso(day(5), '10:00'), {
      customer: { name: 'Fatima', phone: '+22233222111', email: customerEmail },
    }).expect(201);
    await waitFor(() => mail.to(customerEmail).length === 1 && mail.to(s.ownerEmail).length === 1);
    await s.agent
      .patch(`/bookings/${res.body.id}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);
    await waitFor(() => mail.to(customerEmail).length === 2);
    expect(mail.to(customerEmail)[1].subject).toMatch(/Réservation annulée/);
    await new Promise((r) => setTimeout(r, 300));
    expect(mail.to(s.ownerEmail)).toHaveLength(1);
  });

  it('change: the customer is told, the owner too when the customer moved it', async () => {
    const s = await shop();
    const customerEmail = uniqueEmail('cust');
    const res = await book(s, iso(day(5), '10:00'), {
      customer: { name: 'Fatima', phone: '+22233222222', email: customerEmail },
    }).expect(201);
    await waitFor(() => mail.to(customerEmail).length === 1);
    await request(server())
      .post(`/public/bookings/${res.body.cancelToken}/reschedule`)
      .send({ startsAt: iso(day(5), '11:00') })
      .expect(200);
    await waitFor(() => mail.to(customerEmail).length === 2 && mail.to(s.ownerEmail).length === 2);
    expect(mail.to(customerEmail)[1].subject).toMatch(/Réservation modifiée/);
    expect(mail.to(customerEmail)[1].attachments?.[0].content).toContain(
      'DTSTART:' + day(5).replace(/-/g, '') + 'T110000Z',
    );
    expect(mail.to(s.ownerEmail)[1].subject).toMatch(/déplacée par Fatima/);

    await s.agent
      .patch(`/bookings/${res.body.id}`)
      .send({ startsAt: iso(day(5), '14:00') })
      .expect(200);
    await waitFor(() => mail.to(customerEmail).length === 3);
    await new Promise((r) => setTimeout(r, 300));
    expect(mail.to(s.ownerEmail)).toHaveLength(2); // the owner moved it himself: no alert
  });

  describe('retries (NFR-10)', () => {
    it('retries a failing send and succeeds on the 3rd attempt', async () => {
      const s = await shop();
      const customerEmail = uniqueEmail('cust');
      mail.failures = 2; // the next two sends fail
      const before = mail.attempts;
      await book(s, iso(day(5), '10:00'), {
        customer: { name: 'Fatima', phone: '+22233333111', email: customerEmail },
      }).expect(201);
      await waitFor(
        () => mail.to(customerEmail).length === 1 && mail.to(s.ownerEmail).length === 1,
        15000,
      );
      expect(mail.attempts - before).toBeGreaterThanOrEqual(4); // 2 failures + 2 successes
      await waitFor(async () => (await rows(s, { channel: 'EMAIL', status: 'SENT' })).length === 2);
    });

    it('gives up after 3 attempts and marks the notification FAILED', async () => {
      const s = await shop();
      mail.failures = 100;
      const before = mail.attempts;
      await book(s, iso(day(5), '10:00'), {
        customer: { name: 'Fatima', phone: '+22233333222' },
      }).expect(201); // no customer email: only the owner job
      await waitFor(
        async () => (await rows(s, { channel: 'EMAIL', status: 'FAILED' })).length === 1,
        15000,
      );
      expect(mail.attempts - before).toBe(3);
      mail.failures = 0;
    });

    it('a broken queue never breaks the booking', async () => {
      const s = await shop();
      const spy = jest.spyOn(queue, 'add').mockRejectedValue(new Error('redis down'));
      const res = await book(s, iso(day(5), '10:00'));
      spy.mockRestore();
      expect(res.status).toBe(201);
      expect(await prisma.booking.count({ where: { businessId: s.businessId } })).toBe(1);
    });
  });

  describe('bell (in-app notifications, FR-52)', () => {
    it('lists alerts with the unread count, marks them read, and is limited to the business', async () => {
      const a = await shop();
      const b = await shop();
      await book(a, iso(day(5), '10:00')).expect(201);
      await book(a, iso(day(5), '11:00')).expect(201);
      await book(b, iso(day(5), '10:00')).expect(201);
      await waitFor(async () => (await rows(a, { channel: 'IN_APP' })).length === 2);

      const list = await a.agent.get('/notifications');
      expect(list.status).toBe(200);
      expect(list.body).toMatchObject({ total: 2, unreadCount: 2 });
      expect(list.body.items[0]).toMatchObject({
        type: 'owner_new_booking',
        readAt: null,
        booking: { customerName: 'Fatima', serviceName: 'Coupe' },
      });

      const first = list.body.items[0].id;
      expect((await b.agent.patch(`/notifications/${first}/read`)).status).toBe(404); // AC-07
      expect((await a.agent.patch(`/notifications/${first}/read`)).status).toBe(204);
      expect((await a.agent.get('/notifications')).body.unreadCount).toBe(1);
      expect((await a.agent.post('/notifications/read-all')).status).toBe(204);
      expect((await a.agent.get('/notifications')).body.unreadCount).toBe(0);
      expect((await b.agent.get('/notifications')).body.total).toBe(1);
    });

    it('needs a login, and the OWNER or STAFF role', async () => {
      expect((await request(server()).get('/notifications')).status).toBe(401);
      const email = uniqueEmail('client');
      emails.push(email);
      await prisma.user.create({
        data: { email, name: 'C', role: 'CLIENT', passwordHash: await argon2.hash(PASSWORD) },
      });
      const client = request.agent(server());
      await client.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      expect((await client.get('/notifications')).status).toBe(403);
    });
  });

  it('serves the .ics file of a booking (FR-42)', async () => {
    const s = await shop();
    const res = await book(s, iso(day(5), '10:00')).expect(201);
    const ics = await request(server()).get(
      `/public/bookings/${res.body.cancelToken}/calendar.ics`,
    );
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toMatch(/text\/calendar/);
    expect(ics.headers['content-disposition']).toMatch(/attachment/);
    expect(ics.text).toContain('SUMMARY:Coupe - Salon Test');
    expect(ics.text).toContain('LOCATION:Tevragh Zeina');
    expect(res.body.icsUrl).toContain(`/public/bookings/${res.body.cancelToken}/calendar.ics`);
    expect(res.body.googleCalendarUrl).toMatch(/^https:\/\/calendar\.google\.com\//);
  });
});
