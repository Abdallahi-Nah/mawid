import { BadRequestException } from '@nestjs/common';
import { MANUAL_BOOKING_TOLERANCE_MIN } from '@mawid/shared';

/** A walk-in customer is written down a few minutes after they arrive: the owner may enter a start up to this far back. */
export const MANUAL_BOOKING_TOLERANCE_MS = MANUAL_BOOKING_TOLERANCE_MIN * 60_000;

/**
 * True when `startsAt` is earlier than `now` minus the tolerance. The comparison uses the exact instant, so day,
 * month, year, hour, minute, second and millisecond all count (both dates are UTC instants: no time zone or
 * daylight-saving trap).
 */
export function isTooFarInPast(startsAt: Date, now: Date, toleranceMs = 0): boolean {
  return startsAt.getTime() < now.getTime() - toleranceMs;
}

/** An appointment cannot start in the past: nobody can offer a service on a day that is over. */
export function assertNotInPast(startsAt: Date, toleranceMs = 0, now: Date = new Date()): void {
  if (isTooFarInPast(startsAt, now, toleranceMs)) {
    throw new BadRequestException({
      code: 'PAST_NOT_ALLOWED',
      message: 'The start of an appointment cannot be in the past',
    });
  }
}
