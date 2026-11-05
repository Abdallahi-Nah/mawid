import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateBookingInput,
  DepositView,
  ListBookingsQuery,
  ManualBookingInput,
  MoveBookingInput,
  Page,
  PublicBookingView,
} from '@mawid/shared';
import {
  Booking,
  BookingStatus,
  Business,
  Customer,
  Payment,
  Prisma,
  Service,
  Staff,
} from '@prisma/client';
import { DateTime } from 'luxon';
import type { AuthUser } from '../common/auth.decorators';
import { businessSuspended } from '../common/suspension.service';
import { ENV, Env } from '../config/env.module';
import { buildIcs, googleCalendarUrl } from '../notifications/ics';
import { calendarEvent } from '../notifications/calendar-event';
import { PaymentProvider } from '../payments/payment-provider';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import { BookingEvents } from './booking-events';
import { assertTransition, OPEN_STATUSES } from './status';

const HOUR = 3_600_000;

type PublicBooking = Booking & {
  service: Service;
  staff: Staff;
  business: Business;
  payments: Payment[];
};
const publicInclude = { service: true, staff: true, business: true, payments: true } as const;
const ownerInclude = { customer: true, service: true, staff: true } as const;
type OwnerBooking = Booking & { customer: Customer; service: Service; staff: Staff };

export interface OwnerBookingView {
  id: string;
  status: BookingStatus;
  source: string;
  startsAt: string;
  endsAt: string;
  price: number;
  notes: string | null;
  customer: { id: string; name: string; phone: string; email: string | null };
  service: { id: string; name: string; durationMin: number };
  staff: { id: string; displayName: string };
}

const slotTaken = (): ConflictException =>
  new ConflictException({
    code: 'SLOT_TAKEN',
    message: 'This slot was just taken. Choose another one.',
  });

/** The PostgreSQL exclusion constraint "no_overlap" fired: someone else holds the slot. */
export function isOverlapError(e: unknown): boolean {
  return (
    (e instanceof Prisma.PrismaClientUnknownRequestError ||
      e instanceof Prisma.PrismaClientKnownRequestError) &&
    /no_overlap|exclusion constraint|23P01/i.test(e.message)
  );
}
/**
 * PostgreSQL found two transactions waiting for each other ("deadlock detected", 40P01). With the anti
 * double-booking constraint this happens when several requests insert the same or overlapping times at once.
 * It is a conflict to retry, never a server error: after a short wait the database gives a clean answer.
 */
