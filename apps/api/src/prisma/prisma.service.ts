import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTenantClient, TenantClient } from './tenant.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Client for business data. Use it in every module that handles a business's rows. */
  forTenant(businessId: string): TenantClient {
    return createTenantClient(this, businessId);
  }
}
