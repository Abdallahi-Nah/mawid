import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listBookingsSchema,
  manualBookingSchema,
  moveBookingSchema,
  updateStatusSchema,
  type ListBookingsQuery,
  type ManualBookingInput,
  type MoveBookingInput,
  type UpdateStatusInput,
} from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { idPipe } from '../common/params';
import { ZodPipe } from '../common/zod.pipe';
import { BookingsService } from './bookings.service';

@ApiTags('bookings')
@ApiCookieAuth()
@Roles('OWNER', 'STAFF')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Calendar: bookings of my business (from, to, staffId, status; paginated)',
  })
  list(
    @CurrentTenant() businessId: string,
    @Query(new ZodPipe(listBookingsSchema)) q: ListBookingsQuery,
  ) {
    return this.bookings.list(businessId, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One booking' })
  get(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string) {
    return this.bookings.get(businessId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a booking by hand (phone or walk-in customer)' })
  @ApiBody({
    schema: {
      type: 'object',
      example: {
        serviceId: '<uuid>',
        staffId: '<uuid>',
        startsAt: '2026-12-01T10:00:00Z',
        customer: { name: 'Omar', phone: '+222 33 00 11 22' },
        status: 'CONFIRMED',
      },
    },
  })
  create(
    @CurrentTenant() businessId: string,
    @Body(new ZodPipe(manualBookingSchema)) dto: ManualBookingInput,
  ) {
    return this.bookings.createManual(businessId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Move a booking to another time (and maybe another employee). 409 SLOT_TAKEN on overlap',
  })
  @ApiBody({ schema: { type: 'object', example: { startsAt: '2026-12-01T11:00:00Z' } } })
  move(
    @CurrentTenant() businessId: string,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(moveBookingSchema)) dto: MoveBookingInput,
  ) {
    return this.bookings.moveByOwner(businessId, id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Confirm, complete, cancel or mark no-show. Invalid transitions give 409',
  })
  @ApiBody({ schema: { type: 'object', example: { status: 'CONFIRMED' } } })
  status(
    @CurrentTenant() businessId: string,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateStatusSchema)) dto: UpdateStatusInput,
  ) {
    return this.bookings.updateStatus(businessId, id, dto.status);
  }
}
