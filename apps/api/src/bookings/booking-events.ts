// What happens after a booking changes (emails, in-app alerts, reminders). The bookings module only
// announces the event; the notifications module listens (NotificationsService implements this class).
export type CancelledBy = 'customer' | 'business';

export abstract class BookingEvents {
  abstract created(bookingId: string): Promise<void>;
  abstract cancelled(bookingId: string, by: CancelledBy): Promise<void>;
  abstract rescheduled(bookingId: string, by: CancelledBy): Promise<void>;
  abstract confirmed(bookingId: string): Promise<void>;
  /** The visit took place: the customer gets the link to rate it. */
  abstract completed(bookingId: string): Promise<void>;
  /** The customer sent the proof of the deposit: the owner has something to check. */
  abstract paymentSubmitted(bookingId: string): Promise<void>;
}
