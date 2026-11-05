import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PublicBusiness } from '@mawid/shared';
import { z } from 'zod';
import { Public } from '../common/auth.decorators';
import { businessSuspended } from '../common/suspension.service';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';

const slugPipe = new ZodPipe(z.string().min(1).max(60));

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewsService,
  ) {}

  @Public()
  @Get('sitemap')
  @ApiOperation({
    summary: 'Slugs of the public pages (for the sitemap). Suspended businesses are left out.',
  })
  async sitemap(): Promise<{ slug: string; updatedAt: string }[]> {
    const rows = await this.prisma.business.findMany({
      where: { suspendedAt: null },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
  }

  @Public()
  @Get('businesses/:slug')
  @ApiOperation({
    summary: 'Public page data: business, active services, active staff (no private data)',
  })
  async business(@Param('slug', slugPipe) slug: string): Promise<PublicBusiness> {
    const b = await this.prisma.business.findUnique({ where: { slug } });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    if (b.suspendedAt) throw businessSuspended();
    const t = this.prisma.forTenant(b.id);
    const [services, staff, rating] = await Promise.all([
      t.service.findMany({
        where: { active: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      t.staff.findMany({
        where: { active: true },
        orderBy: { displayName: 'asc' },
        include: {
          services: { select: { serviceId: true } },
          workingHours: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
        },
      }),
      this.reviews.stats(b.id),
    ]);
    const activeIds = new Set(services.map((s) => s.id));
    return {
      name: b.name,
      slug: b.slug,
      logoUrl: b.logoUrl,
      description: b.description,
      address: b.address,
      phone: b.phone,
      category: b.category,
      timezone: b.timezone,
      defaultLocale: b.defaultLocale,
      brandColor: b.brandColor,
      bookingMode: b.bookingMode,
      ratingAverage: rating.ratingAverage,
      reviewCount: rating.reviewCount,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        price: Number(s.price),
        category: s.category,
        depositAmount: s.depositAmount === null ? null : Number(s.depositAmount),
      })),
      staff: staff.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        photoUrl: s.photoUrl,
        serviceIds: s.services.map((x) => x.serviceId).filter((id) => activeIds.has(id)),
        workingHours: s.workingHours.map((w) => ({
          weekday: w.weekday,
          startTime: w.startTime,
          endTime: w.endTime,
        })),
      })),
    };
  }
}
