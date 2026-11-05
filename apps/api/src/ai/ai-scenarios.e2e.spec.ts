process.env.THROTTLE_DISABLED = 'true';
import { INestApplication } from '@nestjs/common';
import type { AiStreamEvent } from '@mawid/shared';
import { DateTime } from 'luxon';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { createTestApp, uniqueEmail } from '../test-utils';
import { ScriptedLlm, toolCall } from './scripted-llm';

const day = (n: number): string => DateTime.utc().plus({ days: n }).toISODate() as string;

/**
 * AC-05 in the three languages: "I want a haircut tomorrow after 5 pm". The model is scripted (no Groq key in
 * tests), so this proves what the SERVER guarantees whatever the language: real free slots only, and no booking
 * is created without the customer's click. The behaviour of the real model is checked with ai-live.spec.ts.
 */
const SCENARIOS = [
  {
    lang: 'ar',
    ask: 'أريد قصة شعر غدًا بعد الساعة 5 مساءً',
    answer: 'هذه مواعيد متاحة غدًا بعد الخامسة:',
  },
  {
    lang: 'fr',
    ask: 'Je veux une coupe de cheveux demain après 17 h',
    answer: 'Voici des créneaux libres demain après 17 h :',
  },
  {
    lang: 'en',
    ask: 'I want a haircut tomorrow after 5 pm',
    answer: 'Here are free slots tomorrow after 5 pm:',
  },
] as const;

describe('AC-05: the assistant offers real slots in ar, fr and en and books nothing alone', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  let serviceId = '';
  let businessId = '';
  let slug = '';
  let answer = '';
  const llm = new ScriptedLlm((_req, i) => {
    return i % 2 === 0
      ? {
          toolCalls: [
            toolCall('find_slots', { service_id: serviceId, date: day(1), time_from: '17:00' }),
          ],
        }
      : { content: answer };
  });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ llm }));
    const email = uniqueEmail('owner');
    emails.push(email);
    const agent = request.agent(app.getHttpServer());
    const reg = await agent
      .post('/auth/register')
      .send({ name: 'Owner', email, password: 'Password123', terms: true });
    businessId = reg.body.businessId;
    slug = `ac05-${Date.now().toString(36)}`;
    await agent
      .patch('/businesses/me')
      .send({ slug, name: 'Salon', timezone: 'UTC', minNoticeHours: 0 })
      .expect(200);
    const svc = await agent
      .post('/services')
      .send({ name: 'Coupe', durationMin: 30, price: 300 })
      .expect(201);
    serviceId = svc.body.id;
    const st = await agent
      .post('/staff')
      .send({ displayName: 'Ahmed', serviceIds: [serviceId] })
      .expect(201);
    await agent
      .put(`/staff/${st.body.id}/working-hours`)
      .send(
        [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '09:00', endTime: '19:00' })),
      )
      .expect(200);
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    await prisma.business.deleteMany({
      where: { id: { in: users.flatMap((u) => (u.businessId ? [u.businessId] : [])) } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  for (const s of SCENARIOS) {
    it(`${s.lang}: "${s.ask}" gives real slots after 17:00, in the customer's language, and no booking`, async () => {
      answer = s.answer;
      llm.calls.length = 0;
      const res = await request(app.getHttpServer())
        .post('/public/ai/chat')
        .send({ businessSlug: slug, locale: s.lang, messages: [{ role: 'user', content: s.ask }] });
      const events = res.text
        .split('\n\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => JSON.parse(l.slice(6)) as AiStreamEvent);

      const slots = events.find((e) => e.type === 'slots');
      expect(slots).toBeDefined();
      if (slots?.type === 'slots') {
        expect(slots.data.slots.length).toBeGreaterThan(0);
        for (const sl of slots.data.slots) expect(sl.start >= `${day(1)}T17:00`).toBe(true);
      }
      const text = events
        .filter((e) => e.type === 'text')
        .map((e) => (e.type === 'text' ? e.delta : ''))
        .join('');
      expect(text).toContain(s.answer.slice(0, 12));
      expect(events.at(-1)?.type).toBe('done');

      // The customer's own words reach the model unchanged; the system prompt tells it to use that language.
      const first = llm.calls[0];
      expect(first.messages.some((m) => m.role === 'user' && m.content === s.ask)).toBe(true);
      expect(String(first.messages[0].content)).toMatch(/language/i);
      // Nothing was booked: only the customer's click on a slot card and "Confirm" can do that.
      expect(await prisma.booking.count({ where: { businessId } })).toBe(0);
    });
  }
});
