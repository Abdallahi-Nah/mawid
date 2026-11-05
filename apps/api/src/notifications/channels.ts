import { Logger } from '@nestjs/common';

export type ChannelName = 'WHATSAPP' | 'SMS';

export interface ChannelMessage {
  /** Phone number of the customer. */
  to: string;
  /** Short text, already in the customer's language. */
  text: string;
}

/**
 * A way to reach a customer other than email (FR-51: reminder by WhatsApp or SMS).
 * A real provider only has to implement send(). Abstract class so it can be used as an injection token.
 */
export abstract class NotificationChannelProvider {
  abstract readonly channel: ChannelName;
  abstract send(message: ChannelMessage): Promise<void>;
}

/**
 * Placeholder until a real WhatsApp/SMS provider is chosen: nothing leaves the server,
 * the message is only written to the log. No external service is called.
 */
export class StubChannelProvider extends NotificationChannelProvider {
  readonly channel: ChannelName;
  /** Messages "sent" (kept in memory so tests can check them). */
  readonly sent: ChannelMessage[] = [];
  private readonly logger = new Logger('NotificationChannel');

  constructor(channel: ChannelName = 'WHATSAPP') {
    super();
    this.channel = channel;
  }

  send(message: ChannelMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(`[stub ${this.channel}] not sent, no provider configured (to ${message.to})`);
    return Promise.resolve();
  }
}

/** Injection tokens. Swap the useFactory in NotificationsModule for a real provider later. */
export const WHATSAPP_CHANNEL = Symbol('WHATSAPP_CHANNEL');
export const SMS_CHANNEL = Symbol('SMS_CHANNEL');
