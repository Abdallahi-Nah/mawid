import { LlmClient, LlmEvent, LlmRequest, LlmResult, ToolCall } from './llm.client';

/** Fake model for tests: answers from a script, records every request, can fail or hang. */
export type Step = Partial<LlmResult> | Error | 'hang';
type Script = Step[] | ((req: LlmRequest, index: number) => Step);

export const toolCall = (name: string, args: unknown, id = `call_${name}`): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
});

export class ScriptedLlm extends LlmClient {
  readonly calls: LlmRequest[] = [];

  constructor(private readonly script: Script) {
    super();
  }

  private async next(req: LlmRequest): Promise<LlmResult> {
    const i = this.calls.push(req) - 1;
    const step =
      typeof this.script === 'function'
        ? this.script(req, i)
        : this.script[Math.min(i, this.script.length - 1)];
    if (step === 'hang') {
      // Never answers; ends only when the gateway aborts the call (timeout).
      await new Promise<never>((_, reject) => {
        req.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    if (step instanceof Error) throw step;
    return {
      content: '',
      toolCalls: [],
      usage: { promptTokens: 100, completionTokens: 20 },
      ...(step as Partial<LlmResult>),
    };
  }

  complete(req: LlmRequest): Promise<LlmResult> {
    return this.next(req);
  }

  async *stream(req: LlmRequest): AsyncGenerator<LlmEvent> {
    const r = await this.next(req);
    for (const piece of r.content.match(/\S+\s*/g) ?? []) yield { type: 'text', text: piece };
    yield { type: 'done', ...r };
  }
}
