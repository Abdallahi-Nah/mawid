import { Global, Module } from '@nestjs/common';
import { ManualPaymentProvider, PaymentProvider } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Global()
@Module({
  controllers: [PaymentsController],
  providers: [
    ManualPaymentProvider,
    // Swap this line to plug a real provider (Bankily, Masrvi, Stripe).
    { provide: PaymentProvider, useExisting: ManualPaymentProvider },
    PaymentsService,
  ],
  exports: [PaymentProvider],
})
export class PaymentsModule {}
