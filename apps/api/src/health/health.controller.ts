import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@mawid/shared';
import { Public } from '../common/auth.decorators';
import { JobQueue } from '../notifications/job-queue';
import { PrismaService } from '../prisma/prisma.service';

export interface ReadyResponse {
  status: 'ok';
  checks: { database: 'up'; redis: 'up' };
  uptimeSec: number;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
  ) {}

  /** Liveness: the process is running. No dependency is touched, so a restart loop is never caused by Redis. */
  @Public()
  @Get()
  check(): HealthResponse {
    return { status: 'ok', time: new Date().toISOString() };
  }

  /** Readiness: the database and Redis answer. 503 tells the load balancer to stop sending traffic. */
  @Public()
  @Get('ready')
  async ready(): Promise<ReadyResponse> {
    const [database, redis] = await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, 2000).then(
        () => true,
        () => false,
      ),
      withTimeout(this.queue.ping(), 2000).catch(() => false),
    ]);
    if (!database || !redis) {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'A dependency is down',
        details: { database: database ? 'up' : 'down', redis: redis ? 'up' : 'down' },
      });
    }
    return {
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
      uptimeSec: Math.round(process.uptime()),
    };
  }
}
