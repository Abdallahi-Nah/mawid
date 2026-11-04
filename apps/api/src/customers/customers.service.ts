import { Injectable, NotFoundException } from '@nestjs/common';
import type { ListCustomersQuery, Page, UpdateCustomerInput } from '@mawid/shared';
import type { BookingStatus, Customer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  visitsCount: number;
  noShowCount: number;
  bookingsCount: number;
  lastBookingAt: string | null;
}
export interface CustomerDetail extends CustomerSummary {
  notes: string | null; // private notes of the business
  createdAt: string;
  history: {
    id: string;
    status: BookingStatus;
    startsAt: string;
    price: number;
    serviceName: string;
    staffName: string;
  }[];
}

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'Customer not found' });

type WithStats = Customer & { _count: { bookings: number }; bookings: { startsAt: Date }[] };
const summary = (c: WithStats): CustomerSummary => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  visitsCount: c.visitsCount,
  noShowCount: c.noShowCount,
  bookingsCount: c._count.bookings,
  lastBookingAt: c.bookings[0]?.startsAt.toISOString() ?? null,
});
const withStats = {
  _count: { select: { bookings: true } },
  bookings: { select: { startsAt: true }, orderBy: { startsAt: 'desc' }, take: 1 },
} as const;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, q: ListCustomersQuery): Promise<Page<CustomerSummary>> {
    const t = this.prisma.forTenant(businessId);
    const term = q.q?.trim();
    const where = term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' as const } },
            { phone: { contains: term.replace(/\s+/g, '') } },
            { email: { contains: term, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      t.customer.findMany({
        where,
        include: withStats,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      t.customer.count({ where }),
    ]);
    return { items: rows.map(summary), total, page: q.page, pageSize: q.pageSize };
  }

  async get(businessId: string, id: string): Promise<CustomerDetail> {
    const t = this.prisma.forTenant(businessId);
    const c = await t.customer.findUnique({ where: { id }, include: withStats });
    if (!c) throw notFound();
    const history = await t.booking.findMany({
      where: { customerId: id },
      include: { service: true, staff: true },
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
    return {
      ...summary(c),
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      history: history.map((b) => ({
        id: b.id,
        status: b.status,
        startsAt: b.startsAt.toISOString(),
        price: Number(b.price),
        serviceName: b.service.name,
        staffName: b.staff.displayName,
      })),
    };
  }

  async update(
    businessId: string,
    id: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerDetail> {
    await this.get(businessId, id);
    await this.prisma.forTenant(businessId).customer.update({ where: { id }, data: input });
    return this.get(businessId, id);
  }
}
