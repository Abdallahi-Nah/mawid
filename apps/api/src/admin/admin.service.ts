import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminAiUsage,
  AdminBusiness,
  AdminListBusinessesQuery,
  AdminStats,
  Page,
} from '@mawid/shared';
import { Prisma } from '@prisma/client';
import { SuspensionService } from '../common/suspension.service';
import { PrismaService } from '../prisma/prisma.service';
import { estimateCostUsd } from './ai-pricing';

/** First instant of a UTC month ("YYYY-MM", default: now) and of the next one. */
export function monthBounds(
  month?: string,
  now = new Date(),
): { label: string; from: Date; to: Date } {
  const [y, m] = month
    ? month.split('-').map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  return { label: `${y}-${String(m).padStart(2, '0')}`, from, to };
}

/**
 * The one place that looks at all businesses. It uses PrismaService directly (no tenant filter), and it is
 * reachable only by the ADMIN role (see AdminController).
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suspension: SuspensionService,
  ) {}

  async listBusinesses(q: AdminListBusinessesQuery): Promise<Page<AdminBusiness>> {
    const where: Prisma.BusinessWhereInput = {
      ...(q.plan ? { plan: q.plan } : {}),
      ...(q.suspended ? { suspendedAt: q.suspended === 'true' ? { not: null } : null } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { slug: { contains: q.q, mode: 'insensitive' } },
              { users: { some: { role: 'OWNER', email: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const { from, to } = monthBounds();
    const [rows, total] = await Promise.all([
      this.prisma.business.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          users: { where: { role: 'OWNER' }, select: { email: true }, take: 1 },
          _count: { select: { staff: true } },
        },
      }),
      this.prisma.business.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const [bookings, ai] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids }, createdAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
      this.prisma.aiLog.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids }, createdAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
    ]);
    const bookingsOf = new Map(bookings.map((b) => [b.businessId, b._count._all]));
    const aiOf = new Map(ai.map((a) => [a.businessId, a._count._all]));
    return {
      items: rows.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        plan: b.plan,
        suspendedAt: b.suspendedAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
        ownerEmail: b.users[0]?.email ?? null,
        staffCount: b._count.staff,
        bookingsThisMonth: bookingsOf.get(b.id) ?? 0,
        aiCallsThisMonth: aiOf.get(b.id) ?? 0,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async setSuspended(id: string, suspended: boolean): Promise<AdminBusiness> {
    await this.exists(id);
    await this.prisma.business.update({
      where: { id },
      data: { suspendedAt: suspended ? new Date() : null },
    });
    this.suspension.invalidate(id);
    return this.one(id);
  }

  async setPlan(id: string, plan: 'FREE' | 'PRO' | 'BUSINESS'): Promise<AdminBusiness> {
    await this.exists(id);
    await this.prisma.business.update({ where: { id }, data: { plan } });
    return this.one(id);
  }

  async stats(): Promise<AdminStats> {
    const { label, from, to } = monthBounds();
    const [total, suspended, plans, users, bookingsTotal, bookingsMonth, usage] = await Promise.all(
      [
        this.prisma.business.count(),
        this.prisma.business.count({ where: { suspendedAt: { not: null } } }),
        this.prisma.business.groupBy({ by: ['plan'], _count: { _all: true } }),
        this.prisma.user.count(),
        this.prisma.booking.count(),
        this.prisma.booking.count({ where: { createdAt: { gte: from, lt: to } } }),
        this.prisma.aiLog.groupBy({
          by: ['model'],
          where: { createdAt: { gte: from, lt: to } },
          _count: { _all: true },
          _sum: { tokensIn: true, tokensOut: true },
        }),
      ],
    );
    const byPlan: Record<string, number> = { FREE: 0, PRO: 0, BUSINESS: 0 };
    for (const p of plans) byPlan[p.plan] = p._count._all;
    let calls = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let cost = 0;
    for (const u of usage) {
      const i = u._sum.tokensIn ?? 0;
      const o = u._sum.tokensOut ?? 0;
      calls += u._count._all;
      tokensIn += i;
      tokensOut += o;
      cost += estimateCostUsd(u.model, i, o);
    }
    return {
      businesses: { total, active: total - suspended, suspended, byPlan },
      users,
      bookings: { total: bookingsTotal, thisMonth: bookingsMonth },
      ai: { month: label, calls, tokensIn, tokensOut, estimatedCostUsd: round(cost) },
    };
  }

  /** AI calls, tokens and estimated cost per business for a month, most expensive first. */
  async aiUsage(month?: string): Promise<AdminAiUsage[]> {
    const { from, to } = monthBounds(month);
    const groups = await this.prisma.aiLog.groupBy({
      by: ['businessId', 'model'],
      where: { createdAt: { gte: from, lt: to } },
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true },
    });
    const errors = await this.prisma.aiLog.groupBy({
      by: ['businessId'],
      where: { createdAt: { gte: from, lt: to }, error: { not: null } },
      _count: { _all: true },
    });
    const errorsOf = new Map(errors.map((e) => [e.businessId, e._count._all]));
    const byBusiness = new Map<string, AdminAiUsage>();
    const names = new Map(
      (
        await this.prisma.business.findMany({
          where: { id: { in: [...new Set(groups.map((g) => g.businessId))] } },
          select: { id: true, name: true, slug: true },
        })
      ).map((b) => [b.id, b]),
    );
    for (const g of groups) {
      const b = names.get(g.businessId);
      const row = byBusiness.get(g.businessId) ?? {
        businessId: g.businessId,
        name: b?.name ?? '—',
        slug: b?.slug ?? '',
        calls: 0,
        errors: errorsOf.get(g.businessId) ?? 0,
        tokensIn: 0,
        tokensOut: 0,
        estimatedCostUsd: 0,
      };
      const i = g._sum.tokensIn ?? 0;
      const o = g._sum.tokensOut ?? 0;
      row.calls += g._count._all;
      row.tokensIn += i;
      row.tokensOut += o;
      row.estimatedCostUsd += estimateCostUsd(g.model, i, o);
      byBusiness.set(g.businessId, row);
    }
    return [...byBusiness.values()]
      .map((r) => ({ ...r, estimatedCostUsd: round(r.estimatedCostUsd) }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.calls - a.calls);
  }

  private async exists(id: string): Promise<void> {
    const b = await this.prisma.business.findUnique({ where: { id }, select: { id: true } });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
  }

  private async one(id: string): Promise<AdminBusiness> {
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id },
      include: {
        users: { where: { role: 'OWNER' }, select: { email: true }, take: 1 },
        _count: { select: { staff: true } },
      },
    });
    const { from, to } = monthBounds();
    const [bookings, ai] = await Promise.all([
      this.prisma.booking.count({ where: { businessId: id, createdAt: { gte: from, lt: to } } }),
      this.prisma.aiLog.count({ where: { businessId: id, createdAt: { gte: from, lt: to } } }),
    ]);
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      plan: b.plan,
      suspendedAt: b.suspendedAt?.toISOString() ?? null,
      createdAt: b.createdAt.toISOString(),
      ownerEmail: b.users[0]?.email ?? null,
      staffCount: b._count.staff,
      bookingsThisMonth: bookings,
      aiCallsThisMonth: ai,
    };
  }
}

const round = (n: number): number => Math.round(n * 10_000) / 10_000;
