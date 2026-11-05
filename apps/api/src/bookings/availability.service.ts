import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Business, Service } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { computeSlots, FreeSlot } from '../availability/availability.engine';

export interface Availability {
  business: Business;
  service: Service;
  staff: { id: string; displayName: string }[];
  slots: FreeSlot[];
  /** Bookings already on that local day, per employee ("any employee" gives the job to the least busy one). */
  dayLoad: Map<string, number>;
}

const DAY_MS = 86_400_000;

/** Loads what the engine needs from the database (always through the tenant client) and runs it. */
@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    businessId: string,
    q: { serviceId: string; staffId?: string | null; date: string },
    opts: { excludeBookingId?: string; now?: Date } = {},
  ): Promise<Availability> {
    const t = this.prisma.forTenant(businessId);
    const business = await t.business.findUnique({ where: { id: businessId } });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    const service = await t.service.findFirst({ where: { id: q.serviceId, active: true } });
    if (!service)
      throw new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'Service not found' });

    const day = DateTime.fromISO(q.date, { zone: business.timezone });
    if (!day.isValid)
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid date' });

    const staffRows = await t.staff.findMany({
      where: {
        active: true,
        services: { some: { serviceId: service.id } },
        ...(q.staffId ? { id: q.staffId } : {}),
      },
      include: { workingHours: true },
      orderBy: { displayName: 'asc' },
    });
    if (q.staffId && staffRows.length === 0) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'This employee does not do this service',
      });
    }

    // One day before and after: bookings and days off that cross midnight still count.
    const from = new Date(day.startOf('day').toMillis() - DAY_MS);
    const to = new Date(day.endOf('day').toMillis() + DAY_MS);
    const staffIds = staffRows.map((s) => s.id);
    const [timeOff, bookings] = await Promise.all([
      t.timeOff.findMany({ where: { startsAt: { lt: to }, endsAt: { gt: from } } }),
      t.booking.findMany({
        where: {
          staffId: { in: staffIds },
          status: { not: 'CANCELLED' },
          startsAt: { lt: to },
          endsAt: { gt: from },
          ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
        },
        select: { staffId: true, startsAt: true, endsAt: true, bufferMin: true },
      }),
    ]);

    const slots = computeSlots({
      date: q.date,
      timezone: business.timezone,
      now: opts.now ?? new Date(),
      // The business default and the service's own need: the longer one wins.
      service: {
        durationMin: service.durationMin,
        bufferMin: Math.max(service.bufferMin, business.bufferMin),
      },
      staff: staffRows.map((s) => ({
        id: s.id,
        workingHours: s.workingHours,
        timeOff: timeOff
          .filter((o) => o.staffId === s.id)
          .map((o) => ({ start: o.startsAt, end: o.endsAt })),
        bookings: bookings
          .filter((b) => b.staffId === s.id)
          .map((b) => ({ start: b.startsAt, end: b.endsAt, bufferMin: b.bufferMin })),
      })),
      businessTimeOff: timeOff
        .filter((o) => o.staffId === null)
        .map((o) => ({ start: o.startsAt, end: o.endsAt })),
      stepMin: business.slotStepMin,
      minNoticeHours: business.minNoticeHours,
      maxDaysAhead: business.maxDaysAhead,
    });

    const dayStart = day.startOf('day').toMillis();
    const dayEnd = day.endOf('day').toMillis();
    const dayLoad = new Map(staffIds.map((id) => [id, 0]));
    for (const b of bookings) {
      const s = b.startsAt.getTime();
      if (s >= dayStart && s <= dayEnd) dayLoad.set(b.staffId, (dayLoad.get(b.staffId) ?? 0) + 1);
    }
    return {
      business,
      service,
      staff: staffRows.map((s) => ({ id: s.id, displayName: s.displayName })),
      slots,
      dayLoad,
    };
  }
}
