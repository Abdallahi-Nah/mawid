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
  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  mail: MemoryMail;
}> {
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
