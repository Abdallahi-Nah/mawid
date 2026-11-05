import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  aiChatSchema,
  aiConfirmSchema,
  aiDraftSchema,
  type AiChatInput,
  type AiConfirmInput,
  type AiDraft,
  type AiDraftInput,
  type AiStreamEvent,
  type PublicBookingView,
} from '@mawid/shared';
import type { Response } from 'express';
import { AuthUser, OptionalUser, Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AiChatService } from './ai-chat.service';

// 20 AI requests per minute and per IP (SRS 4.4).
const AI_LIMIT = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('ai')
@Controller('public/ai')
export class AiController {
  constructor(private readonly chat: AiChatService) {}

  @Public()
  @Throttle(AI_LIMIT)
  @HttpCode(200)
  @Post('chat')
  @ApiOperation({
    summary:
      'Booking assistant (AI-01, AI-02). Server-Sent Events: text, slots, draft, error, done. 503 AI_UNAVAILABLE when Groq is off or down',
  })
  async stream(
    @Body(new ZodPipe(aiChatSchema)) dto: AiChatInput,
    @Res() res: Response,
  ): Promise<void> {
    // Normal HTTP errors (unknown business, AI off, quota) are sent before the stream starts.
    const prepared = await this.chat.prepare(dto);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no'); // proxies must not hold the words back
    res.flushHeaders();
    let open = true;
    res.on('close', () => (open = false));
    const emit = (e: AiStreamEvent) => {
      if (open) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    try {
      await this.chat.run(prepared, emit);
    } catch (e) {
      const code = (e as { getResponse?: () => { code?: string } }).getResponse?.().code;
      emit({ type: 'error', code: code ?? 'AI_UNAVAILABLE' });
    }
    emit({ type: 'done' });
    res.end();
  }

  @Public()
  @Throttle(AI_LIMIT)
  @HttpCode(200)
  @Post('chat/draft')
  @ApiOperation({ summary: 'The customer picked a slot card: a signed draft (not a booking)' })
  draft(@Body(new ZodPipe(aiDraftSchema)) dto: AiDraftInput): Promise<AiDraft> {
    return this.chat.draft(dto);
  }

  @Public()
  @Throttle(AI_LIMIT)
  @Post('chat/confirm')
  @ApiOperation({
    summary: 'The customer clicked Confirm on a draft: creates the booking with the normal rules',
  })
  confirm(
    @Body(new ZodPipe(aiConfirmSchema)) dto: AiConfirmInput,
    @OptionalUser() user?: AuthUser,
  ): Promise<PublicBookingView> {
    return this.chat.confirm(dto, user);
  }
}
