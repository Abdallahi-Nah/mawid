import { Global, Module } from '@nestjs/common';
import { BookingEvents } from '../bookings/booking-events';
import { BullJobQueue } from './bull-job-queue';
import { JobQueue } from './job-queue';
import { NotificationProcessor } from './notification-processor';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationProcessor,
    BullJobQueue,
    { provide: JobQueue, useExisting: BullJobQueue },
    NotificationsService,
    { provide: BookingEvents, useExisting: NotificationsService },
  ],
  exports: [BookingEvents, NotificationProcessor, JobQueue],
})
export class NotificationsModule {}
