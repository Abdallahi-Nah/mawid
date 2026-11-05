import { Global, Module } from '@nestjs/common';
import { BookingEvents } from '../bookings/booking-events';
import { SMS_CHANNEL, StubChannelProvider, WHATSAPP_CHANNEL } from './channels';
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
    // FR-51: stubs only. No WhatsApp or SMS service is called until a real provider is plugged in here.
    { provide: WHATSAPP_CHANNEL, useFactory: () => new StubChannelProvider('WHATSAPP') },
    { provide: SMS_CHANNEL, useFactory: () => new StubChannelProvider('SMS') },
    NotificationsService,
    { provide: BookingEvents, useExisting: NotificationsService },
  ],
  exports: [BookingEvents, NotificationProcessor, JobQueue],
})
export class NotificationsModule {}
