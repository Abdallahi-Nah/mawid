import { BadRequestException } from '@nestjs/common';
import { assertNotInPast, isTooFarInPast, MANUAL_BOOKING_TOLERANCE_MS } from './past';

const NOW = new Date('2026-11-06T14:30:45.500Z');
const at = (iso: string): Date => new Date(iso);

describe('isTooFarInPast (exact instants, no tolerance)', () => {
  it('refuses yesterday at the same time, and any earlier day', () => {
    expect(isTooFarInPast(at('2026-11-05T14:30:45.500Z'), NOW)).toBe(true);
    expect(isTooFarInPast(at('2026-10-06T14:30:45.500Z'), NOW)).toBe(true); // a month ago
    expect(isTooFarInPast(at('2025-11-06T14:30:45.500Z'), NOW)).toBe(true); // a year ago
  });

  it('counts hours, minutes, seconds and milliseconds', () => {
    expect(isTooFarInPast(at('2026-11-06T13:30:45.500Z'), NOW)).toBe(true); // one hour earlier
    expect(isTooFarInPast(at('2026-11-06T14:29:45.500Z'), NOW)).toBe(true); // one minute earlier
    expect(isTooFarInPast(at('2026-11-06T14:30:44.500Z'), NOW)).toBe(true); // one second earlier
    expect(isTooFarInPast(at('2026-11-06T14:30:45.499Z'), NOW)).toBe(true); // one millisecond earlier
    expect(isTooFarInPast(at('2026-11-06T14:30:45.500Z'), NOW)).toBe(false); // exactly now
    expect(isTooFarInPast(at('2026-11-06T14:30:45.501Z'), NOW)).toBe(false); // one millisecond later
  });

  it('crosses day, month and year boundaries correctly', () => {
    const newYear = new Date('2027-01-01T00:00:10.000Z');
    expect(isTooFarInPast(at('2026-12-31T23:59:59.000Z'), newYear)).toBe(true); // 11 s before midnight, other year
    expect(isTooFarInPast(at('2027-01-01T00:00:10.000Z'), newYear)).toBe(false);
    expect(isTooFarInPast(at('2027-01-01T00:00:11.000Z'), newYear)).toBe(false);
    const leap = new Date('2028-03-01T00:00:00.000Z');
    expect(isTooFarInPast(at('2028-02-29T23:59:59.999Z'), leap)).toBe(true); // last second of 29 February
  });

  it('accepts any later day', () => {
    expect(isTooFarInPast(at('2026-11-07T09:00:00.000Z'), NOW)).toBe(false);
    expect(isTooFarInPast(at('2027-06-01T09:00:00.000Z'), NOW)).toBe(false);
  });
});

describe('manual booking tolerance of 15 minutes', () => {
  const tol = MANUAL_BOOKING_TOLERANCE_MS;
  it('is 15 minutes', () => expect(tol).toBe(900_000));

  it('allows up to exactly 15 minutes back, refuses one millisecond more', () => {
    expect(isTooFarInPast(at('2026-11-06T14:15:45.500Z'), NOW, tol)).toBe(false); // exactly 15 min back
    expect(isTooFarInPast(at('2026-11-06T14:15:45.499Z'), NOW, tol)).toBe(true); // 15 min and 1 ms back
    expect(isTooFarInPast(at('2026-11-06T14:20:00.000Z'), NOW, tol)).toBe(false); // 10 min back
  });

  it('still refuses another day, even at a similar time', () => {
    expect(isTooFarInPast(at('2026-11-05T14:30:45.500Z'), NOW, tol)).toBe(true);
    expect(isTooFarInPast(at('2026-11-05T23:59:59.000Z'), NOW, tol)).toBe(true);
  });

  it('works across midnight: 5 minutes after midnight, 10 minutes back is yesterday but allowed', () => {
    const justAfterMidnight = new Date('2026-11-07T00:05:00.000Z');
    expect(isTooFarInPast(at('2026-11-06T23:55:00.000Z'), justAfterMidnight, tol)).toBe(false);
    expect(isTooFarInPast(at('2026-11-06T23:49:59.000Z'), justAfterMidnight, tol)).toBe(true);
  });
});

describe('assertNotInPast', () => {
  it('throws PAST_NOT_ALLOWED (400) for a past start', () => {
    try {
      assertNotInPast(at('2026-11-05T10:00:00.000Z'), 0, NOW);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({ code: 'PAST_NOT_ALLOWED' });
    }
  });
  it('does nothing for a future start', () => {
    expect(() => assertNotInPast(at('2026-11-07T10:00:00.000Z'), 0, NOW)).not.toThrow();
  });
});
