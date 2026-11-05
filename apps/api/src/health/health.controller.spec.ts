import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { JobQueue } from '../notifications/job-queue';
import { HealthController } from './health.controller';

const make = (db: () => Promise<unknown>, redis: () => Promise<boolean>) =>
  new HealthController(
    { $queryRaw: db } as unknown as PrismaService,
    { ping: redis } as unknown as JobQueue,
  );

describe('HealthController', () => {
  it('liveness: ok without touching any dependency', () => {
    const c = make(
      () => Promise.reject(new Error('db down')),
      () => Promise.resolve(false),
    );
    expect(c.check().status).toBe('ok');
  });

  it('readiness: ok when the database and Redis answer', async () => {
    const r = await make(
      () => Promise.resolve([{ '?column?': 1 }]),
      () => Promise.resolve(true),
    ).ready();
    expect(r.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('readiness: 503 with the name of the dependency that is down', async () => {
    const dbDown = make(
      () => Promise.reject(new Error('refused')),
      () => Promise.resolve(true),
    );
    await expect(dbDown.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await dbDown.ready().catch((e: ServiceUnavailableException) => {
      expect((e.getResponse() as { details: unknown }).details).toEqual({
        database: 'down',
        redis: 'up',
      });
    });
    const redisDown = make(
      () => Promise.resolve([]),
      () => Promise.resolve(false),
    );
    await redisDown.ready().catch((e: ServiceUnavailableException) => {
      expect((e.getResponse() as { details: unknown }).details).toEqual({
        database: 'up',
        redis: 'down',
      });
    });
  });
});
