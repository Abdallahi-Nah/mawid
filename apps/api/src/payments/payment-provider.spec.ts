import { ManualPaymentProvider } from './payment-provider';

describe('ManualPaymentProvider', () => {
  it('never decides by itself: the owner checks the proof', async () => {
    const p = new ManualPaymentProvider();
    expect(p.name).toBe('manual');
    await expect(p.verify()).resolves.toBe('PENDING');
  });
});
