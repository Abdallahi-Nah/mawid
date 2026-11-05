import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { FailedNotification, Page, Pagination } from '@mawid/shared';
import { JobQueue } from '../notifications/job-queue';
import type { EmailType } from '../notifications/templates';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Emails that failed after all their retries stay in the database with the status FAILED and the last error.
 * This is the dead-letter list: an admin can read it and send an email again once the cause is fixed
 * (for example a wrong Resend key or a provider outage). Like the rest of AdminService it reads all businesses.
 */
@Injectable()
export class DeadLetterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
  ) {}

  async list(p: Pagination): Promise<Page<FailedNotification>> {
    const where = { status: 'FAILED' as const, channel: 'EMAIL' as const };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        include: {
          business: { select: { id: true, name: true } },
          booking: { select: { id: true, startsAt: true, status: true } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        channel: n.channel,
        error: n.error,
        createdAt: n.createdAt.toISOString(),
        business: n.business,
        booking: {
          id: n.booking.id,
          startsAt: n.booking.startsAt.toISOString(),
          status: n.booking.status,
        },
      })),
      total,
      page: p.page,
      pageSize: p.pageSize,
    };
  }

  /** Puts a failed email back in the queue (3 new attempts). */
  async retry(id: string): Promise<{ id: string; status: 'PENDING' }> {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification not found' });
    if (n.status !== 'FAILED' || n.channel !== 'EMAIL') {
      throw new ConflictException({
        code: 'NOT_FAILED',
        message: 'Only a failed email can be sent again',
      });
    }
    await this.prisma.notification.update({
      where: { id },
      data: { status: 'PENDING', error: null },
    });
    await this.queue.add(
      {
        kind: n.type.startsWith('owner_') ? 'owner' : 'customer',
        type: n.type as EmailType,
        bookingId: n.bookingId,
        notificationId: n.id,
      },
      // A new job id: the first job of this email still exists in the queue history.
      { jobId: `${n.type}-${n.id}-retry-${Date.now()}` },
    );
    return { id, status: 'PENDING' };
  }
}
