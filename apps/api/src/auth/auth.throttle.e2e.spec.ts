import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../test-utils';

describe('rate limit (integration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    delete process.env.THROTTLE_DISABLED;
    ({ app } = await createTestApp());
  });
  afterAll(() => app.close());

  it('blocks the 6th login attempt in a minute with 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'x@test.mawid', password: 'wrong-pass' });
      codes.push(res.status);
    }
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});
