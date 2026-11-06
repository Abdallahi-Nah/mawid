process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, uniqueEmail } from '../test-utils';

type Agent = ReturnType<typeof request.agent>;
const day = (n: number): string => DateTime.utc().plus({ days: n }).toISODate() as string;
const iso = (date: string, time: string): string => `${date}T${time}:00.000Z`;

describe('customers (integration, needs the database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  const server = () => app.getHttpServer();

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    await prisma.business.deleteMany({
      where: { id: { in: users.flatMap((u) => (u.businessId ? [u.businessId] : [])) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });
  beforeAll(async () => ({ app, prisma } = await createTestApp()));

  async function shop() {
    const email = uniqueEmail('owner');
    emails.push(email);
    const agent: Agent = request.agent(server());
    const reg = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email, password: 'Password123', terms: true });
    const slug = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await agent.patch('/businesses/me').send({ slug }).expect(200);
    const svc = (
      await agent.post('/services').send({ name: 'Coupe', durationMin: 30, price: 300 }).expect(201)
    ).body;
    const st = (
      await agent
        .post('/staff')
        .send({ displayName: 'Sidi', serviceIds: [svc.id] })
        .expect(201)
    ).body;
    await agent
      .put(`/staff/${st.id}/working-hours`)
      .send(
        [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '09:00', endTime: '18:00' })),
      )
      .expect(200);
    return {
      agent,
      businessId: reg.body.businessId as string,
      slug,
      serviceId: svc.id as string,
      staffId: st.id as string,
    };
  }
  type Shop = Awaited<ReturnType<typeof shop>>;
  const book = (s: Shop, time: string, customer: Record<string, string>, date = day(5)) =>
    request(server())
      .post('/public/bookings')
      .send({
        businessSlug: s.slug,
        serviceId: s.serviceId,
        staffId: s.staffId,
        startsAt: iso(date, time),
        customer,
      });

  it('lists, searches and paginates customers', async () => {
    const s = await shop();
    await book(s, '09:00', {
      name: 'Fatima Mint Ahmed',
      phone: '+22233000001',
      email: 'fatima@example.com',
    }).expect(201);
    await book(s, '10:00', { name: 'Omar Ould Salem', phone: '+22233000002' }).expect(201);
    await book(s, '11:00', { name: 'Omar Ould Salem', phone: '+22233000002' }).expect(201); // same customer
    await book(s, '12:00', { name: 'Zeinab', phone: '+22233000003' }).expect(201);

    const all = await s.agent.get('/customers');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    const omar = all.body.items.find((c: { name: string }) => c.name === 'Omar Ould Salem');
    expect(omar).toMatchObject({ bookingsCount: 2, visitsCount: 0, noShowCount: 0 });
    expect(omar.lastBookingAt).toBe(iso(day(5), '11:00').replace(':00.000Z', ':00.000Z'));

    expect((await s.agent.get('/customers').query({ q: 'fatima' })).body.total).toBe(1); // name, any case
    expect((await s.agent.get('/customers').query({ q: '+22233 000002' })).body.items[0].name).toBe(
      'Omar Ould Salem',
    ); // phone, spaces ignored
    expect((await s.agent.get('/customers').query({ q: 'FATIMA@EXAMPLE' })).body.total).toBe(1); // email
    expect((await s.agent.get('/customers').query({ q: 'nobody' })).body.total).toBe(0);
    const page = await s.agent.get('/customers').query({ page: 2, pageSize: 2 });
    expect([page.body.items.length, page.body.total, page.body.page]).toEqual([1, 3, 2]);
  });

  it('shows the file with history, visits, no-shows, and keeps private notes', async () => {
    const s = await shop();
    const customer = { name: 'Omar Ould Salem', phone: '+22233000010', email: 'omar@example.com' };
    await book(s, '09:00', customer, day(-4)).expect(409); // the past is not bookable online...
    // ...and the owner can no longer put an appointment in the past by hand (rule PAST_NOT_ALLOWED), so the two
    // past visits of this test are written straight into the database.
    const row = await prisma.customer.create({
      data: {
        businessId: s.businessId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
    });
    const past = (date: string) =>
      prisma.booking.create({
        data: {
          businessId: s.businessId,
          customerId: row.id,
          staffId: s.staffId,
          serviceId: s.serviceId,
          startsAt: new Date(iso(date, '09:00')),
          endsAt: new Date(new Date(iso(date, '09:00')).getTime() + 30 * 60_000),
          status: 'CONFIRMED',
          price: 300,
        },
      });
    const manual = (date: string, time: string) =>
      s.agent
        .post('/bookings')
        .send({ serviceId: s.serviceId, staffId: s.staffId, startsAt: iso(date, time), customer })
        .expect(201);
    const done = await past(day(-4));
    const missed = await past(day(-3));
    await manual(day(6), '09:00');
    await s.agent.patch(`/bookings/${done.id}/status`).send({ status: 'COMPLETED' }).expect(200);
    await s.agent.patch(`/bookings/${missed.id}/status`).send({ status: 'NO_SHOW' }).expect(200);

    const id = (await s.agent.get('/customers')).body.items[0].id;
    const detail = await s.agent.get(`/customers/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      name: 'Omar Ould Salem',
      visitsCount: 1,
      noShowCount: 1,
      bookingsCount: 3,
      notes: null,
    });
    expect(detail.body.history.map((h: { status: string }) => h.status)).toEqual([
      'CONFIRMED',
      'NO_SHOW',
      'COMPLETED',
    ]); // newest first
    expect(detail.body.history[0]).toMatchObject({
      serviceName: 'Coupe',
      staffName: 'Sidi',
      price: 300,
    });

    const noted = await s.agent
      .patch(`/customers/${id}`)
      .send({ notes: 'Prefers the morning.', email: 'new@example.com' });
    expect(noted.status).toBe(200);
    expect(noted.body).toMatchObject({ notes: 'Prefers the morning.', email: 'new@example.com' });
    expect((await s.agent.patch(`/customers/${id}`).send({ notes: '' })).body.notes).toBeNull();
    const bad = await s.agent.patch(`/customers/${id}`).send({ email: 'nope', name: 'x' });
    expect(bad.status).toBe(400);
    expect((await s.agent.get('/customers/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('is private: login and the OWNER role are required, and notes never reach the public API', async () => {
    const s = await shop();
    await book(s, '09:00', { name: 'Fatima', phone: '+22233000020' }).expect(201);
    const id = (await s.agent.get('/customers')).body.items[0].id;
    await s.agent.patch(`/customers/${id}`).send({ notes: 'SECRET NOTE' }).expect(200);

    expect((await request(server()).get('/customers')).status).toBe(401);
    const email = uniqueEmail('staff');
    emails.push(email);
    await prisma.user.create({
      data: {
        email,
        name: 'S',
        role: 'STAFF',
        businessId: s.businessId,
        passwordHash: await argon2.hash('Password123'),
      },
    });
    const staff = request.agent(server());
    await staff.post('/auth/login').send({ email, password: 'Password123' }).expect(200);
    expect((await staff.get('/customers')).status).toBe(403);
    expect((await staff.get(`/customers/${id}`)).status).toBe(403);

    const view = await request(server())
      .post('/public/bookings')
      .send({
        businessSlug: s.slug,
        serviceId: s.serviceId,
        staffId: s.staffId,
        startsAt: iso(day(5), '10:00'),
        customer: { name: 'Fatima', phone: '+22233000020' },
      });
    expect(JSON.stringify(view.body)).not.toContain('SECRET NOTE');
    expect(
      JSON.stringify((await request(server()).get(`/public/businesses/${s.slug}`)).body),
    ).not.toContain('SECRET NOTE');
  });
});
