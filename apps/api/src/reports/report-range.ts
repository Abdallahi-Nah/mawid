import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

export const MAX_RANGE_DAYS = 366;

export interface ResolvedRange {
  /** Days in the business time zone (YYYY-MM-DD), both included. */
  from: string;
  to: string;
  /** Instants (UTC) : startsAt >= start and startsAt < end. */
  start: Date;
  end: Date;
  days: number;
}

/** Default: the last 30 days up to today. Days are local days of the business. */
export function resolveRange(
  q: { from?: string; to?: string },
  timezone: string,
  now: Date = new Date(),
): ResolvedRange {
  const today = DateTime.fromJSDate(now, { zone: timezone }).startOf('day');
  const to = q.to ? DateTime.fromISO(q.to, { zone: timezone }) : today;
  const from = q.from ? DateTime.fromISO(q.from, { zone: timezone }) : to.minus({ days: 29 });
  if (!from.isValid || !to.isValid || from > to) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid date range' });
  }
  const days = Math.round(to.startOf('day').diff(from.startOf('day'), 'days').days) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestException({
      code: 'RANGE_TOO_LARGE',
      message: `The range cannot be longer than ${MAX_RANGE_DAYS} days`,
    });
  }
  return {
    from: from.toISODate() as string,
    to: to.toISODate() as string,
    start: from.startOf('day').toUTC().toJSDate(),
    end: to.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
    days,
  };
}

/** One CSV cell. A cell that starts with = + - @ could run as a formula in Excel: it gets a leading quote. */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (cells: (string | number)[]): string => cells.map(csvCell).join(',');
