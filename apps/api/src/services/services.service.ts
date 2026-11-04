import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Page, Pagination, ServiceInput, ServiceUpdateInput } from '@mawid/shared';
import type { Service } from '@prisma/client';
import { skipTake, toPage } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

export interface ServiceDto extends Omit<Service, 'price'> {
  price: number;
}
const toDto = (s: Service): ServiceDto => ({ ...s, price: Number(s.price) });
const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'Service not found' });

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, p: Pagination): Promise<Page<ServiceDto>> {
    const t = this.prisma.forTenant(businessId);
    const [rows, total] = await Promise.all([
      t.service.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }], ...skipTake(p) }),
      t.service.count(),
    ]);
    return toPage(rows.map(toDto), total, p);
  }

  async get(businessId: string, id: string): Promise<ServiceDto> {
    const row = await this.prisma.forTenant(businessId).service.findUnique({ where: { id } });
    if (!row) throw notFound();
    return toDto(row);
  }

  async create(businessId: string, input: ServiceInput): Promise<ServiceDto> {
    return toDto(await this.prisma.forTenant(businessId).service.create({ data: input as never }));
  }

  async update(businessId: string, id: string, input: ServiceUpdateInput): Promise<ServiceDto> {
    await this.get(businessId, id);
    return toDto(
      await this.prisma.forTenant(businessId).service.update({ where: { id }, data: input }),
    );
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.get(businessId, id);
    const t = this.prisma.forTenant(businessId);
    if ((await t.booking.count({ where: { serviceId: id } })) > 0) {
      throw new ConflictException({
        code: 'IN_USE',
        message: 'This service has bookings. Deactivate it instead.',
      });
    }
    await t.service.delete({ where: { id } });
  }
}
