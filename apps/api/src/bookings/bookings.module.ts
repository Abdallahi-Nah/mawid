import { Global, Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { PublicBookingsController } from './public-bookings.controller';

// BookingEvents is provided by the notifications module.
@Global()
@Module({
  controllers: [BookingsController, PublicBookingsController],
  providers: [AvailabilityService, BookingsService],
  exports: [AvailabilityService, BookingsService],
})
export class BookingsModule {}
