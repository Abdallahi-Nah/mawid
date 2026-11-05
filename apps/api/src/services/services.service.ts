import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page, Pagination, ServiceInput, ServiceUpdateInput } from '@mawid/shared';
import type { Service } from '@prisma/client';
import { skipTake, toPage } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

export interface ServiceDto extends Omit<Service, 'price' | 'depositAmount'> {
  price: number;
  depositAmount: number | null;
}
const toDto = (s: Service): ServiceDto => ({
  ...s,
  price: Number(s.price),
  depositAmount: s.depositAmount === null ? null : Number(s.depositAmount),
});
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

  /** A deposit can never be more than the price. 0 or null means no deposit. */
  private checkDeposit(price: number, deposit: number | null | undefined): number | null {
    if (!deposit) return null;
    if (deposit > price) {
      throw new BadRequestException({
        code: 'DEPOSIT_TOO_HIGH',
        message: 'The deposit cannot be more than the price',
      });
    }
    return deposit;
  }

  async create(businessId: string, input: ServiceInput): Promise<ServiceDto> {
    input = { ...input, depositAmount: this.checkDeposit(input.price, input.depositAmount) };
    return toDto(await this.prisma.forTenant(businessId).service.create({ data: input as never }));
  }

  async update(businessId: string, id: string, input: ServiceUpdateInput): Promise<ServiceDto> {
    const current = await this.get(businessId, id);
    const data = { ...input };
    if (input.depositAmount !== undefined || input.price !== undefined) {
      const price = input.price ?? current.price;
      const deposit =
        input.depositAmount === undefined ? current.depositAmount : input.depositAmount;
      data.depositAmount = this.checkDeposit(price, deposit);
    }
    return toDto(await this.prisma.forTenant(businessId).service.update({ where: { id }, data }));
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
