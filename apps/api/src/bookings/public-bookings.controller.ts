import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  createBookingSchema,
  rescheduleSchema,
  slotsQuerySchema,
  type CreateBookingInput,
  type PublicBookingView,
  type RescheduleInput,
  type SlotsQuery,
  type SlotsResponse,
} from '@mawid/shared';
import { z } from 'zod';
import { AuthUser, OptionalUser, Public } from '../common/auth.decorators';
import { businessSuspended } from '../common/suspension.service';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import { BookingsService } from './bookings.service';

const tokenPipe = new ZodPipe(z.string().uuid());
const slugPipe = new ZodPipe(z.string().min(1).max(60));

@ApiTags('public')
@Controller('public')
export class PublicBookingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly bookings: BookingsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('businesses/:slug/slots')
  @ApiOperation({ summary: 'Free slots of a day for a service (staffId omitted = any employee)' })
  @ApiQuery({ name: 'serviceId' })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'date', description: 'YYYY-MM-DD in the business time zone' })
  async slots(
    @Param('slug', slugPipe) slug: string,
    @Query(new ZodPipe(slotsQuerySchema)) q: SlotsQuery,
  ): Promise<SlotsResponse> {
    const business = await this.prisma.business.findUnique({
      where: { slug },
      select: { id: true, suspendedAt: true },
    });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    if (business.suspendedAt) throw businessSuspended();
    const a = await this.availability.load(business.id, q);
    return {
      date: q.date,
      timezone: a.business.timezone,
      slots: a.slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('bookings')
  @ApiOperation({
    summary: 'Book a slot (guest or logged in). 409 SLOT_TAKEN if someone was faster',
  })
  @ApiBody({
    schema: {
      type: 'object',
      example: {
        businessSlug: 'salon-nour',
        serviceId: '<uuid>',
        staffId: null,
        startsAt: '2026-12-01T10:00:00Z',
        customer: { name: 'Fatima', phone: '+222 22 00 11 22', email: 'fatima@example.com' },
      },
    },
  })
  create(
    @Body(new ZodPipe(createBookingSchema)) dto: CreateBookingInput,
    @OptionalUser() user?: AuthUser,
  ): Promise<PublicBookingView> {
    return this.bookings.createPublic(dto, user);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('bookings/:token')
  @ApiOperation({ summary: 'A booking, found with its secret token (cancel page)' })
  view(@Param('token', tokenPipe) token: string): Promise<PublicBookingView> {
    return this.bookings.viewByToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('bookings/:token/calendar.ics')
  @ApiOperation({ summary: 'Calendar file (.ics) of a booking, for "Add to calendar"' })
  async ics(
    @Param('token', tokenPipe) token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="booking.ics"');
    return this.bookings.icsByToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('bookings/:token/cancel')
  @ApiOperation({ summary: 'Cancel with the secret token, until the business cancel limit' })
  cancel(@Param('token', tokenPipe) token: string): Promise<PublicBookingView> {
    return this.bookings.cancelByToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('bookings/:token/reschedule')
  @ApiOperation({ summary: 'Move to another free slot with the secret token (same employee)' })
  @ApiBody({ schema: { type: 'object', example: { startsAt: '2026-12-02T11:00:00Z' } } })
  reschedule(
    @Param('token', tokenPipe) token: string,
    @Body(new ZodPipe(rescheduleSchema)) dto: RescheduleInput,
  ): Promise<PublicBookingView> {
    return this.bookings.rescheduleByToken(token, dto.startsAt);
  }
}
