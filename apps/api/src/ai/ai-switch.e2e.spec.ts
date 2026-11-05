process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp } from '../test-utils';
import { ScriptedLlm } from './scripted-llm';

// Kill switch (AI_ENABLED=false): the AI answers 503 AI_UNAVAILABLE and the model is never called (AC-06).
describe('AI kill switch', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let slug: string;
  let businessId: string;
  const llm = new ScriptedLlm([{ content: 'should never be called' }]);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ llm, env: { AI_ENABLED: 'false' } }));
    slug = `off-${Date.now().toString(36)}`;
    businessId = (await prisma.business.create({ data: { name: 'Off', slug } })).id;
  });
  afterAll(async () => {
    process.env.AI_ENABLED = 'true';
    await prisma.business.delete({ where: { id: businessId } });
    await app.close();
  });

  it('chat: a clear 503 before any stream starts, without calling the model', async () => {
    const res = await request(app.getHttpServer())
      .post('/public/ai/chat')
      .send({ businessSlug: slug, messages: [{ role: 'user', content: 'Bonjour' }] });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
    expect(llm.calls).toHaveLength(0);
  });

  it('the normal booking routes do not depend on the AI', async () => {
    const res = await request(app.getHttpServer()).get(`/public/businesses/${slug}`);
    expect(res.status).toBe(200);
  });
});
