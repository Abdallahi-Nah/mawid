import { Inject, Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import { ENV, Env } from '../config/env.module';
import { LlmClient, LlmEvent, LlmRequest, LlmResult, ToolCall } from './llm.client';

/** Real Groq client (official SDK). The API key is read from the environment and never leaves the server. */
@Injectable()
export class GroqLlmClient extends LlmClient {
  private client: Groq | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  private groq(): Groq {
    // Created on first use, so the app boots (and the normal booking flow works) without a key.
    this.client ??= new Groq({ apiKey: this.env.GROQ_API_KEY, maxRetries: 0 });
    return this.client;
  }

  private body(req: LlmRequest) {
    return {
      model: req.model,
      messages: req.messages as Groq.Chat.ChatCompletionMessageParam[],
      ...(req.tools?.length ? { tools: req.tools, tool_choice: 'auto' as const } : {}),
      temperature: req.temperature ?? 0.3,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
    };
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const res = await this.groq().chat.completions.create(
      { ...this.body(req), stream: false },
      { signal: req.signal },
    );
    const msg = res.choices[0]?.message;
    return {
      content: msg?.content ?? '',
      toolCalls: (msg?.tool_calls ?? []).map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.function.name, arguments: c.function.arguments },
      })),
      usage: {
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(req: LlmRequest): AsyncGenerator<LlmEvent> {
    const stream = await this.groq().chat.completions.create(
      { ...this.body(req), stream: true },
      { signal: req.signal },
    );
    let content = '';
    const calls = new Map<number, ToolCall>();
    let promptTokens = 0;
    let completionTokens = 0;
    for await (const chunk of stream) {
      const usage = chunk.x_groq?.usage;
      if (usage) {
        promptTokens = usage.prompt_tokens ?? promptTokens;
        completionTokens = usage.completion_tokens ?? completionTokens;
      }
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        yield { type: 'text', text: delta.content };
      }
      for (const c of delta.tool_calls ?? []) {
        // Tool calls arrive in pieces: the name once, the JSON arguments in several parts.
        const cur = calls.get(c.index) ?? {
          id: '',
          type: 'function' as const,
          function: { name: '', arguments: '' },
        };
        if (c.id) cur.id = c.id;
        if (c.function?.name) cur.function.name += c.function.name;
        if (c.function?.arguments) cur.function.arguments += c.function.arguments;
        calls.set(c.index, cur);
      }
    }
    yield {
      type: 'done',
      content,
      toolCalls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c),
      usage: { promptTokens, completionTokens },
    };
  }
}
