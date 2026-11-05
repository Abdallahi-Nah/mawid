import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../test-utils';
import { ScriptedLlm } from './scripted-llm';

// 20 AI requests per minute and per IP on the public AI routes (SRS 4.4, NFR-08).
describe('AI rate limit (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let businessId: string;
  let slug: string;
  const llm = new ScriptedLlm([{ content: 'ok' }]);

  beforeAll(async () => {
    delete process.env.THROTTLE_DISABLED;
    ({ app, prisma } = await createTestApp({ llm }));
    slug = `thr-${Date.now().toString(36)}`;
    businessId = (await prisma.business.create({ data: { name: 'Throttle', slug } })).id;
  });
  afterAll(async () => {
    process.env.THROTTLE_DISABLED = 'true';
    await prisma.business.delete({ where: { id: businessId } });
    await app.close();
  });

  it('answers the 21st chat request of a minute with 429, and the model is not called for it', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await request(app.getHttpServer())
        .post('/public/ai/chat')
        .send({ businessSlug: slug, messages: [{ role: 'user', content: 'Bonjour' }] });
      codes.push(res.status);
    }
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes[20]).toBe(429);
    expect(llm.calls).toHaveLength(20);
  });
});
