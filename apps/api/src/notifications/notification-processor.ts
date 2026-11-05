import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Booking, Business, Customer, Service, Staff } from '@prisma/client';
import { ENV, Env } from '../config/env.module';
import { MailMessage, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildIcs, googleCalendarUrl } from './ics';
import { calendarEvent } from './calendar-event';
import { JobData } from './job-queue';
import { asLocale, EmailContext, EmailType, renderEmail } from './templates';

type Full = Booking & { customer: Customer; service: Service; staff: Staff; business: Business };

/** Does the work of a job: builds the email in the right language, sends it, records the result. */
@Injectable()
export class NotificationProcessor {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Throws when sending fails: the queue then retries (3 attempts). */
  async handle(data: JobData): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: { customer: true, service: true, staff: true, business: true },
    });
    if (!booking) return this.discard(data); // the booking was deleted

    if (data.kind === 'customer') {
      if (this.isObsolete(data.type, booking)) return this.discard(data);
      const to = booking.customer.email;
      if (!to) return this.discard(data);
      await this.mail.send(this.customerMail(data.type, booking, to));
    } else {
      const owners = await this.prisma.user.findMany({
        where: { businessId: booking.businessId, role: 'OWNER' },
      });
      for (const owner of owners) {
        await this.mail.send({
          to: owner.email,
          ...renderEmail(data.type, owner.locale, this.context(booking, owner.locale)),
        });
      }
    }
    await this.prisma.notification.updateMany({
      where: { id: data.notificationId },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  async markFailed(data: JobData, error: Error): Promise<void> {
    this.logger.error(
      `Notification ${data.notificationId} (${data.type}) failed for good: ${error.message}`,
    );
    await this.prisma.notification.updateMany({
      where: { id: data.notificationId },
      data: { status: 'FAILED' },
    });
  }

  /** A reminder is useless if the booking was cancelled or already happened. */
  private isObsolete(type: EmailType, b: Full): boolean {
    if (type === 'reminder') return b.status !== 'CONFIRMED' || b.startsAt.getTime() < Date.now();
    if (type === 'review_request') return b.status !== 'COMPLETED';
    if (type === 'confirmation' || type === 'changed') return b.status === 'CANCELLED';
    return false;
  }

  private async discard(data: JobData): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: { id: data.notificationId, status: 'PENDING' },
    });
  }

  private context(b: Full, locale: string): EmailContext {
    const ev = calendarEvent(b);
    return {
      businessName: b.business.name,
      customerName: b.customer.name,
      serviceName: b.service.name,
      staffName: b.staff.displayName,
      startsAt: b.startsAt,
      timezone: b.business.timezone,
      price: Number(b.price),
      address: b.business.address,
      phone: b.business.phone,
      cancelUrl: `${this.env.APP_URL}/${asLocale(locale)}/booking/${b.cancelToken}`,
      icsUrl: `${this.env.API_URL}/public/bookings/${b.cancelToken}/calendar.ics`,
      googleUrl: googleCalendarUrl(ev),
      reviewUrl: `${this.env.APP_URL}/${asLocale(locale)}/review/${b.reviewToken}`,
      dashboardUrl: `${this.env.APP_URL}/${asLocale(locale)}/dashboard/calendar`,
    };
  }

  private customerMail(type: EmailType, b: Full, to: string): MailMessage {
    const mail: MailMessage = { to, ...renderEmail(type, b.locale, this.context(b, b.locale)) };
    if (type === 'confirmation' || type === 'changed') {
      mail.attachments = [
        {
          filename: 'booking.ics',
          content: buildIcs(calendarEvent(b)),
          contentType: 'text/calendar',
        },
      ];
    }
    return mail;
  }
}
