import { Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  paginationSchema,
  type InAppNotification,
  type NotificationType,
  type Page,
  type Pagination,
} from '@mawid/shared';
import { CurrentTenant, Roles } from '../common/auth.decorators';
import { idPipe } from '../common/params';
import { skipTake, toPage } from '../common/pagination';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('notifications')
@ApiCookieAuth()
@Roles('OWNER', 'STAFF')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'In-app alerts of my business (the bell), newest first, with the unread count',
  })
  async list(
    @CurrentTenant() businessId: string,
    @Query(new ZodPipe(paginationSchema)) p: Pagination,
  ): Promise<Page<InAppNotification> & { unreadCount: number }> {
    const t = this.prisma.forTenant(businessId);
    const where = { channel: 'IN_APP' as const };
    const [rows, total, unreadCount] = await Promise.all([
      t.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { booking: { include: { customer: true, service: true } } },
        ...skipTake(p),
      }),
      t.notification.count({ where }),
      t.notification.count({ where: { ...where, readAt: null } }),
    ]);
    const items = rows.map((n) => ({
      id: n.id,
      type: n.type as NotificationType,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
      booking: {
        id: n.booking.id,
        startsAt: n.booking.startsAt.toISOString(),
        customerName: n.booking.customer.name,
        serviceName: n.booking.service.name,
      },
    }));
    return { ...toPage(items, total, p), unreadCount };
  }

  @HttpCode(204)
  @Post('read-all')
  @ApiOperation({ summary: 'Mark every alert as read' })
  async readAll(@CurrentTenant() businessId: string): Promise<void> {
    await this.prisma.forTenant(businessId).notification.updateMany({
      where: { channel: 'IN_APP', readAt: null },
      data: { readAt: new Date() },
    });
  }

  @HttpCode(204)
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one alert as read' })
  async read(@CurrentTenant() businessId: string, @Param('id', idPipe) id: string): Promise<void> {
    // update() on a row of another business throws "not found": the tenant filter hides it.
    await this.prisma
      .forTenant(businessId)
      .notification.update({ where: { id }, data: { readAt: new Date() } });
  }
}
