import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { MailMessage, MailService } from './mail/mail.service';
import { PrismaService } from './prisma/prisma.service';

/** Mail that keeps messages in memory so tests can read the reset link. */
export class MemoryMail extends MailService {
  sent: MailMessage[] = [];
  /** Number of next sends that fail (to test the retries). */
  failures = 0;
  attempts = 0;
  send(message: MailMessage): Promise<void> {
    this.attempts++;
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(new Error('mail server down'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
  to(address: string): MailMessage[] {
    return this.sent.filter((m) => m.to === address);
  }
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  mail: MemoryMail;
}> {
  // Each test app gets its own queue in Redis, so nothing leaks between tests or into a running dev API.
  process.env.QUEUE_PREFIX = `mawid-test-${Math.random().toString(36).slice(2, 8)}`;
  process.env.NOTIFY_BACKOFF_MS ??= '50';
  const mail = new MemoryMail();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, prisma: app.get(PrismaService), mail };
}

export const uniqueEmail = (prefix: string): string =>
  `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@test.mawid`;
