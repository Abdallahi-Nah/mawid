import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ENV, Env } from '../config/env.module';
import { JobData, JobQueue } from './job-queue';

const QUEUE_NAME = 'notifications';
const ATTEMPTS = 3; // NFR-10: a failure is retried 3 times

/** BullMQ on Redis: durable jobs, delayed reminders, retries with exponential backoff. */
@Injectable()
export class BullJobQueue extends JobQueue implements OnModuleDestroy {
  private readonly logger = new Logger('Queue');
  private readonly queue: Queue<JobData>;
  private worker?: Worker<JobData>;
  private readonly connection;
  private readonly prefix: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    const url = new URL(env.REDIS_URL);
    // maxRetriesPerRequest: null is required by BullMQ workers.
    this.connection = {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
    this.prefix = env.QUEUE_PREFIX;
    this.queue = new Queue<JobData>(QUEUE_NAME, {
      connection: this.connection,
      prefix: this.prefix,
      defaultJobOptions: {
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: env.NOTIFY_BACKOFF_MS },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { count: 1000 },
      },
    });
    // Without a listener an unreachable Redis would crash the process.
    this.queue.on('error', (e) => this.logger.error(`Queue error: ${e.message}`));
  }

  async add(data: JobData, opts: { jobId: string; delayMs?: number }): Promise<void> {
    await this.queue.add(data.type, data, { jobId: opts.jobId, delay: opts.delayMs });
  }

  async remove(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    try {
      await job.remove();
      return true;
    } catch {
      return false; // already running: too late to cancel
    }
  }

  async delayOf(jobId: string): Promise<number | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    return Math.max(0, job.timestamp + (job.opts.delay ?? 0) - Date.now());
  }

  start(
    handler: (data: JobData) => Promise<void>,
    onFinalFailure: (data: JobData, error: Error) => Promise<void>,
  ): void {
    this.worker = new Worker<JobData>(QUEUE_NAME, (job) => handler(job.data), {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: 5,
    });
    this.worker.on('error', (e) => this.logger.error(`Worker error: ${e.message}`));
    this.worker.on('failed', (job, err) => {
      if (!job) return;
      this.logger.warn(
        `Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
      );
      if (job.attemptsMade >= (job.opts.attempts ?? ATTEMPTS)) {
        onFinalFailure(job.data, err).catch((e: Error) => this.logger.error(e.message));
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    // Test queues live under their own prefix and are wiped when the app stops.
    if (this.prefix.startsWith('mawid-test'))
      await this.queue.obliterate({ force: true }).catch(() => undefined);
    await this.queue.close();
  }
}
