import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Page,
  Pagination,
  StaffInput,
  StaffUpdateInput,
  WorkingHoursRow,
} from '@mawid/shared';
import type { Staff } from '@prisma/client';
import { skipTake, toPage } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export interface StaffDto {
  id: string;
  displayName: string;
  photoUrl: string | null;
  active: boolean;
  serviceIds: string[];
}
type StaffWithServices = Staff & { services: { serviceId: string }[] };
const toDto = (s: StaffWithServices): StaffDto => ({
  id: s.id,
  displayName: s.displayName,
  photoUrl: s.photoUrl,
  active: s.active,
  serviceIds: s.services.map((x) => x.serviceId),
});
const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'Staff member not found' });
const withServices = { services: { select: { serviceId: true } } } as const;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Every id sent by the client is checked with the tenant client: ids of another business do not exist for us. */
  private async assertServices(businessId: string, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const found = await this.prisma
      .forTenant(businessId)
      .service.count({ where: { id: { in: unique } } });
    if (found !== unique.length) {
      throw new BadRequestException({
        code: 'UNKNOWN_SERVICE',
        message: 'One of the services does not exist',
      });
    }
  }

  async list(businessId: string, p: Pagination): Promise<Page<StaffDto>> {
    const t = this.prisma.forTenant(businessId);
    const [rows, total] = await Promise.all([
      t.staff.findMany({ orderBy: { displayName: 'asc' }, include: withServices, ...skipTake(p) }),
      t.staff.count(),
    ]);
    return toPage(rows.map(toDto), total, p);
  }

  async get(businessId: string, id: string): Promise<StaffDto> {
    const row = await this.prisma
      .forTenant(businessId)
      .staff.findUnique({ where: { id }, include: withServices });
    if (!row) throw notFound();
    return toDto(row);
  }

  async create(businessId: string, input: StaffInput): Promise<StaffDto> {
    await this.assertServices(businessId, input.serviceIds);
    const row = await this.prisma.forTenant(businessId).staff.create({
      data: {
        displayName: input.displayName,
        active: input.active,
        services: {
          create: [...new Set(input.serviceIds)].map((serviceId) => ({ serviceId, businessId })),
        },
      } as never,
      include: withServices,
    });
    return toDto(row);
  }

  async update(businessId: string, id: string, input: StaffUpdateInput): Promise<StaffDto> {
    await this.get(businessId, id);
    if (input.serviceIds) await this.assertServices(businessId, input.serviceIds);
    const row = await this.prisma.forTenant(businessId).staff.update({
      where: { id },
      data: {
        displayName: input.displayName,
        active: input.active,
        ...(input.serviceIds
          ? {
              services: {
                deleteMany: {},
                create: [...new Set(input.serviceIds)].map((serviceId) => ({
                  serviceId,
                  businessId,
                })),
              },
            }
          : {}),
      },
      include: withServices,
    });
    return toDto(row);
  }

  async remove(businessId: string, id: string): Promise<void> {
    const t = this.prisma.forTenant(businessId);
    const row = await t.staff.findUnique({ where: { id } });
    if (!row) throw notFound();
    if ((await t.booking.count({ where: { staffId: id } })) > 0) {
      throw new ConflictException({
        code: 'IN_USE',
        message: 'This employee has bookings. Deactivate them instead.',
      });
    }
    await t.staff.delete({ where: { id } });
    await this.storage.delete(row.photoUrl ?? '');
  }

  async setPhoto(
    businessId: string,
    id: string,
    file: Express.Multer.File | undefined,
  ): Promise<StaffDto> {
    if (!file)
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Send an image in the "file" field',
      });
    const t = this.prisma.forTenant(businessId);
    const current = await t.staff.findUnique({ where: { id } });
    if (!current) throw notFound();
    const url = await this.storage.saveImage(file.buffer, `${businessId}/staff`);
    const row = await t.staff.update({
      where: { id },
      data: { photoUrl: url },
      include: withServices,
    });
    await this.storage.delete(current.photoUrl ?? '');
    return toDto(row);
  }

  async getWorkingHours(businessId: string, id: string): Promise<WorkingHoursRow[]> {
    await this.get(businessId, id);
    const rows = await this.prisma.forTenant(businessId).workingHours.findMany({
      where: { staffId: id },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map((r) => ({
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      breakStart: r.breakStart,
      breakEnd: r.breakEnd,
    }));
  }

  /** Replaces the whole weekly schedule of the employee in one atomic update. */
  async setWorkingHours(
    businessId: string,
    id: string,
    rows: WorkingHoursRow[],
  ): Promise<WorkingHoursRow[]> {
    await this.get(businessId, id);
    await this.prisma.forTenant(businessId).staff.update({
      where: { id },
      data: { workingHours: { deleteMany: {}, create: rows.map((r) => ({ ...r, businessId })) } },
    });
    return this.getWorkingHours(businessId, id);
  }
}
