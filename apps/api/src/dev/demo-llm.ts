import { LlmClient, LlmEvent, LlmRequest, LlmResult, ToolCall } from '../ai/llm.client';

/**
 * A small scripted "model" for demos and browser tests when there is no Groq key.
 * NOT used by the app: only src/dev/e2e-server.ts plugs it in. It understands one thing, a booking
 * request ("a haircut tomorrow after 5 pm"), and answers FAQ questions from the business data in the prompt.
 */
const lang = (text: string): 'ar' | 'fr' | 'en' =>
  /[؀-ۿ]/.test(text)
    ? 'ar'
    : /[éèàçùê]|bonjour|je |demain|coupe|horaire|adresse/i.test(text)
      ? 'fr'
      : 'en';

const SLOTS = {
  ar: 'تفضل، هذه مواعيد متاحة غدًا بعد الساعة 5 مساءً. أيها يناسبك؟',
  fr: 'Voici des créneaux libres demain après 17 h. Lequel vous convient ?',
  en: 'Here are free slots tomorrow after 5 pm. Which one suits you?',
};
const NONE = {
  ar: 'لا توجد مواعيد متاحة غدًا بعد الخامسة. جرّب يومًا آخر.',
  fr: 'Aucun créneau libre demain après 17 h. Essayez un autre jour.',
  en: 'No free slot tomorrow after 5 pm. Try another day.',
};
const DRAFT = {
  ar: 'ممتاز. اضغط تأكيد بعد إدخال اسمك ورقم هاتفك.',
  fr: 'Parfait. Appuyez sur Confirmer après avoir saisi votre nom et votre téléphone.',
  en: 'Perfect. Press Confirm after entering your name and phone.',
};

export class DemoLlm extends LlmClient {
  private respond(req: LlmRequest): { content: string; toolCalls: ToolCall[] } {
    const first = req.messages[0]?.content ?? '';
    // Owner tools: a fixed text (writing) and a fixed analysis (reviews).
    if (first.startsWith('You are a writing assistant')) {
      const name = /Business name: (.*)/.exec(req.messages[1]?.content ?? '')?.[1] ?? '';
      return { content: `Texte de démonstration pour ${name}.`, toolCalls: [] };
    }
    if (first.startsWith('You analyse customer reviews')) {
      return {
        content: JSON.stringify({
          summary: 'Résumé de démonstration.',
          sentiment_counts: { positive: 1, neutral: 0, negative: 0 },
          themes: [{ name: 'accueil', sentiment: 'positive', mentions: 1 }],
        }),
        toolCalls: [],
      };
    }
    const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
    const last = req.messages[req.messages.length - 1];
    const userText = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const l = lang(userText);
    if (last.role === 'tool') {
      const r = JSON.parse(last.content) as { slots?: unknown[]; status?: string };
      if (r.status === 'draft_ready') return { content: DRAFT[l], toolCalls: [] };
      return { content: r.slots?.length ? SLOTS[l] : NONE[l], toolCalls: [] };
    }
    if (/horaire|hours|ساعات|عنوان|address|adresse|prix|price|سعر/i.test(userText)) {
      const facts = system.split('\n').filter((x) => /^(Opening hours|Address|Phone):/.test(x));
      return { content: facts.join(' | '), toolCalls: [] };
    }
    // Service: a haircut if the business has one, else the first. Day: the next open day.
    const lines = system.split('\n').filter((x) => /\(id [0-9a-f-]{36}\)/.test(x));
    const line = lines.find((x) => /coupe|haircut|cut|consultation/i.test(x)) ?? lines[0];
    const serviceId = line ? /\(id ([0-9a-f-]{36})\)/.exec(line)?.[1] : undefined;
    const now = /Current date and time: \w+ (\d{4}-\d{2}-\d{2})/.exec(system)?.[1];
    if (!serviceId || !now) return { content: NONE[l], toolCalls: [] };
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = new Date(`${now}T12:00:00Z`);
    for (let i = 0; i < 8; i++) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (!system.includes(`${DAYS[d.getUTCDay()]}: closed`)) break;
    }
    return {
      content: '',
      toolCalls: [
        {
          id: 'demo_find_slots',
          type: 'function',
          function: {
            name: 'find_slots',
            arguments: JSON.stringify({
              service_id: serviceId,
              date: d.toISOString().slice(0, 10),
              time_from: '17:00',
            }),
          },
        },
      ],
    };
  }

  complete(req: LlmRequest): Promise<LlmResult> {
    return Promise.resolve({
      ...this.respond(req),
      usage: { promptTokens: 50, completionTokens: 20 },
    });
  }

  async *stream(req: LlmRequest): AsyncGenerator<LlmEvent> {
    const r = this.respond(req);
    for (const piece of r.content.match(/\S+\s*/g) ?? []) {
      await new Promise((ok) => setTimeout(ok, 30));
      yield { type: 'text', text: piece };
    }
    yield { type: 'done', ...r, usage: { promptTokens: 50, completionTokens: 20 } };
  }
}
