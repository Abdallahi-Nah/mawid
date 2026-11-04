export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

// Abstract class so it can be used as an injection token.
export abstract class MailService {
  abstract send(message: MailMessage): Promise<void>;
}
