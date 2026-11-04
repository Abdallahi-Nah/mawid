import { ConflictException } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';

// Booking life cycle. COMPLETED, CANCELLED and NO_SHOW are final.
//   PENDING   -> CONFIRMED | CANCELLED
//   CONFIRMED -> COMPLETED | CANCELLED | NO_SHOW
export const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Statuses that still hold the slot (everything except CANCELLED; the database constraint uses the same rule). */
export const ACTIVE_STATUSES: readonly BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'NO_SHOW',
];
/** Statuses that can still be cancelled or moved. */
export const OPEN_STATUSES: readonly BookingStatus[] = ['PENDING', 'CONFIRMED'];

export const canTransition = (from: BookingStatus, to: BookingStatus): boolean =>
  TRANSITIONS[from].includes(to);

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictException({
      code: 'INVALID_TRANSITION',
      message: `A ${from} booking cannot become ${to}`,
    });
  }
}