export function isDeadlockError(e: unknown): boolean {
  return (
    (e instanceof Prisma.PrismaClientUnknownRequestError ||
      e instanceof Prisma.PrismaClientKnownRequestError) &&
    /deadlock detected|40P01|ShareLock on transaction/i.test(e.message)
  );
}
const isUniqueError = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export const normalizePhone = (p: string): string => p.replace(/\s+/g, '');

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly events: BookingEvents,
    private readonly plans: PlansService,
    private readonly paymentProvider: PaymentProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ----------------------------------------------------------------------------------------------
  // Public: the customer (guest or logged in)
  // ----------------------------------------------------------------------------------------------

  async createPublic(
    input: CreateBookingInput,
    user?: AuthUser,
    source: 'WEB' | 'AI' = 'WEB',
  ): Promise<PublicBookingView> {
    const business = await this.prisma.business.findUnique({ where: { slug: input.businessSlug } });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    if (business.suspendedAt) throw businessSuspended();
    const startsAt = new Date(input.startsAt);
    const date = DateTime.fromJSDate(startsAt, { zone: business.timezone }).toISODate() as string;

    // The requested start must be one of the slots the engine offers right now (hours, breaks, days off, notice).
    const avail = await this.availability.load(business.id, {
      serviceId: input.serviceId,
      staffId: input.staffId,
      date,
    });
    const slot = avail.slots.find((s) => s.start.getTime() === startsAt.getTime());
    if (!slot) throw slotTaken();
    await this.plans.assertCanBook(business.id);
    // "Any employee": try the least busy one first. If another request takes that employee at the same
    // moment (the database refuses the overlap), try the next free employee before giving up.
    const candidates = [...slot.staffIds].sort(
      (a, b) => (avail.dayLoad.get(a) ?? 0) - (avail.dayLoad.get(b) ?? 0),
    );
    let id: string | undefined;
    for (const staffId of candidates) {
      try {
        id = await this.persist(business.id, {
          customer: input.customer,
          userId: user?.role === 'CLIENT' ? user.id : undefined,
          staffId,
          service: avail.service,
          bufferMin: Math.max(avail.service.bufferMin, business.bufferMin),
          // A deposit keeps the booking PENDING until the owner validates the payment.
          deposit: deposit(avail.service),
          startsAt,
          status:
            business.bookingMode === 'AUTO' && !deposit(avail.service) ? 'CONFIRMED' : 'PENDING',
          source,
          notes: input.notes ?? null,
          locale: input.locale ?? business.defaultLocale,
        });
        break;
      } catch (e) {
        const taken =
          e instanceof ConflictException &&
          (e.getResponse() as { code?: string }).code === 'SLOT_TAKEN';
        if (!taken) throw e;
      }
    }
    if (!id) throw slotTaken();
    await this.events.created(id);
    return this.viewByToken((await this.getPublicById(id)).cancelToken);
  }

  async viewByToken(token: string): Promise<PublicBookingView> {
    return this.toView(await this.findByToken(token));
  }

  /** The .ics file of a booking ("Add to calendar"). */
  async icsByToken(token: string): Promise<string> {
    return buildIcs(calendarEvent(await this.findByToken(token)));
  }

  async cancelByToken(token: string): Promise<PublicBookingView> {
    const b = await this.findOpenInWindow(token);
    await this.prisma
      .forTenant(b.businessId)
      .booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
    await this.events.cancelled(b.id, 'customer');
    return this.viewByToken(token);
  }

  async rescheduleByToken(token: string, startsAtIso: string): Promise<PublicBookingView> {
    const b = await this.findOpenInWindow(token);
    const startsAt = new Date(startsAtIso);
    const date = DateTime.fromJSDate(startsAt, { zone: b.business.timezone }).toISODate() as string;
    // The booking itself must not block its own new time, so it is left out of the busy list.
    const avail = await this.availability.load(
      b.businessId,
      { serviceId: b.serviceId, staffId: b.staffId, date },
      { excludeBookingId: b.id },
    );
    if (!avail.slots.some((s) => s.start.getTime() === startsAt.getTime())) throw slotTaken();
    await this.move(b.businessId, b.id, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + b.service.durationMin * 60_000),
    });
    await this.events.rescheduled(b.id, 'customer');
    return this.viewByToken(token);
  }

  // ----------------------------------------------------------------------------------------------
  // Owner and employees
  // ----------------------------------------------------------------------------------------------

  async list(businessId: string, q: ListBookingsQuery): Promise<Page<OwnerBookingView>> {
    const t = this.prisma.forTenant(businessId);
    const where: Prisma.BookingWhereInput = {
      ...(q.from ? { endsAt: { gt: new Date(q.from) } } : {}),
      ...(q.to ? { startsAt: { lt: new Date(q.to) } } : {}),
      ...(q.staffId ? { staffId: q.staffId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      t.booking.findMany({
        where,
        include: ownerInclude,
        orderBy: { startsAt: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      t.booking.count({ where }),
    ]);
    return { items: rows.map(ownerView), total, page: q.page, pageSize: q.pageSize };
  }

  async get(businessId: string, id: string): Promise<OwnerBookingView> {
    const row = await this.prisma
      .forTenant(businessId)
      .booking.findUnique({ where: { id }, include: ownerInclude });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    return ownerView(row);
  }

  /** Booking made by the owner (phone or walk-in). Working hours are not enforced: the owner may accept extra time. */
  async createManual(businessId: string, input: ManualBookingInput): Promise<OwnerBookingView> {
    const t = this.prisma.forTenant(businessId);
    const service = await t.service.findFirst({ where: { id: input.serviceId, active: true } });
    if (!service)
      throw new NotFoundException({ code: 'SERVICE_NOT_FOUND', message: 'Service not found' });
    const staff = await t.staff.findFirst({
      where: { id: input.staffId, active: true, services: { some: { serviceId: service.id } } },
    });
    if (!staff)
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'This employee does not do this service',
      });
    const business = await t.business.findUnique({ where: { id: businessId } });
    await this.plans.assertCanBook(businessId);
    const id = await this.persist(businessId, {
      customer: input.customer,
      staffId: staff.id,
      service,
      bufferMin: Math.max(service.bufferMin, business?.bufferMin ?? 0),
      deposit: null, // the owner decides for a booking made by phone or at the desk
      startsAt: new Date(input.startsAt),
      status: input.status,
      source: 'MANUAL',
      notes: input.notes ?? null,
      locale: business?.defaultLocale ?? 'ar',
    });
    await this.events.created(id);
    return this.get(businessId, id);
  }

  /** Move a booking (drag and drop, or the customer's reschedule). Overlaps are refused by the database. */
  async moveByOwner(
    businessId: string,
    id: string,
    input: MoveBookingInput,
  ): Promise<OwnerBookingView> {
    const t = this.prisma.forTenant(businessId);
    const current = await t.booking.findUnique({ where: { id }, include: { service: true } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    if (!OPEN_STATUSES.includes(current.status)) {
      throw new ConflictException({
        code: 'BOOKING_CLOSED',
        message: 'This booking can no longer be changed',
      });
    }
    if (input.staffId && input.staffId !== current.staffId) {
      const ok = await t.staff.findFirst({
        where: {
          id: input.staffId,
          active: true,
          services: { some: { serviceId: current.serviceId } },
        },
      });
      if (!ok)
        throw new NotFoundException({
          code: 'STAFF_NOT_FOUND',
          message: 'This employee does not do this service',
        });
    }
    const startsAt = new Date(input.startsAt);
    await this.move(businessId, id, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + current.service.durationMin * 60_000),
      staffId: input.staffId,
    });
    await this.events.rescheduled(id, 'business');
    return this.get(businessId, id);
  }

  async updateStatus(
    businessId: string,
    id: string,
    status: BookingStatus,
  ): Promise<OwnerBookingView> {
    const t = this.prisma.forTenant(businessId);
    const current = await t.booking.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    assertTransition(current.status, status);
    if (
      status === 'CONFIRMED' &&
      (await t.payment.count({ where: { bookingId: id, status: { not: 'PAID' } } })) > 0
    ) {
      // The deposit must be validated first (this also confirms the booking).
      throw new ConflictException({
        code: 'DEPOSIT_REQUIRED',
        message: 'Validate the deposit payment to confirm this booking',
      });
    }
    if ((status === 'COMPLETED' || status === 'NO_SHOW') && current.startsAt > new Date()) {
      throw new ConflictException({
        code: 'TOO_EARLY',
        message: 'The appointment has not started yet',
      });
    }
    await t.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { status } });
      if (status === 'COMPLETED') {
        await tx.customer.update({
          where: { id: current.customerId },
          data: { visitsCount: { increment: 1 } },
        });
      }
      if (status === 'NO_SHOW') {
        await tx.customer.update({
          where: { id: current.customerId },
          data: { noShowCount: { increment: 1 } },
        });
      }
    });
    if (status === 'CANCELLED') await this.events.cancelled(id, 'business');
    if (status === 'CONFIRMED') await this.events.confirmed(id);
    if (status === 'COMPLETED') await this.events.completed(id);
    return this.get(businessId, id);
  }

  // ----------------------------------------------------------------------------------------------
  // Internals
  // ----------------------------------------------------------------------------------------------

  /** Creates the customer (or updates the existing one with the same phone) and the booking in one transaction. */
  private async persist(
    businessId: string,
    d: {
      customer: { name: string; phone: string; email?: string };
      userId?: string;
      staffId: string;
      service: Service;
      /** Preparation time kept after the appointment (business default or service, the longer). */
      bufferMin: number;
      /** Deposit to collect (a PENDING payment is created with the booking), or null. */
      deposit: number | null;
      startsAt: Date;
      status: BookingStatus;
      source: 'WEB' | 'AI' | 'MANUAL';
      notes: string | null;
      locale: string;
    },
  ): Promise<string> {
    const phone = normalizePhone(d.customer.phone);
    const email = d.customer.email?.trim() || null;
    // Two first-time bookings with the same phone can race on the customer row: try again once.
    for (let attempt = 0; ; attempt++) {
      try {
        // This one write goes through the plain client (a transaction on the tenant client cannot run the lock
        // below). Every row it writes carries the business id explicitly, and the customer is found by
        // (business id, phone), so nothing can cross to another business.
        return await this.prisma.$transaction(
          async (tx) => {
            // One booking at a time per employee. Without it, many simultaneous inserts for the same time wait
            // for each other and PostgreSQL has to break the deadlock after a full second. With it, the second
            // request simply finds the first booking and gets the clean "slot taken" answer at once.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${d.staffId}, 0))`;
            const customer = await tx.customer.upsert({
              where: { businessId_phone: { businessId, phone } },
              create: { businessId, name: d.customer.name, phone, email, userId: d.userId },
              update: {
                name: d.customer.name,
                ...(email ? { email } : {}),
                ...(d.userId ? { userId: d.userId } : {}),
              },
            });
            const booking = await tx.booking.create({
              data: {
                businessId,
                customerId: customer.id,
                staffId: d.staffId,
                serviceId: d.service.id,
                startsAt: d.startsAt,
                endsAt: new Date(d.startsAt.getTime() + d.service.durationMin * 60_000),
                status: d.status,
                source: d.source,
                price: d.service.price,
                bufferMin: d.bufferMin,
                notes: d.notes,
                locale: d.locale,
              },
            });
            if (d.deposit) {
              await tx.payment.create({
                data: {
                  businessId,
                  bookingId: booking.id,
                  method: 'MOBILE',
                  amount: d.deposit,
                  status: 'PENDING',
                  provider: this.paymentProvider.name,
                },
              });
            }
            return booking.id;
            // A burst of bookings can wait for a free database connection: wait up to 10 s instead of failing at 2 s.
          },
          { maxWait: 10_000, timeout: 10_000 },
        );
      } catch (e) {
        if (isOverlapError(e)) throw slotTaken();
        if (isUniqueError(e) && attempt < 2) continue;
        if (isDeadlockError(e)) {
          // The other request holds the slot (or is about to): wait a little, try again, and if it keeps
          // colliding the slot is simply taken.
          if (attempt >= 4) throw slotTaken();
          await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
  }

  /** Changes the time (and maybe the employee) in one UPDATE; the database refuses an overlap. */
  private async move(
    businessId: string,
    id: string,
    d: { startsAt: Date; endsAt: Date; staffId?: string },
  ): Promise<void> {
    try {
      await this.prisma.forTenant(businessId).booking.update({
        where: { id },
        data: {
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          ...(d.staffId ? { staffId: d.staffId } : {}),
        },
      });
    } catch (e) {
      if (isOverlapError(e)) throw slotTaken();
      throw e;
    }
  }

  private async findByToken(token: string): Promise<PublicBooking> {
    // The token is the secret: this is the one place where a booking is found without a business id.
    const b = await this.prisma.booking.findUnique({
      where: { cancelToken: token },
      include: publicInclude,
    });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    return b;
  }

  private async getPublicById(id: string): Promise<PublicBooking> {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: publicInclude });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    return b;
  }

  /** The customer can change a booking only while it is open and before the business's cancel limit. */
  private async findOpenInWindow(token: string): Promise<PublicBooking> {
    const b = await this.findByToken(token);
    if (!OPEN_STATUSES.includes(b.status)) {
      throw new ConflictException({
        code: 'BOOKING_CLOSED',
        message: 'This booking can no longer be changed',
      });
    }
    if (!withinWindow(b)) {
      throw new ForbiddenException({
        code: 'CHANGE_WINDOW_PASSED',
        message: `Too late to change this booking (limit: ${b.business.cancelLimitHours} h before)`,
      });
    }
    return b;
  }

  private toView(b: PublicBooking): PublicBookingView {
    return {
      id: b.id,
      status: b.status,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      price: Number(b.price),
      cancelToken: b.cancelToken,
      service: { id: b.service.id, name: b.service.name, durationMin: b.service.durationMin },
      staff: { id: b.staff.id, displayName: b.staff.displayName },
      business: {
        name: b.business.name,
        slug: b.business.slug,
        timezone: b.business.timezone,
        address: b.business.address,
        phone: b.business.phone,
      },
      canChange: OPEN_STATUSES.includes(b.status) && withinWindow(b),
      cancelLimitHours: b.business.cancelLimitHours,
      icsUrl: `${this.env.API_URL}/public/bookings/${b.cancelToken}/calendar.ics`,
      googleCalendarUrl: googleCalendarUrl(calendarEvent(b)),
      deposit: depositView(b),
    };
  }
}

const deposit = (s: Service): number | null =>
  s.depositAmount && Number(s.depositAmount) > 0 ? Number(s.depositAmount) : null;

function depositView(b: PublicBooking): DepositView | null {
  const p = b.payments[0];
  if (!p) return null;
  return {
    amount: Number(p.amount),
    status: p.status,
    submitted: !!(p.reference || p.proofUrl),
    instructions: b.business.paymentInstructions,
  };
}

const withinWindow = (b: { startsAt: Date; business: Business }, now = new Date()): boolean =>
  now.getTime() <= b.startsAt.getTime() - b.business.cancelLimitHours * HOUR;

const ownerView = (b: OwnerBooking): OwnerBookingView => ({
  id: b.id,
  status: b.status,
  source: b.source,
  startsAt: b.startsAt.toISOString(),
  endsAt: b.endsAt.toISOString(),
  price: Number(b.price),
  notes: b.notes,
  customer: {
    id: b.customer.id,
    name: b.customer.name,
    phone: b.customer.phone,
    email: b.customer.email,
  },
  service: { id: b.service.id, name: b.service.name, durationMin: b.service.durationMin },
  staff: { id: b.staff.id, displayName: b.staff.displayName },
});
