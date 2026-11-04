import { Injectable, Logger } from '@nestjs/common';
import { MailMessage, MailService } from './mail.service';

/** Development mail: prints the message in the API console. */
@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger('Mail');

  send(message: MailMessage): Promise<void> {
    this.logger.log(`To: ${message.to} | ${message.subject}\n${message.text}`);
    return Promise.resolve();
  }
}
