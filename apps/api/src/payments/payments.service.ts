import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ListPaymentsQuery,
  OwnerPayment,
  Page,
  PublicBookingView,
  SubmitPaymentInput,
} from '@mawid/shared';
import type { Booking, Customer, Payment, Service } from '@prisma/client';
import { BookingEvents } from '../bookings/booking-events';
import { BookingsService } from '../bookings/bookings.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PaymentProvider } from './payment-provider';

type Row = Payment & { booking: Booking & { customer: Customer; service: Service } };
const include = { booking: { include: { customer: true, service: true } } } as const;

const toOwner = (p: Row): OwnerPayment => ({
  id: p.id,
  status: p.status,
  amount: Number(p.amount),
  reference: p.reference,
  proofUrl: p.proofUrl,
  createdAt: p.createdAt.toISOString(),
  booking: {
    id: p.booking.id,
    status: p.booking.status,
    startsAt: p.booking.startsAt.toISOString(),
    customerName: p.booking.customer.name,
    customerPhone: p.booking.customer.phone,
    serviceName: p.booking.service.name,
  },
});

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly storage: StorageService,
    private readonly events: BookingEvents,
    private readonly bookings: BookingsService,
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Customer: sends the proof (the booking token is the secret)
  // ---------------------------------------------------------------------------------------------

  async submit(
    token: string,
    input: SubmitPaymentInput,
    file: Express.Multer.File | undefined,
  ): Promise<PublicBookingView> {
    if (!input.reference && !file) {
      throw new BadRequestException({
        code: 'PROOF_REQUIRED',
        message: 'Send the payment reference or a screenshot',
      });
    }
    // The token is the secret: the only place where the booking is found without a business id.
    const booking = await this.prisma.booking.findUnique({
      where: { cancelToken: token },
      include: { payments: true },
    });
    if (!booking) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Booking not found' });
    const payment = booking.payments[0];
    if (!payment || booking.status !== 'PENDING') {
      throw new ConflictException({
        code: 'NO_DEPOSIT_DUE',
        message: 'This booking has no deposit to pay',
      });
    }
    if (payment.status === 'PAID') {
      throw new ConflictException({ code: 'ALREADY_PAID', message: 'The deposit is already paid' });
    }

    const t = this.prisma.forTenant(booking.businessId);
    const proofUrl = file
      ? await this.storage.saveImage(file.buffer, `${booking.businessId}/proofs`)
      : payment.proofUrl;
    const reference = input.reference ?? payment.reference;
    const verdict = await this.provider.verify({
      businessId: booking.businessId,
      bookingId: booking.id,
      amount: Number(payment.amount),
      reference,
      proofUrl,
    });
    await t.payment.update({
      where: { id: payment.id },
      data: {
        reference,
        proofUrl,
        status: verdict, // a rejected proof sent again goes back to PENDING (or straight to PAID with a real provider)
        provider: this.provider.name,
        decidedAt: verdict === 'PENDING' ? null : new Date(),
      },
    });
    if (file && payment.proofUrl) await this.storage.delete(payment.proofUrl);

    if (verdict === 'PAID') await this.confirmBooking(booking.businessId, booking.id);
    else if (verdict === 'PENDING') await this.events.paymentSubmitted(booking.id);
    return this.bookings.viewByToken(token);
  }

  // ---------------------------------------------------------------------------------------------
  // Owner: validates or rejects
  // ---------------------------------------------------------------------------------------------

  async list(businessId: string, q: ListPaymentsQuery): Promise<Page<OwnerPayment>> {
    const t = this.prisma.forTenant(businessId);
    const where = q.status ? { status: q.status } : {};
    const [rows, total] = await Promise.all([
      t.payment.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      t.payment.count({ where }),
    ]);
    return { items: rows.map(toOwner), total, page: q.page, pageSize: q.pageSize };
  }

  async validate(businessId: string, id: string): Promise<OwnerPayment> {
    const p = await this.pending(businessId, id);
    await this.prisma
      .forTenant(businessId)
      .payment.update({ where: { id }, data: { status: 'PAID', decidedAt: new Date() } });
    await this.confirmBooking(businessId, p.bookingId);
    return this.one(businessId, id);
  }

  /** The booking stays PENDING: the customer can send another proof, or the owner cancels the booking. */
  async reject(businessId: string, id: string): Promise<OwnerPayment> {
    await this.pending(businessId, id);
    await this.prisma
      .forTenant(businessId)
      .payment.update({ where: { id }, data: { status: 'FAILED', decidedAt: new Date() } });
    return this.one(businessId, id);
  }

  private async one(businessId: string, id: string): Promise<OwnerPayment> {
    const row = await this.prisma
      .forTenant(businessId)
      .payment.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found' });
    return toOwner(row);
  }

  /** Only a payment that is waiting and has a proof can be decided. */
  private async pending(businessId: string, id: string): Promise<Payment> {
    const p = await this.prisma.forTenant(businessId).payment.findUnique({ where: { id } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found' });
    if (p.status !== 'PENDING') {
      throw new ConflictException({
        code: 'PAYMENT_DECIDED',
        message: 'This payment was already decided',
      });
    }
    if (!p.reference && !p.proofUrl) {
      throw new ConflictException({
        code: 'NO_PROOF',
        message: 'The customer has not sent a proof yet',
      });
    }
    return p;
  }

  /** Deposit paid: the booking goes PENDING -> CONFIRMED and the customer gets the confirmation. */
  private async confirmBooking(businessId: string, bookingId: string): Promise<void> {
    const t = this.prisma.forTenant(businessId);
    const res = await t.booking.updateMany({
      where: { id: bookingId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    if (res.count > 0) await this.events.confirmed(bookingId);
  }
}
