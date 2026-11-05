export type PaymentVerdict = 'PENDING' | 'PAID' | 'FAILED';

export interface PaymentCheck {
  businessId: string;
  bookingId: string;
  amount: number;
  /** Mobile payment reference typed by the customer. */
  reference: string | null;
  /** Screenshot saved by the API. */
  proofUrl: string | null;
}

/**
 * How a deposit is checked. The flow (booking PENDING -> customer sends proof -> booking CONFIRMED) never changes:
 * a real provider (Bankily, Masrvi, Stripe) only has to implement verify() and answer PAID or FAILED at once.
 * Abstract class so it can be used as an injection token.
 */
export abstract class PaymentProvider {
  /** Saved in payments.provider. */
  abstract readonly name: string;
  abstract verify(check: PaymentCheck): Promise<PaymentVerdict>;
}

/** Nobody can check a mobile transfer by machine: the owner looks at the proof and decides. */
export class ManualPaymentProvider extends PaymentProvider {
  readonly name = 'manual';
  verify(): Promise<PaymentVerdict> {
    return Promise.resolve('PENDING');
  }
}
