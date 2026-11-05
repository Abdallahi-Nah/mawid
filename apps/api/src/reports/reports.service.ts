import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BOOKING_STATUSES,
  type BookingsPerDayPoint,
  type BookingStatus,
  type PeakHour,
  type ReportRangeQuery,
  type ReportSummary,
  type TopService,
} from '@mawid/shared';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';
import { csvLine, resolveRange, ResolvedRange } from './report-range';

/** Money earned or expected: bookings that were confirmed or took place. */
const REVENUE_STATUSES: BookingStatus[] = ['CONFIRMED', 'COMPLETED'];
const CSV_MAX_ROWS = 10_000;
const BOM = String.fromCharCode(0xfeff);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewsService,
  ) {}

  private async context(businessId: string, q: ReportRangeQuery) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    return { tz: business.timezone, range: resolveRange(q, business.timezone) };
  }

  /** Key figures (FR-80). Every query is filtered by business_id (tenant client). */
  async summary(businessId: string, q: ReportRangeQuery): Promise<ReportSummary> {
    const { tz, range } = await this.context(businessId, q);
    const t = this.prisma.forTenant(businessId);
    const inRange = { startsAt: { gte: range.start, lt: range.end } };
    const now = DateTime.now().setZone(tz);
    const active = { status: { not: 'CANCELLED' as const } };
    const [byStatusRows, revenue, today, thisWeek, rating] = await Promise.all([
      t.booking.groupBy({ by: ['status'], where: inRange, _count: { _all: true } }),
      t.booking.aggregate({
        where: { ...inRange, status: { in: REVENUE_STATUSES } },
        _sum: { price: true },
      }),
      t.booking.count({
        where: {
          ...active,
          startsAt: {
            gte: now.startOf('day').toUTC().toJSDate(),
            lt: now.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
          },
        },
      }),
      t.booking.count({
        where: {
          ...active,
          startsAt: {
            gte: now.startOf('week').toUTC().toJSDate(),
            lt: now.startOf('week').plus({ weeks: 1 }).toUTC().toJSDate(),
          },
        },
      }),
      this.reviews.stats(businessId),
    ]);
    const byStatus = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0])) as Record<
      BookingStatus,
      number
    >;
    for (const r of byStatusRows) byStatus[r.status] = r._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return {
      range: { from: range.from, to: range.to },
      today,
      thisWeek,
      total,
      estimatedRevenue: Number(revenue._sum.price ?? 0),
      cancellationRate: total ? byStatus.CANCELLED / total : 0,
      noShowRate: total ? byStatus.NO_SHOW / total : 0,
      byStatus,
      ratingAverage: rating.ratingAverage,
      reviewCount: rating.reviewCount,
    };
  }

  /** Bookings (not cancelled) and revenue per local day; days without booking are filled with 0. */
  async bookingsPerDay(businessId: string, q: ReportRangeQuery): Promise<BookingsPerDayPoint[]> {
    const { tz, range } = await this.context(businessId, q);
    // Raw SQL cannot go through the tenant client, so the business id is bound explicitly here.
    const rows = await this.prisma.$queryRaw<{ day: string; bookings: number; revenue: number }[]>(
      Prisma.sql`
        SELECT to_char(("starts_at" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS bookings,
               COALESCE(SUM("price") FILTER (WHERE "status" IN ('CONFIRMED', 'COMPLETED')), 0)::float AS revenue
        FROM "bookings"
        WHERE "business_id" = ${businessId}
          AND "status" <> 'CANCELLED'
          AND "starts_at" >= ${range.start} AND "starts_at" < ${range.end}
        GROUP BY 1`,
    );
    const byDay = new Map(rows.map((r) => [r.day, r]));
    return daysOf(range).map((date) => ({
      date,
      bookings: byDay.get(date)?.bookings ?? 0,
      revenue: byDay.get(date)?.revenue ?? 0,
    }));
  }

  async topServices(businessId: string, q: ReportRangeQuery, limit = 5): Promise<TopService[]> {
    const { range } = await this.context(businessId, q);
    const t = this.prisma.forTenant(businessId);
    const groups = await t.booking.groupBy({
      by: ['serviceId'],
      where: { status: { not: 'CANCELLED' }, startsAt: { gte: range.start, lt: range.end } },
      _count: { _all: true },
      orderBy: { _count: { serviceId: 'desc' } },
      take: limit,
    });
    const ids = groups.map((g) => g.serviceId);
    // Revenue counts only confirmed and completed bookings (same rule as the summary).
    const [earned, names] = await Promise.all([
      t.booking.groupBy({
        by: ['serviceId'],
        where: {
          serviceId: { in: ids },
          status: { in: REVENUE_STATUSES },
          startsAt: { gte: range.start, lt: range.end },
        },
        _sum: { price: true },
      }),
      t.service.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    ]);
    const revenueOf = new Map(earned.map((e) => [e.serviceId, Number(e._sum.price ?? 0)]));
    const nameOf = new Map(names.map((x) => [x.id, x.name]));
    return groups.map((g) => ({
      serviceId: g.serviceId,
      name: nameOf.get(g.serviceId) ?? '—',
      bookings: g._count._all,
      revenue: revenueOf.get(g.serviceId) ?? 0,
    }));
  }

  /** Bookings per hour of the (local) day: the 24 hours are always returned. */
  async peakHours(businessId: string, q: ReportRangeQuery): Promise<PeakHour[]> {
    const { tz, range } = await this.context(businessId, q);
    const rows = await this.prisma.$queryRaw<{ hour: number; bookings: number }[]>(
      Prisma.sql`
        SELECT EXTRACT(HOUR FROM ("starts_at" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS hour,
               COUNT(*)::int AS bookings
        FROM "bookings"
        WHERE "business_id" = ${businessId}
          AND "status" <> 'CANCELLED'
          AND "starts_at" >= ${range.start} AND "starts_at" < ${range.end}
        GROUP BY 1`,
    );
    const byHour = new Map(rows.map((r) => [r.hour, r.bookings]));
    return Array.from({ length: 24 }, (_, hour) => ({ hour, bookings: byHour.get(hour) ?? 0 }));
  }

  /** CSV of the bookings of the range (FR-82), times in the business time zone. */
  async bookingsCsv(businessId: string, q: ReportRangeQuery): Promise<string> {
    const { tz, range } = await this.context(businessId, q);
    const rows = await this.prisma.forTenant(businessId).booking.findMany({
      where: { startsAt: { gte: range.start, lt: range.end } },
      include: { customer: true, service: true, staff: true },
      orderBy: { startsAt: 'asc' },
      take: CSV_MAX_ROWS,
    });
    const lines = [
      csvLine([
        'date',
        'time',
        'customer',
        'phone',
        'service',
        'staff',
        'status',
        'source',
        'price',
      ]),
      ...rows.map((b) => {
        const local = DateTime.fromJSDate(b.startsAt, { zone: tz });
        return csvLine([
          local.toFormat('yyyy-MM-dd'),
          local.toFormat('HH:mm'),
          b.customer.name,
          b.customer.phone,
          b.service.name,
          b.staff.displayName,
          b.status,
          b.source,
          Number(b.price),
        ]);
      }),
    ];
    return `${BOM}${lines.join('\r\n')}\r\n`; // BOM: Excel reads Arabic names correctly
  }
}

function daysOf(range: ResolvedRange): string[] {
  const first = DateTime.fromISO(range.from, { zone: 'utc' });
  return Array.from(
    { length: range.days },
    (_, i) => first.plus({ days: i }).toISODate() as string,
  );
}
