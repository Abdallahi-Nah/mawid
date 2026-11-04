import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { MailMessage, MailService } from './mail.service';

@Injectable()
export class ResendMailService extends MailService {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    super();
    this.client = new Resend(apiKey);
  }

  async send(message: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
        contentType: a.contentType,
      })),
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
  }
}
