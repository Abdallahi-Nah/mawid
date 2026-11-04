import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Page, Pagination, TimeOffInput, TimeOffUpdateInput } from '@mawid/shared';
import { skipTake, toPage } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'Time off not found' });

@Injectable()
export class TimeOffService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStaff(businessId: string, staffId: string | null | undefined): Promise<void> {
    if (!staffId) return;
    if (!(await this.prisma.forTenant(businessId).staff.findUnique({ where: { id: staffId } }))) {
      throw new BadRequestException({
        code: 'UNKNOWN_STAFF',
        message: 'This employee does not exist',
      });
    }
  }

  async list(businessId: string, p: Pagination, range: { from?: string; to?: string }) {
    const t = this.prisma.forTenant(businessId);
    // Overlapping the requested range.
    const where = {
      ...(range.to ? { startsAt: { lt: new Date(range.to) } } : {}),
      ...(range.from ? { endsAt: { gt: new Date(range.from) } } : {}),
    };
    const [rows, total] = await Promise.all([
      t.timeOff.findMany({ where, orderBy: { startsAt: 'asc' }, ...skipTake(p) }),
      t.timeOff.count({ where }),
    ]);
    return toPage(rows, total, p) satisfies Page<(typeof rows)[number]>;
  }

  async create(businessId: string, input: TimeOffInput) {
    await this.assertStaff(businessId, input.staffId);
    return this.prisma.forTenant(businessId).timeOff.create({
      data: {
        staffId: input.staffId ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        reason: input.reason ?? null,
      } as never,
    });
  }

  async update(businessId: string, id: string, input: TimeOffUpdateInput) {
    const t = this.prisma.forTenant(businessId);
    const current = await t.timeOff.findUnique({ where: { id } });
    if (!current) throw notFound();
    await this.assertStaff(businessId, input.staffId);
    const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : current.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ path: 'endsAt', message: 'endBeforeStart' }],
      });
    }
    return t.timeOff.update({
      where: { id },
      data: {
        startsAt,
        endsAt,
        ...(input.staffId !== undefined ? { staffId: input.staffId } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
    });
  }

  async remove(businessId: string, id: string): Promise<void> {
    const t = this.prisma.forTenant(businessId);
    if (!(await t.timeOff.findUnique({ where: { id } }))) throw notFound();
    await t.timeOff.delete({ where: { id } });
  }
}
