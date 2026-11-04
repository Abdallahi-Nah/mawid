import { DateTime } from 'luxon';

// Availability engine. PURE: no database, no clock, no I/O. Everything comes in through the input,
// so every rule can be tested with a fixed "now". Times are absolute instants (UTC); the business time zone
// is only used to read the local date, the working hours and the slot grid.

export interface TimeRange {
  start: Date;
  end: Date;
}
export interface WorkingRange {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  startTime: string; // "HH:mm", local time of the business
  endTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
}
export interface ExistingBooking extends TimeRange {
  bufferMin: number; // preparation time after the booking, also busy
}
export interface StaffAvailability {
  id: string;
  workingHours: WorkingRange[];
  timeOff: TimeRange[];
  /** Active bookings only (not cancelled). Include bookings that started the day before. */
  bookings: ExistingBooking[];
}
export interface AvailabilityInput {
  date: string; // "YYYY-MM-DD" in the business time zone
  timezone: string; // IANA name
  now: Date;
  service: { durationMin: number; bufferMin: number };
  staff: StaffAvailability[]; // the candidates (one employee, or all who perform the service)
  businessTimeOff: TimeRange[]; // closing days of the whole business
  stepMin: number; // distance between two slot starts, on the local clock grid
  minNoticeHours: number;
  maxDaysAhead: number;
}
export interface FreeSlot {
  start: Date;
  end: Date;
  staffIds: string[]; // who can take it ("any employee" mode picks one of them)
}

const MIN = 60_000;
type Span = [number, number]; // [start, end) in epoch ms

const toMs = (r: TimeRange): Span => [r.start.getTime(), r.end.getTime()];

/** Removes the blocked spans from the free spans. */
function subtract(free: Span[], blocked: Span[]): Span[] {
  let result = free;
  for (const [bs, be] of blocked) {
    const next: Span[] = [];
    for (const [fs, fe] of result) {
      if (be <= fs || bs >= fe) {
        next.push([fs, fe]);
        continue;
      }
      if (bs > fs) next.push([fs, bs]);
      if (be < fe) next.push([be, fe]);
    }
    result = next;
  }
  return result;
}

/** First grid point at or after t. The grid is "every stepMin minutes of the local clock". */
function alignUp(t: number, stepMin: number, zone: string): number {
  const dt = DateTime.fromMillis(t, { zone });
  const sub = dt.second * 1000 + dt.millisecond;
  const rem = (dt.hour * 60 + dt.minute) % stepMin;
  if (rem === 0 && sub === 0) return t;
  return t - sub + (rem === 0 ? stepMin : stepMin - rem) * MIN;
}

function localMs(date: string, time: string, zone: string): number {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!dt.isValid) throw new RangeError(`Invalid local time ${date} ${time} in ${zone}`);
  return dt.toMillis();
}

export function computeSlots(input: AvailabilityInput): FreeSlot[] {
  const { date, timezone: zone, service, stepMin } = input;
  if (!Number.isInteger(service.durationMin) || service.durationMin <= 0)
    throw new RangeError('durationMin must be > 0');
  if (!Number.isInteger(stepMin) || stepMin <= 0) throw new RangeError('stepMin must be > 0');
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid) throw new RangeError(`Invalid date or time zone: ${date} ${zone}`);

  // Past days and days too far ahead have no slots.
  const today = DateTime.fromMillis(input.now.getTime(), { zone }).startOf('day');
  const daysAhead = Math.round(day.startOf('day').diff(today, 'days').days);
  if (daysAhead < 0 || daysAhead > input.maxDaysAhead) return [];

  const weekday = day.weekday % 7; // luxon: Monday = 1 ... Sunday = 7
  const earliest = input.now.getTime() + input.minNoticeHours * 60 * MIN;
  const durationMs = service.durationMin * MIN;
  const occupiedMs = (service.durationMin + service.bufferMin) * MIN;
  const businessOff = input.businessTimeOff.map(toMs);

  const found = new Map<number, FreeSlot>();
  for (const staff of input.staff) {
    // Working time of the day, minus breaks, minus days off.
    let windows: Span[] = [];
    for (const row of staff.workingHours.filter((r) => r.weekday === weekday)) {
      const start = localMs(date, row.startTime, zone);
      const end = localMs(date, row.endTime, zone);
      if (end <= start) continue;
      let span: Span[] = [[start, end]];
      if (row.breakStart && row.breakEnd) {
        span = subtract(span, [
          [localMs(date, row.breakStart, zone), localMs(date, row.breakEnd, zone)],
        ]);
      }
      windows = windows.concat(span);
    }
    windows = subtract(windows, [...staff.timeOff.map(toMs), ...businessOff]);
    // An existing booking is busy until its end plus its own preparation time.
    const busy: Span[] = staff.bookings.map((b) => [
      b.start.getTime(),
      b.end.getTime() + b.bufferMin * MIN,
    ]);

    for (const [ws, we] of windows) {
      for (
        let t = alignUp(Math.max(ws, earliest), stepMin, zone);
        t + durationMs <= we;
        t += stepMin * MIN
      ) {
        // The new booking is busy for its duration plus its preparation time.
        if (busy.some(([bs, be]) => t < be && bs < t + occupiedMs)) continue;
        const slot = found.get(t) ?? {
          start: new Date(t),
          end: new Date(t + durationMs),
          staffIds: [],
        };
        slot.staffIds.push(staff.id);
        found.set(t, slot);
      }
    }
  }
  return [...found.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}
