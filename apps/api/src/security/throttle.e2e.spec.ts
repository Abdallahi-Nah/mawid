import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../test-utils';

/** OWASP A04/A07: rate limits on the routes a bot would hammer. The limit counts per IP and per minute. */
describe('rate limits on public and sensitive routes (integration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    delete process.env.THROTTLE_DISABLED;
    ({ app } = await createTestApp());
  });
  afterAll(() => app.close());

  const codes = async (n: number, send: () => request.Test): Promise<number[]> => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((await send()).status);
    return out;
  };

  it('public booking: the 11th request in a minute gets 429', async () => {
    const c = await codes(11, () => request(app.getHttpServer()).post('/public/bookings').send({}));
    expect(c.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(c[10]).toBe(429);
  });

  it('registration and password reset are limited too', async () => {
    const reg = await codes(8, () => request(app.getHttpServer()).post('/auth/register').send({}));
    expect(reg).toContain(429);
    const forgot = await codes(8, () =>
      request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'a@b.co' }),
    );
    expect(forgot).toContain(429);
  });

  it('sending a payment proof and a review are limited', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const pay = await codes(12, () =>
      request(app.getHttpServer()).post(`/public/bookings/${id}/payment`).send({}),
    );
    expect(pay).toContain(429);
    const rev = await codes(12, () =>
      request(app.getHttpServer()).post(`/public/reviews/${id}`).send({ rating: 5 }),
    );
    expect(rev).toContain(429);
  });
});
