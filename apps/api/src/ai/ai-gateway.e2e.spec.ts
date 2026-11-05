import 'dotenv/config';
import { z } from 'zod';
import { Env, loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AiGateway, AiQuotaError, AiUnavailableError } from './ai-gateway';
import { ScriptedLlm, Step } from './scripted-llm';

// The gateway alone, with a fake model: timeout, retry, JSON validation, quota, kill switch, AiLog.
describe('AiGateway (needs the database)', () => {
  const prisma = new PrismaService();
  let businessId: string;
  const baseEnv = (over: Partial<Env> = {}): Env => ({
    ...loadEnv({ ...process.env, GROQ_API_KEY: 'test-key-not-real', AI_ENABLED: 'true' }),
    ...over,
  });
  const gateway = (steps: Step[], env: Env = baseEnv()) => {
    const llm = new ScriptedLlm(steps);
    return { llm, gw: new AiGateway(env, llm, prisma) };
  };
  const ctx = () => ({ businessId, feature: 'generate' as const });
  const rows = () =>
    prisma.aiLog.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    await prisma.onModuleInit();
    const b = await prisma.business.create({
      data: { name: 'Gateway test', slug: `gw-${Date.now().toString(36)}` },
    });
    businessId = b.id;
  });
  beforeEach(async () => {
    await prisma.aiLog.deleteMany({ where: { businessId } });
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.onModuleDestroy();
  });

  it('kill switch and missing key: unavailable before any call', async () => {
    const off = gateway([{ content: 'x' }], baseEnv({ AI_ENABLED: false }));
    await expect(off.gw.assertUsable(businessId)).rejects.toBeInstanceOf(AiUnavailableError);
    const noKey = gateway([{ content: 'x' }], baseEnv({ GROQ_API_KEY: '' }));
    expect(noKey.gw.available).toBe(false);
    await expect(noKey.gw.assertUsable(businessId)).rejects.toMatchObject({
      response: { code: 'AI_UNAVAILABLE' },
    });
    expect(off.llm.calls).toHaveLength(0);
  });

  it('uses env model names, with the documented defaults when empty', () => {
    const d = gateway([]).gw;
    expect([d.modelName('chat'), d.modelName('fast'), d.modelName('stt')]).toEqual([
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'whisper-large-v3-turbo',
    ]);
    const custom = gateway(
      [],
      baseEnv({ GROQ_MODEL_CHAT: 'my-chat', GROQ_MODEL_FAST: 'my-fast' }),
    ).gw;
    expect([custom.modelName('chat'), custom.modelName('fast')]).toEqual(['my-chat', 'my-fast']);
  });

  it('writes one AiLog per call with tokens, model and latency', async () => {
    const { gw } = gateway([{ content: 'hello' }]);
    await gw.complete(ctx(), { messages: [{ role: 'user', content: 'hi' }], model: 'fast' });
    const [row] = await rows();
    expect(row).toMatchObject({
      feature: 'generate',
      model: 'llama-3.1-8b-instant',
      tokensIn: 100,
      tokensOut: 20,
      error: null,
    });
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('times out after AI_TIMEOUT_MS, retries once, then fails with AI_UNAVAILABLE', async () => {
    const { gw, llm } = gateway(['hang'], baseEnv({ AI_TIMEOUT_MS: 60 }));
    const t0 = Date.now();
    await expect(gw.complete(ctx(), { messages: [] })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(llm.calls).toHaveLength(2);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect((await rows()).every((r) => r.error !== null)).toBe(true);
  });

  it('streaming: retries if nothing was sent, but never repeats words already sent', async () => {
    const a = gateway([new Error('blip'), { content: 'ok bien' }]);
    const out: string[] = [];
    for await (const ev of a.gw.stream(ctx(), { messages: [] }))
      if (ev.type === 'text') out.push(ev.text);
    expect(out.join('')).toBe('ok bien');
    expect(a.llm.calls).toHaveLength(2);
  });

  it('json(): validates with Zod and retries once on a wrong answer', async () => {
    const schema = z.object({ summary: z.string(), count: z.number() });
    const ok = gateway([{ content: 'not json' }, { content: '{"summary":"a","count":2}' }]);
    await expect(ok.gw.json(ctx(), { messages: [] }, schema)).resolves.toEqual({
      summary: 'a',
      count: 2,
    });
    expect(ok.llm.calls).toHaveLength(2);
    expect(ok.llm.calls.every((c) => c.json === true)).toBe(true);

    const bad = gateway([{ content: '{"summary":1}' }]);
    await expect(bad.gw.json(ctx(), { messages: [] }, schema)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(bad.llm.calls).toHaveLength(2);
  });

  it('monthly quota: refuses once the business used its calls, and counts only its own', async () => {
    const env = baseEnv({ AI_MONTHLY_QUOTA: 2 });
    const { gw } = gateway([{ content: 'x' }], env);
    await gw.assertUsable(businessId);
    await gw.complete(ctx(), { messages: [] });
    await gw.assertUsable(businessId); // 1 of 2
    await gw.complete(ctx(), { messages: [] });
    await expect(gw.assertUsable(businessId)).rejects.toBeInstanceOf(AiQuotaError);
    await expect(gw.assertUsable(businessId)).rejects.toMatchObject({
      status: 429,
      response: { code: 'AI_QUOTA_EXCEEDED' },
    });
    // PRO plan has 10x the quota.
    await prisma.business.update({ where: { id: businessId }, data: { plan: 'PRO' } });
    await expect(gw.assertUsable(businessId)).resolves.toBeUndefined();
  });
});
