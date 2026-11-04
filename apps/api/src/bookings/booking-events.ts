// What happens after a booking changes (emails, in-app alerts, reminders). The bookings module only
// announces the event; the notifications module (next step) listens. The default does nothing.
export type CancelledBy = 'customer' | 'business';

export abstract class BookingEvents {
  abstract created(bookingId: string): Promise<void>;
  abstract cancelled(bookingId: string, by: CancelledBy): Promise<void>;
  abstract rescheduled(bookingId: string, by: CancelledBy): Promise<void>;
  abstract confirmed(bookingId: string): Promise<void>;
}

export class NoopBookingEvents extends BookingEvents {
  created(): Promise<void> {
    return Promise.resolve();
  }
  cancelled(): Promise<void> {
    return Promise.resolve();
  }
  rescheduled(): Promise<void> {
    return Promise.resolve();
  }
  confirmed(): Promise<void> {
    return Promise.resolve();
  }
}
