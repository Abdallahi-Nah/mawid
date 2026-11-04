import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PublicBusiness } from '@mawid/shared';
import { z } from 'zod';
import { Public } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const slugPipe = new ZodPipe(z.string().min(1).max(60));

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('businesses/:slug')
  @ApiOperation({
    summary: 'Public page data: business, active services, active staff (no private data)',
  })
  async business(@Param('slug', slugPipe) slug: string): Promise<PublicBusiness> {
    const b = await this.prisma.business.findUnique({ where: { slug } });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    const t = this.prisma.forTenant(b.id);
    const [services, staff] = await Promise.all([
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
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMin: s.durationMin,
        price: Number(s.price),
        category: s.category,
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
