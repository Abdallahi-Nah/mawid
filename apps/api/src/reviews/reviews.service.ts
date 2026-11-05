import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateReviewInput,
  OwnerReview,
  Page,
  Pagination,
  PublicReview,
  PublicReviewsPage,
  ReviewFormView,
} from '@mawid/shared';
import { Prisma, Review } from '@prisma/client';
import { businessSuspended } from '../common/suspension.service';
import { PrismaService } from '../prisma/prisma.service';

/** "Fatima Zahra Mint Ali" -> "Fatima Z." : the public page never shows a full name. */
export function publicAuthor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const initial = parts[1] ? ` ${Array.from(parts[1])[0]}.` : '';
  return `${parts[0]}${initial}`;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const toPublic = (r: Review & { booking: { customer: { name: string } } }): PublicReview => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment,
  author: publicAuthor(r.booking.customer.name),
  reply: r.reply,
  createdAt: r.createdAt.toISOString(),
});
const withAuthor = { booking: { select: { customer: { select: { name: true } } } } } as const;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------------------------
  // Customer: the link of the email (the review token is the secret)
  // ---------------------------------------------------------------------------------------------

  async form(token: string): Promise<ReviewFormView> {
    const b = await this.byToken(token);
    return {
      businessName: b.business.name,
      serviceName: b.service.name,
      startsAt: b.startsAt.toISOString(),
      timezone: b.business.timezone,
      reviewed: !!b.review,
    };
  }

  /** One review per booking, only after the visit (COMPLETED). */
  async submit(token: string, input: CreateReviewInput): Promise<ReviewFormView> {
    const b = await this.byToken(token);
    if (b.status !== 'COMPLETED') {
      throw new ConflictException({
        code: 'NOT_COMPLETED',
        message: 'You can rate a visit only after it took place',
      });
    }
    if (b.review) throw reviewExists();
    try {
      await this.prisma.forTenant(b.businessId).review.create({
        data: {
          businessId: b.businessId,
          bookingId: b.id,
          rating: input.rating,
          comment: input.comment ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw reviewExists();
      throw e;
    }
    return this.form(token);
  }

  private async byToken(token: string) {
    // The token is the secret: the one place where a booking is found without a business id.
    const b = await this.prisma.booking.findUnique({
      where: { reviewToken: token },
      include: { business: true, service: true, review: true },
    });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Review link not found' });
    return b;
  }

  // ---------------------------------------------------------------------------------------------
  // Public page
  // ---------------------------------------------------------------------------------------------

  async stats(businessId: string): Promise<{ ratingAverage: number | null; reviewCount: number }> {
    const a = await this.prisma
      .forTenant(businessId)
      .review.aggregate({ _avg: { rating: true }, _count: { _all: true } });
    return {
      ratingAverage: a._avg.rating === null ? null : round1(a._avg.rating),
      reviewCount: a._count._all,
    };
  }

  async publicList(slug: string, p: Pagination): Promise<PublicReviewsPage> {
    const business = await this.prisma.business.findUnique({
      where: { slug },
      select: { id: true, suspendedAt: true },
    });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    if (business.suspendedAt) throw businessSuspended();
    const t = this.prisma.forTenant(business.id);
    const [rows, stats] = await Promise.all([
      t.review.findMany({
        include: withAuthor,
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      this.stats(business.id),
    ]);
    return {
      items: rows.map(toPublic),
      total: stats.reviewCount,
      page: p.page,
      pageSize: p.pageSize,
      ratingAverage: stats.ratingAverage,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Owner
  // ---------------------------------------------------------------------------------------------

  async ownerList(businessId: string, p: Pagination): Promise<Page<OwnerReview>> {
    const t = this.prisma.forTenant(businessId);
    const [rows, total] = await Promise.all([
      t.review.findMany({
        include: { booking: { include: { customer: true, service: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
      t.review.count(),
    ]);
    return {
      items: rows.map((r) => ({
        ...toPublic(r),
        customerName: r.booking.customer.name,
        serviceName: r.booking.service.name,
        repliedAt: r.repliedAt?.toISOString() ?? null,
      })),
      total,
      page: p.page,
      pageSize: p.pageSize,
    };
  }

  /** The owner answers (or edits the answer to) a review of their own business. */
  async reply(businessId: string, id: string, reply: string): Promise<OwnerReview> {
    const t = this.prisma.forTenant(businessId);
    const current = await t.review.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Review not found' });
    await t.review.update({ where: { id }, data: { reply, repliedAt: new Date() } });
    const row = await t.review.findUniqueOrThrow({
      where: { id },
      include: { booking: { include: { customer: true, service: true } } },
    });
    return {
      ...toPublic(row),
      customerName: row.booking.customer.name,
      serviceName: row.booking.service.name,
      repliedAt: row.repliedAt?.toISOString() ?? null,
    };
  }
}

const reviewExists = (): ConflictException =>
  new ConflictException({ code: 'REVIEW_EXISTS', message: 'This visit was already rated' });
