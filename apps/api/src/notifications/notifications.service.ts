import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Booking } from '@prisma/client';
import { BookingEvents, CancelledBy } from '../bookings/booking-events';
import { PrismaService } from '../prisma/prisma.service';
import { JobQueue } from './job-queue';
import { NotificationProcessor } from './notification-processor';
import { EmailType } from './templates';

const REMINDER_BEFORE_MS = 24 * 3_600_000;

/**
 * Listens to booking events and queues the emails: confirmation, alert for the owner (email and in-app),
 * cancellation, change, and the reminder 24 h before. A problem here must never break the booking, which is
 * already saved, so every handler catches and logs its errors.
 */
@Injectable()
export class NotificationsService extends BookingEvents implements OnModuleInit {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
    private readonly processor: NotificationProcessor,
  ) {
    super();
  }

  onModuleInit(): void {
    this.queue.start(
      (data) => this.processor.handle(data),
      (data, error) => this.processor.markFailed(data, error),
    );
  }

  created(bookingId: string): Promise<void> {
    return this.safe('created', async () => {
      const b = await this.load(bookingId);
      if (b.source !== 'MANUAL') await this.alertOwner(b, 'owner_new_booking');
      await this.toCustomer(b, b.status === 'CONFIRMED' ? 'confirmation' : 'pending');
      if (b.status === 'CONFIRMED') await this.scheduleReminder(b);
    });
  }

  confirmed(bookingId: string): Promise<void> {
    return this.safe('confirmed', async () => {
      const b = await this.load(bookingId);
      await this.toCustomer(b, 'confirmation');
      await this.scheduleReminder(b);
    });
  }

  cancelled(bookingId: string, by: CancelledBy): Promise<void> {
    return this.safe('cancelled', async () => {
      const b = await this.load(bookingId);
      await this.cancelReminders(b.id);
      await this.toCustomer(b, 'cancelled');
      if (by === 'customer') await this.alertOwner(b, 'owner_cancelled');
    });
  }

  rescheduled(bookingId: string, by: CancelledBy): Promise<void> {
    return this.safe('rescheduled', async () => {
      const b = await this.load(bookingId);
      await this.cancelReminders(b.id);
      await this.toCustomer(b, 'changed');
      if (b.status === 'CONFIRMED') await this.scheduleReminder(b);
      if (by === 'customer') await this.alertOwner(b, 'owner_changed');
    });
  }

  completed(bookingId: string): Promise<void> {
    return this.safe('completed', async () => {
      const b = await this.load(bookingId);
      await this.toCustomer(b, 'review_request');
    });
  }

  paymentSubmitted(bookingId: string): Promise<void> {
    return this.safe('paymentSubmitted', async () => {
      const b = await this.load(bookingId);
      // Bell only: the owner sees it in the dashboard, no email needed.
      await this.prisma.forTenant(b.businessId).notification.create({
        data: {
          businessId: b.businessId,
          bookingId: b.id,
          channel: 'IN_APP',
          type: 'owner_payment',
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    });
  }

  // ---------------------------------------------------------------------------------------------

  private async safe(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.logger.error(
        `Booking event "${name}" could not queue its notifications: ${(e as Error).message}`,
      );
    }
  }

  private async load(id: string): Promise<Booking> {
    // System code that already knows the booking id (it just came from our own service).
    return this.prisma.booking.findUniqueOrThrow({ where: { id } });
  }

  private async toCustomer(b: Booking, type: EmailType): Promise<void> {
    const customer = await this.prisma
      .forTenant(b.businessId)
      .customer.findUnique({ where: { id: b.customerId } });
    if (!customer?.email) return; // no email, no message
    const row = await this.row(b, 'EMAIL', type);
    await this.queue.add(
      { kind: 'customer', type, bookingId: b.id, notificationId: row },
      { jobId: `${type}-${row}` },
    );
  }

  /** In-app alert (the bell) plus an email to the owner. */
  private async alertOwner(
    b: Booking,
    type: 'owner_new_booking' | 'owner_cancelled' | 'owner_changed',
  ): Promise<void> {
    await this.prisma.forTenant(b.businessId).notification.create({
      data: {
        businessId: b.businessId,
        bookingId: b.id,
        channel: 'IN_APP',
        type,
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    const row = await this.row(b, 'EMAIL', type);
    await this.queue.add(
      { kind: 'owner', type, bookingId: b.id, notificationId: row },
      { jobId: `${type}-${row}` },
    );
  }

  private async row(b: Booking, channel: 'EMAIL', type: string): Promise<string> {
    const n = await this.prisma.forTenant(b.businessId).notification.create({
      data: { businessId: b.businessId, bookingId: b.id, channel, type, status: 'PENDING' },
    });
    return n.id;
  }

  /** Delayed job 24 h before the start. Nothing to schedule when the appointment is less than 24 h away. */
  private async scheduleReminder(b: Booking): Promise<void> {
    await this.cancelReminders(b.id);
    const delayMs = b.startsAt.getTime() - REMINDER_BEFORE_MS - Date.now();
    if (delayMs <= 0) return;
    const customer = await this.prisma
      .forTenant(b.businessId)
      .customer.findUnique({ where: { id: b.customerId } });
    if (!customer?.email) return;
    const row = await this.row(b, 'EMAIL', 'reminder');
    await this.queue.add(
      { kind: 'customer', type: 'reminder', bookingId: b.id, notificationId: row },
      { jobId: `reminder-${row}`, delayMs },
    );
  }

  /** Removes the waiting reminders of a booking (cancelled or moved). */
  private async cancelReminders(bookingId: string): Promise<void> {
    const pending = await this.prisma.notification.findMany({
      where: { bookingId, type: 'reminder', status: 'PENDING' },
    });
    for (const n of pending) {
      await this.queue.remove(`reminder-${n.id}`);
      await this.prisma.notification.delete({ where: { id: n.id } });
    }
  }
}
