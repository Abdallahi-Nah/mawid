import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  createReviewSchema,
  paginationSchema,
  replyReviewSchema,
  type CreateReviewInput,
  type OwnerReview,
  type Page,
  type Pagination,
  type PublicReviewsPage,
  type ReplyReviewInput,
  type ReviewFormView,
} from '@mawid/shared';
import { z } from 'zod';
import { CurrentTenant, Public, Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ReviewsService } from './reviews.service';

const uuidPipe = new ZodPipe(z.string().uuid());
const slugPipe = new ZodPipe(z.string().min(1).max(60));

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public/reviews/:token')
  @ApiOperation({ summary: 'Data of the rating page (link of the email)' })
  form(@Param('token', uuidPipe) token: string): Promise<ReviewFormView> {
    return this.reviews.form(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('public/reviews/:token')
  @ApiOperation({
    summary: '1 to 5 stars and a comment. One review per booking, only once COMPLETED',
  })
  submit(
    @Param('token', uuidPipe) token: string,
    @Body(new ZodPipe(createReviewSchema)) dto: CreateReviewInput,
  ): Promise<ReviewFormView> {
    return this.reviews.submit(token, dto);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('public/businesses/:slug/reviews')
  @ApiOperation({ summary: 'Reviews shown on the public page, with the average rating' })
  publicList(
    @Param('slug', slugPipe) slug: string,
    @Query(new ZodPipe(paginationSchema)) p: Pagination,
  ): Promise<PublicReviewsPage> {
    return this.reviews.publicList(slug, p);
  }

  @ApiCookieAuth()
  @Roles('OWNER')
  @Get('reviews')
  @ApiOperation({ summary: 'My reviews, newest first' })
  ownerList(
    @CurrentTenant() businessId: string,
    @Query(new ZodPipe(paginationSchema)) p: Pagination,
  ): Promise<Page<OwnerReview>> {
    return this.reviews.ownerList(businessId, p);
  }

  @ApiCookieAuth()
  @Roles('OWNER')
  @Patch('reviews/:id/reply')
  @ApiOperation({ summary: 'Answer a review (shown on the public page)' })
  reply(
    @CurrentTenant() businessId: string,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodPipe(replyReviewSchema)) dto: ReplyReviewInput,
  ): Promise<OwnerReview> {
    return this.reviews.reply(businessId, id, dto.reply);
  }
}
