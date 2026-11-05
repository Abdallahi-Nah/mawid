import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  aiAnalyzeSchema,
  aiGenerateSchema,
  type AiAnalyzeInput,
  type AiGenerateInput,
  type AiGenerateResult,
  type ReviewAnalysisResult,
} from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AiOwnerService } from './ai-owner.service';

@ApiTags('ai')
@ApiCookieAuth()
@Roles('OWNER')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('ai')
export class AiOwnerController {
  constructor(private readonly ai: AiOwnerService) {}

  @HttpCode(200)
  @Post('generate')
  @ApiOperation({
    summary:
      'Write with AI (AI-03, AI-05): reminder, cancellation, thanks, promotion, or a description. Returns text only: nothing is saved or sent',
  })
  generate(
    @CurrentTenant() businessId: string,
    @Body(new ZodPipe(aiGenerateSchema)) dto: AiGenerateInput,
  ): Promise<AiGenerateResult> {
    return this.ai.generate(businessId, dto);
  }

  @HttpCode(200)
  @Post('reviews/analyze')
  @ApiOperation({
    summary: 'Analyse the latest reviews: summary, sentiment counts, themes (AI-04)',
  })
  analyze(
    @CurrentTenant() businessId: string,
    @Body(new ZodPipe(aiAnalyzeSchema)) dto: AiAnalyzeInput,
  ): Promise<ReviewAnalysisResult> {
    return this.ai.analyzeReviews(businessId, dto);
  }
}
