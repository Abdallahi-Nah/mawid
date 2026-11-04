import type { BookingStatus } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { assertTransition, canTransition, TRANSITIONS } from './status';

const ALL: BookingStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

describe('booking status machine', () => {
  const allowed: [BookingStatus, BookingStatus][] = [
    ['PENDING', 'CONFIRMED'],
    ['PENDING', 'CANCELLED'],
    ['CONFIRMED', 'COMPLETED'],
    ['CONFIRMED', 'CANCELLED'],
    ['CONFIRMED', 'NO_SHOW'],
  ];

  it.each(allowed)('%s -> %s is allowed', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it('refuses every other transition, including staying in the same status', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (allowed.some(([f, t]) => f === from && t === to)) continue;
        expect([from, to, canTransition(from, to)]).toEqual([from, to, false]);
      }
    }
  });

  it('final statuses have no way out', () => {
    for (const s of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)
      expect(TRANSITIONS[s]).toEqual([]);
  });

  it('throws a 409 INVALID_TRANSITION', () => {
    try {
      assertTransition('CANCELLED', 'CONFIRMED');
      fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getResponse()).toMatchObject({ code: 'INVALID_TRANSITION' });
    }
  });
});
