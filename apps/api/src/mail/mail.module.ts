import { Global, Module } from '@nestjs/common';
import { ENV, Env } from '../config/env.module';
import { ConsoleMailService } from './console-mail.service';
import { MailService } from './mail.service';
import { ResendMailService } from './resend-mail.service';

// Real emails only when RESEND_API_KEY is set; otherwise messages are printed in the console.
@Global()
@Module({
  providers: [
    {
      provide: MailService,
      inject: [ENV],
      useFactory: (env: Env): MailService =>
        env.RESEND_API_KEY
          ? new ResendMailService(env.RESEND_API_KEY, env.MAIL_FROM)
          : new ConsoleMailService(),
    },
  ],
  exports: [MailService],
})
export class MailModule {}
