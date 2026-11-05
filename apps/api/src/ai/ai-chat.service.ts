import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type {
  AiChatInput,
  AiConfirmInput,
  AiDraft,
  AiDraftInput,
  AiStreamEvent,
  PublicBookingView,
} from '@mawid/shared';
import type { AuthUser } from '../common/auth.decorators';
import { BookingsService } from '../bookings/bookings.service';
import { ENV, Env } from '../config/env.module';
import { PrismaService } from '../prisma/prisma.service';
import { AiGateway } from './ai-gateway';
import { verifyDraft } from './ai-draft';
import { buildSystemPrompt } from './ai-prompt';
import { AI_TOOLS, AiToolbox } from './ai-tools';
import type { LlmMessage, ToolCall } from './llm.client';

export const MAX_TOOL_ROUNDS = 5; // iterations of tool calls per customer message
export const MAX_CONTEXT = 10; // last messages sent to the model
const MAX_CALLS_PER_ROUND = 4;
const MAX_TOOL_RESULT_CHARS = 4000;

export interface PreparedChat {
  businessId: string;
  messages: LlmMessage[];
}

@Injectable()
export class AiChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: AiGateway,
    private readonly tools: AiToolbox,
    private readonly bookings: BookingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Everything that can fail with a normal HTTP error happens here, before the stream starts:
   * unknown business, AI switched off, quota reached.
   */
  async prepare(input: AiChatInput, now = new Date()): Promise<PreparedChat> {
    const business = await this.prisma.business.findUnique({ where: { slug: input.businessSlug } });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    await this.gateway.assertUsable(business.id);
    const t = this.prisma.forTenant(business.id);
    const [services, staff] = await Promise.all([
      t.service.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      t.staff.findMany({ where: { active: true }, include: { workingHours: true } }),
    ]);
    // Only user and assistant turns can come from the browser (the schema enforces it).
    const history: LlmMessage[] = input.messages.slice(-MAX_CONTEXT).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return {
      businessId: business.id,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(business, services, staff, now, input.locale),
        },
        ...history,
      ],
    };
  }

  /** Runs the conversation turn and reports what the customer should see through `emit`. */
  async run(p: PreparedChat, emit: (e: AiStreamEvent) => void): Promise<void> {
    const ctx = { businessId: p.businessId, feature: 'chat' } as const;
    const messages = [...p.messages];
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // After the last allowed round the model gets no tools and must answer with what it has.
      const withTools = round < MAX_TOOL_ROUNDS;
      let calls: ToolCall[] = [];
      let content = '';
      for await (const ev of this.gateway.stream(ctx, {
        messages,
        ...(withTools ? { tools: AI_TOOLS } : {}),
      })) {
        if (ev.type === 'text') emit({ type: 'text', delta: ev.text });
        else {
          calls = ev.toolCalls;
          content = ev.content;
        }
      }
      if (calls.length === 0 || !withTools) return;

      messages.push({ role: 'assistant', content: content || null, tool_calls: calls });
      for (const [i, call] of calls.entries()) {
        const out =
          i < MAX_CALLS_PER_ROUND
            ? await this.tools.run(p.businessId, call.function.name, call.function.arguments)
            : { result: { error: 'too_many_calls' }, events: [] };
        out.events.forEach(emit);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(out.result).slice(0, MAX_TOOL_RESULT_CHARS),
        });
      }
    }
  }

  /** The customer clicked a slot card: a draft without calling the model. */
  async draft(input: AiDraftInput): Promise<AiDraft> {
    const business = await this.prisma.business.findUnique({
      where: { slug: input.businessSlug },
      select: { id: true },
    });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    try {
      return await this.tools.makeDraft(business.id, {
        serviceId: input.serviceId,
        staffId: input.staffId ?? null,
        startsAt: new Date(input.startsAt),
      });
    } catch (e) {
      const body = (e as { getResponse?: () => unknown }).getResponse?.();
      if (body) throw e; // not found, validation...
      throw new NotFoundException({ code: 'SLOT_TAKEN', message: 'This slot is no longer free' });
    }
  }

  /** The customer clicked "Confirm": the normal booking flow of phase 3 creates the booking. */
  async confirm(input: AiConfirmInput, user?: AuthUser): Promise<PublicBookingView> {
    const draft = verifyDraft(input.draftToken, this.env.JWT_SECRET);
    if (!draft)
      throw new UnauthorizedException({
        code: 'DRAFT_INVALID',
        message: 'This proposal expired. Please choose a slot again.',
      });
    const business = await this.prisma.business.findUnique({
      where: { id: draft.businessId },
      select: { slug: true },
    });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    return this.bookings.createPublic(
      {
        businessSlug: business.slug,
        serviceId: draft.serviceId,
        staffId: draft.staffId,
        startsAt: draft.startsAt,
        customer: input.customer,
        notes: input.notes ?? null,
        locale: input.locale,
      },
      user,
      'AI',
    );
  }
}
