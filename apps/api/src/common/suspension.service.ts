import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Thrown when an admin has suspended the business. */
export const businessSuspended = (): ForbiddenException =>
  new ForbiddenException({
    code: 'BUSINESS_SUSPENDED',
    message: 'This business is suspended',
  });

const TTL_MS = 5_000;

/**
 * Tells if a business is suspended. The answer is kept 5 seconds so that a logged-in owner does not cost one
 * extra query per request; the admin action clears it at once.
 */
@Injectable()
export class SuspensionService {
  private readonly cache = new Map<string, { suspended: boolean; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async isSuspended(businessId: string): Promise<boolean> {
    const hit = this.cache.get(businessId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.suspended;
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { suspendedAt: true },
    });
    const suspended = !!b?.suspendedAt;
    this.cache.set(businessId, { suspended, at: Date.now() });
    return suspended;
  }

  invalidate(businessId: string): void {
    this.cache.delete(businessId);
  }
}
