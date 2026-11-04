process.env.THROTTLE_DISABLED = 'true';
process.env.UPLOAD_DIR = '/tmp/mawid-test-uploads';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from './prisma/prisma.service';
import { createTestApp, uniqueEmail } from './test-utils';

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
type Agent = ReturnType<typeof request.agent>;
const PASSWORD = 'Password123';

describe('modules (integration, needs the database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  const server = () => app.getHttpServer();
  const owner = async (): Promise<{ agent: Agent; businessId: string; email: string }> => {
    const email = uniqueEmail('owner');
    emails.push(email);
    const agent = request.agent(server());
    const res = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email, password: PASSWORD, terms: true });
    return { agent, businessId: res.body.businessId, email };
  };
  const userWithRole = async (
    role: 'STAFF' | 'CLIENT',
    businessId: string | null,
  ): Promise<Agent> => {
    const email = uniqueEmail(role.toLowerCase());
    emails.push(email);
    await prisma.user.create({
      data: { email, name: role, role, businessId, passwordHash: await argon2.hash(PASSWORD) },
    });
    const agent = request.agent(server());
    await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  };

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    await prisma.business.deleteMany({
      where: { id: { in: users.flatMap((u) => (u.businessId ? [u.businessId] : [])) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  describe('owner flow', () => {
    it('manages the business profile and refuses a taken slug', async () => {
      const a = await owner();
      const b = await owner();
      const slug = `salon-${Date.now().toString(36)}`;
      const ok = await a.agent
        .patch('/businesses/me')
        .send({
          name: 'Salon Test',
          slug,
          phone: '+222 22 00 11 22',
          category: 'salon',
          brandColor: '#0f766e',
          defaultLocale: 'fr',
        });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ name: 'Salon Test', slug, category: 'salon' });
      const taken = await b.agent.patch('/businesses/me').send({ slug });
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe('SLUG_TAKEN');
      const bad = await a.agent
        .patch('/businesses/me')
        .send({ slug: 'Bad Slug!', phone: '12', brandColor: 'red' });
      expect(bad.status).toBe(400);
      expect(bad.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'brandColor',
        'phone',
        'slug',
      ]);
    });

    it('does CRUD on services, staff, hours and time off, and serves the public page', async () => {
      const { agent } = await owner();
      const slug = `public-${Date.now().toString(36)}`;
      await agent.patch('/businesses/me').send({ slug, name: 'Public Test' }).expect(200);

      const svc = await agent
        .post('/services')
        .send({ name: 'Coupe', durationMin: 45, price: 300, category: 'Cheveux' });
      expect(svc.status).toBe(201);
      expect(svc.body.price).toBe(300);
      const hidden = await agent
        .post('/services')
        .send({ name: 'Cache', durationMin: 30, price: 100, active: false });
      expect((await agent.get('/services')).body).toMatchObject({
        total: 2,
        page: 1,
        pageSize: 20,
      });
      expect(
        (await agent.post('/services').send({ name: 'x', durationMin: 1, price: -5 })).status,
      ).toBe(400);
      expect((await agent.patch(`/services/${svc.body.id}`).send({ price: 350 })).body.price).toBe(
        350,
      );

      const staff = await agent
        .post('/staff')
        .send({ displayName: 'Sidi Mohamed', serviceIds: [svc.body.id, hidden.body.id] });
      expect(staff.status).toBe(201);
      expect(staff.body.serviceIds).toHaveLength(2);
      const inactive = await agent.post('/staff').send({ displayName: 'Inactive', active: false });
      expect(inactive.status).toBe(201);
      const photo = await agent.post(`/staff/${staff.body.id}/photo`).attach('file', PNG, 'p.png');
      expect(photo.status).toBe(201);
      expect(photo.body.photoUrl).toMatch(/\/uploads\/.+\.png$/);
      expect(
        (
          await agent
            .post(`/staff/${staff.body.id}/photo`)
            .attach('file', Buffer.from('not an image'), 'p.png')
        ).status,
      ).toBe(400);

      const hours = [
        {
          weekday: 1,
          startTime: '09:00',
          endTime: '18:00',
          breakStart: '13:00',
          breakEnd: '14:00',
        },
        { weekday: 2, startTime: '09:00', endTime: '12:00' },
        { weekday: 2, startTime: '14:00', endTime: '18:00' },
      ];
      expect(
        (await agent.put(`/staff/${staff.body.id}/working-hours`).send(hours)).body,
      ).toHaveLength(3);
      const badHours = await agent.put(`/staff/${staff.body.id}/working-hours`).send([
        { weekday: 1, startTime: '18:00', endTime: '09:00' },
        {
          weekday: 3,
          startTime: '09:00',
          endTime: '12:00',
          breakStart: '13:00',
          breakEnd: '14:00',
        },
      ]);
      expect(badHours.status).toBe(400);
      const overlap = await agent.put(`/staff/${staff.body.id}/working-hours`).send([
        { weekday: 2, startTime: '09:00', endTime: '13:00' },
        { weekday: 2, startTime: '12:00', endTime: '18:00' },
      ]);
      expect(overlap.status).toBe(400);
      expect((await agent.get(`/staff/${staff.body.id}/working-hours`)).body).toHaveLength(3); // unchanged after failures

      const off = await agent
        .post('/time-off')
        .send({
          staffId: null,
          startsAt: '2026-12-25T00:00:00Z',
          endsAt: '2026-12-26T00:00:00Z',
          reason: 'Holiday',
        });
      expect(off.status).toBe(201);
      expect(
        (
          await agent
            .post('/time-off')
            .send({ startsAt: '2026-12-26T00:00:00Z', endsAt: '2026-12-25T00:00:00Z' })
        ).status,
      ).toBe(400);
      expect(
        (await agent.get('/time-off?from=2026-12-01T00:00:00Z&to=2026-12-31T00:00:00Z')).body.total,
      ).toBe(1);
      expect((await agent.get('/time-off?from=2027-01-01T00:00:00Z')).body.total).toBe(0);
      expect(
        (await agent.patch(`/time-off/${off.body.id}`).send({ reason: 'Eid' })).body.reason,
      ).toBe('Eid');

      // Public page: active items only, no private data.
      const pub = await request(server()).get(`/public/businesses/${slug}`);
      expect(pub.status).toBe(200);
      expect(pub.body.services.map((s: { name: string }) => s.name)).toEqual(['Coupe']);
      expect(pub.body.staff.map((s: { displayName: string }) => s.displayName)).toEqual([
        'Sidi Mohamed',
      ]);
      expect(pub.body.staff[0].serviceIds).toEqual([svc.body.id]);
      expect(pub.body.staff[0].workingHours).toHaveLength(3);
      expect(JSON.stringify(pub.body)).not.toMatch(
        /businessId|business_id|userId|cancelLimit|passwordHash|email/,
      );
      expect((await request(server()).get('/public/businesses/does-not-exist')).status).toBe(404);

      expect((await agent.delete(`/time-off/${off.body.id}`)).status).toBe(204);
      expect((await agent.delete(`/staff/${staff.body.id}`)).status).toBe(204);
      expect((await agent.delete(`/services/${svc.body.id}`)).status).toBe(204);
    });

    it('refuses to delete a service that has bookings', async () => {
      const { agent, businessId } = await owner();
      const svc = (
        await agent.post('/services').send({ name: 'Used', durationMin: 30, price: 100 })
      ).body;
      const st = (await agent.post('/staff').send({ displayName: 'Staff One' })).body;
      const customer = await prisma.customer.create({
        data: { businessId, name: 'C', phone: '+22200000000' },
      });
      await prisma.booking.create({
        data: {
          businessId,
          customerId: customer.id,
          staffId: st.id,
          serviceId: svc.id,
          startsAt: new Date('2027-01-01T10:00:00Z'),
          endsAt: new Date('2027-01-01T10:30:00Z'),
          price: 100,
        },
      });
      const res = await agent.delete(`/services/${svc.id}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IN_USE');
      expect((await agent.delete(`/staff/${st.id}`)).status).toBe(409);
    });
  });

  describe('RBAC', () => {
    it('requires a login, and the right role', async () => {
      const a = await owner();
      const staff = await userWithRole('STAFF', a.businessId);
      const client = await userWithRole('CLIENT', null);

      expect((await request(server()).get('/services')).status).toBe(401);
      expect((await client.get('/services')).status).toBe(403);
      expect((await client.get('/businesses/me')).status).toBe(403);
      // An employee can read but not change anything.
      expect((await staff.get('/services')).status).toBe(200);
      expect((await staff.get('/staff')).status).toBe(200);
      expect(
        (await staff.post('/services').send({ name: 'Nope', durationMin: 30, price: 1 })).status,
      ).toBe(403);
      expect((await staff.patch('/businesses/me').send({ name: 'Hacked' })).status).toBe(403);
      expect((await staff.post('/staff').send({ displayName: 'Nope' })).status).toBe(403);
      expect(
        (
          await staff
            .post('/time-off')
            .send({ startsAt: '2026-12-25T00:00:00Z', endsAt: '2026-12-26T00:00:00Z' })
        ).status,
      ).toBe(403);
    });
  });

  // AC-07: a business cannot read, update or delete anything of another business, on every route.
  describe('tenant isolation (AC-07)', () => {
    it('business B gets 404 on every route that takes an id of business A, and A is untouched', async () => {
      const a = await owner();
      const b = await owner();
      const svc = (
        await a.agent.post('/services').send({ name: 'A service', durationMin: 30, price: 100 })
      ).body;
      const st = (
        await a.agent.post('/staff').send({ displayName: 'A staff', serviceIds: [svc.id] })
      ).body;
      await a.agent
        .put(`/staff/${st.id}/working-hours`)
        .send([{ weekday: 1, startTime: '09:00', endTime: '17:00' }])
        .expect(200);
      const off = (
        await a.agent
          .post('/time-off')
          .send({
            staffId: st.id,
            startsAt: '2026-12-25T00:00:00Z',
            endsAt: '2026-12-26T00:00:00Z',
          })
      ).body;

      const calls: [string, string, (r: request.Test) => request.Test][] = [
        ['GET', `/services/${svc.id}`, (r) => r],
        ['PATCH', `/services/${svc.id}`, (r) => r.send({ name: 'hacked' })],
        ['DELETE', `/services/${svc.id}`, (r) => r],
        ['GET', `/staff/${st.id}`, (r) => r],
        ['PATCH', `/staff/${st.id}`, (r) => r.send({ displayName: 'hacked' })],
        ['DELETE', `/staff/${st.id}`, (r) => r],
        ['POST', `/staff/${st.id}/photo`, (r) => r.attach('file', PNG, 'p.png')],
        ['GET', `/staff/${st.id}/working-hours`, (r) => r],
        [
          'PUT',
          `/staff/${st.id}/working-hours`,
          (r) => r.send([{ weekday: 1, startTime: '00:00', endTime: '23:00' }]),
        ],
        ['PATCH', `/time-off/${off.id}`, (r) => r.send({ reason: 'hacked' })],
        ['DELETE', `/time-off/${off.id}`, (r) => r],
      ];
      for (const [method, path, build] of calls) {
        const res = await build(
          (b.agent as unknown as Record<string, (p: string) => request.Test>)[method.toLowerCase()](
            path,
          ),
        );
        expect([method, path, res.status]).toEqual([method, path, 404]);
      }

      // Ids of A used inside B's own writes.
      expect(
        (await b.agent.post('/staff').send({ displayName: 'B staff', serviceIds: [svc.id] }))
          .status,
      ).toBe(400);
      expect(
        (
          await b.agent
            .post('/time-off')
            .send({
              staffId: st.id,
              startsAt: '2026-12-25T00:00:00Z',
              endsAt: '2026-12-26T00:00:00Z',
            })
        ).status,
      ).toBe(400);
      const own = (await b.agent.post('/staff').send({ displayName: 'B staff' })).body;
      expect((await b.agent.patch(`/staff/${own.id}`).send({ serviceIds: [svc.id] })).status).toBe(
        400,
      );

      // Lists never contain A's rows.
      expect((await b.agent.get('/services')).body.total).toBe(0);
      expect((await b.agent.get('/staff')).body.items.map((s: { id: string }) => s.id)).toEqual([
        own.id,
      ]);
      expect((await b.agent.get('/time-off')).body.total).toBe(0);
      // The business profile is always the caller's own.
      expect((await b.agent.get('/businesses/me')).body.id).toBe(b.businessId);

      // A's data is intact.
      expect((await a.agent.get(`/services/${svc.id}`)).body.name).toBe('A service');
      expect((await a.agent.get(`/staff/${st.id}`)).body).toMatchObject({
        displayName: 'A staff',
        serviceIds: [svc.id],
      });
      expect((await a.agent.get(`/staff/${st.id}/working-hours`)).body).toHaveLength(1);
      expect((await a.agent.get('/time-off')).body.items[0].reason).toBeNull();
    });

    it('every route with an :id is covered by the isolation test above', () => {
      const stack = (
        app.getHttpAdapter().getInstance() as {
          _router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
        }
      )._router.stack;
      const routes = stack
        .filter((l) => l.route?.path.includes(':id'))
        .flatMap((l) =>
          Object.keys(l.route!.methods).map((m) => `${m.toUpperCase()} ${l.route!.path}`),
        )
        .sort();
      expect(routes).toEqual(
        [
          'GET /services/:id',
          'PATCH /services/:id',
          'DELETE /services/:id',
          'GET /staff/:id',
          'PATCH /staff/:id',
          'DELETE /staff/:id',
          'POST /staff/:id/photo',
          'GET /staff/:id/working-hours',
          'PUT /staff/:id/working-hours',
          'PATCH /time-off/:id',
          'DELETE /time-off/:id',
        ].sort(),
      );
    });
  });
});
