import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { PlanInfo } from '@mawid/shared';
import { DateTime } from 'luxon';
import { ENV, Env } from '../config/env.module';
import { PrismaService } from '../prisma/prisma.service';
import { limitsFor } from './plans';

/** Plan limits (FR-91). The API refuses with a clear code; the web shows an upgrade message. */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async info(businessId: string): Promise<PlanInfo> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { plan: true, timezone: true },
    });
    const t = this.prisma.forTenant(businessId);
    const aiStart = new Date();
    aiStart.setUTCDate(1);
    aiStart.setUTCHours(0, 0, 0, 0);
    const [staff, bookingsThisMonth, aiMessagesThisMonth] = await Promise.all([
      t.staff.count({ where: { active: true } }),
      t.booking.count({ where: { createdAt: { gte: monthStart(business.timezone) } } }),
      t.aiLog.count({ where: { createdAt: { gte: aiStart } } }),
    ]);
    return {
      plan: business.plan,
      limits: limitsFor(business.plan, this.env.AI_MONTHLY_QUOTA),
      usage: { staff, bookingsThisMonth, aiMessagesThisMonth },
    };
  }

  /** Call before adding an active employee. */
  async assertCanAddStaff(businessId: string): Promise<void> {
    const { plan, limits, usage } = await this.info(businessId);
    if (limits.staff !== null && usage.staff >= limits.staff) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_STAFF',
        message: `Your ${plan} plan allows ${limits.staff} employees. Upgrade to add more.`,
        details: { plan, limit: limits.staff },
      });
    }
  }

  /** Call before creating any booking (web, AI or by the owner). Cancelled bookings still count: the slot was used. */
  async assertCanBook(businessId: string): Promise<void> {
    const { plan, limits, usage } = await this.info(businessId);
    if (limits.bookingsPerMonth !== null && usage.bookingsThisMonth >= limits.bookingsPerMonth) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_BOOKINGS',
        message: `Your ${plan} plan allows ${limits.bookingsPerMonth} bookings per month. Upgrade to take more.`,
        details: { plan, limit: limits.bookingsPerMonth },
      });
    }
  }
}

/** First instant of the current month in the business time zone. */
function monthStart(timezone: string): Date {
  return DateTime.now().setZone(timezone).startOf('month').toJSDate();
}
