import { NotificationChannelProvider, StubChannelProvider } from './channels';

describe('NotificationChannelProvider stub (FR-51)', () => {
  it('is a channel provider and keeps the message instead of sending it', async () => {
    const sms: NotificationChannelProvider = new StubChannelProvider('SMS');
    await sms.send({ to: '+22222001122', text: 'Rappel : demain 10:00' });
    expect(sms.channel).toBe('SMS');
    expect((sms as StubChannelProvider).sent).toEqual([
      { to: '+22222001122', text: 'Rappel : demain 10:00' },
    ]);
  });

  it('can be used for WhatsApp too', () => {
    expect(new StubChannelProvider('WHATSAPP').channel).toBe('WHATSAPP');
  });
});
