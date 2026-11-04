import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UpdateBusinessInput } from '@mawid/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(businessId: string) {
    const business = await this.prisma
      .forTenant(businessId)
      .business.findUnique({ where: { id: businessId } });
    if (!business)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    return business;
  }

  async update(businessId: string, input: UpdateBusinessInput) {
    if (input.slug) {
      const taken = await this.prisma.business.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (taken && taken.id !== businessId) {
        throw new ConflictException({
          code: 'SLUG_TAKEN',
          message: 'This address is already used',
        });
      }
    }
    return this.prisma
      .forTenant(businessId)
      .business.update({ where: { id: businessId }, data: input });
  }

  async setLogo(businessId: string, file: Express.Multer.File | undefined) {
    if (!file)
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Send an image in the "file" field',
      });
    const tenant = this.prisma.forTenant(businessId);
    const current = await this.get(businessId);
    const url = await this.storage.saveImage(file.buffer, `${businessId}/logo`);
    const updated = await tenant.business.update({
      where: { id: businessId },
      data: { logoUrl: url },
    });
    await this.storage.delete(current.logoUrl ?? '');
    return updated;
  }
}
