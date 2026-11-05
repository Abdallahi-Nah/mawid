import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ENV, Env } from '../config/env.module';
import { PrismaService } from '../prisma/prisma.service';
import { LlmClient, LlmEvent, LlmRequest, LlmResult } from './llm.client';

export const DEFAULT_MODELS = {
  chat: 'llama-3.3-70b-versatile',
  fast: 'llama-3.1-8b-instant',
  stt: 'whisper-large-v3-turbo',
} as const;

export type AiFeature = 'chat' | 'draft' | 'generate' | 'reviews' | 'summary' | 'transcribe';
export interface AiContext {
  businessId: string;
  feature: AiFeature;
}
type Req = Omit<LlmRequest, 'model' | 'signal'> & { model?: 'chat' | 'fast' };

const PLAN_FACTOR = { FREE: 1, PRO: 10, BUSINESS: 50 } as const;

export class AiUnavailableError extends HttpException {
  constructor(reason = 'Groq is not available') {
    super({ code: 'AI_UNAVAILABLE', message: reason }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
export class AiQuotaError extends HttpException {
  constructor() {
    super(
      { code: 'AI_QUOTA_EXCEEDED', message: 'Monthly AI quota reached' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * The only door to Groq. It checks the kill switch and the monthly quota, applies the timeout
 * (15 s) and one retry, validates structured output and writes an AiLog row for every call.
 */
@Injectable()
export class AiGateway {
  private readonly log = new Logger(AiGateway.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly llm: LlmClient,
    private readonly prisma: PrismaService,
  ) {}

  /** False when AI_ENABLED=false or there is no key: callers show the normal booking form. */
  get available(): boolean {
    return this.env.AI_ENABLED && this.env.GROQ_API_KEY.length > 0;
  }

  modelName(kind: 'chat' | 'fast' | 'stt'): string {
    const configured = {
      chat: this.env.GROQ_MODEL_CHAT,
      fast: this.env.GROQ_MODEL_FAST,
      stt: this.env.GROQ_MODEL_STT,
    }[kind];
    return configured || DEFAULT_MODELS[kind];
  }

  /** Throws AI_UNAVAILABLE (switch off, no key) or AI_QUOTA_EXCEEDED. Call before using the model. */
  async assertUsable(businessId: string): Promise<void> {
    if (!this.available) throw new AiUnavailableError('AI is turned off');
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { plan: true },
    });
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const used = await this.prisma.forTenant(businessId).aiLog.count({
      where: { createdAt: { gte: start } },
    });
    if (used >= this.env.AI_MONTHLY_QUOTA * PLAN_FACTOR[business?.plan ?? 'FREE'])
      throw new AiQuotaError();
  }

  /** One full answer (no streaming). */
  async complete(ctx: AiContext, req: Req): Promise<LlmResult> {
    const model = this.modelName(req.model ?? 'chat');
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try {
        const out = await this.withTimeout((signal) =>
          this.llm.complete({ ...req, model, signal }),
        );
        await this.record(ctx, model, started, out.usage);
        return out;
      } catch (e) {
        lastError = e;
        await this.record(ctx, model, started, undefined, e);
      }
    }
    throw this.toUnavailable(lastError);
  }

  /**
   * Streaming answer. A failure is retried once only if nothing was sent yet
   * (text that already reached the customer cannot be taken back).
   */
  async *stream(ctx: AiContext, req: Req): AsyncGenerator<LlmEvent> {
    const model = this.modelName(req.model ?? 'chat');
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.env.AI_TIMEOUT_MS);
      let sent = false;
      try {
        for await (const ev of this.llm.stream({ ...req, model, signal: controller.signal })) {
          if (ev.type === 'text') sent = true;
          if (ev.type === 'done') await this.record(ctx, model, started, ev.usage);
          yield ev;
        }
        return;
      } catch (e) {
        lastError = e;
        await this.record(ctx, model, started, undefined, e);
        if (sent) break;
      } finally {
        clearTimeout(timer);
      }
    }
    throw this.toUnavailable(lastError);
  }

  /** Structured output: JSON validated with Zod. Invalid JSON is retried once. */
  async json<T>(ctx: AiContext, req: Req, schema: z.ZodType<T>): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await this.complete(ctx, { ...req, json: true });
      try {
        const parsed = schema.safeParse(JSON.parse(out.content));
        if (parsed.success) return parsed.data;
      } catch {
        /* not JSON: try again */
      }
    }
    throw new AiUnavailableError('The model returned an invalid answer');
  }

  private async withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.env.AI_TIMEOUT_MS);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private toUnavailable(e: unknown): AiUnavailableError {
    return new AiUnavailableError(e instanceof Error ? e.message.slice(0, 120) : undefined);
  }

  /** Never throws: a logging problem must not break an answer. Error text is short (no prompt content). */
  private async record(
    ctx: AiContext,
    model: string,
    started: number,
    usage?: { promptTokens: number; completionTokens: number },
    error?: unknown,
  ): Promise<void> {
    try {
      await this.prisma.forTenant(ctx.businessId).aiLog.create({
        data: {
          businessId: ctx.businessId,
          feature: ctx.feature,
          model,
          tokensIn: usage?.promptTokens ?? 0,
          tokensOut: usage?.completionTokens ?? 0,
          latencyMs: Date.now() - started,
          error: error ? (error instanceof Error ? error.name : 'error').slice(0, 120) : null,
        },
      });
    } catch (e) {
      this.log.error(`Could not write AiLog: ${String(e)}`);
    }
  }
}
