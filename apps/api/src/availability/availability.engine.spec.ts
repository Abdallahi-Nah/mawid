import {
  AvailabilityInput,
  computeSlots,
  StaffAvailability,
  WorkingRange,
} from './availability.engine';

const Z = 'Africa/Nouakchott'; // UTC+0, no daylight saving
const NOW = new Date('2026-06-01T00:00:00Z'); // a Monday; far from the dates tested
const hh = (iso: string): string => iso.slice(11, 16);
const utc = (s: string): Date => new Date(s);

const hours = (
  weekday: number,
  startTime = '09:00',
  endTime = '18:00',
  extra: Partial<WorkingRange> = {},
): WorkingRange => ({
  weekday,
  startTime,
  endTime,
  ...extra,
});
const staff = (
  id: string,
  working: WorkingRange[],
  over: Partial<StaffAvailability> = {},
): StaffAvailability => ({
  id,
  workingHours: working,
  timeOff: [],
  bookings: [],
  ...over,
});
// 2026-06-03 is a Wednesday (weekday 3).
const WED = '2026-06-03';
const run = (over: Partial<AvailabilityInput> = {}) =>
  computeSlots({
    date: WED,
    timezone: Z,
    now: NOW,
    service: { durationMin: 30, bufferMin: 0 },
    staff: [staff('a', [hours(3)])],
    businessTimeOff: [],
    stepMin: 15,
    minNoticeHours: 0,
    maxDaysAhead: 60,
    ...over,
  });
const starts = (slots: ReturnType<typeof run>): string[] =>
  slots.map((s) => hh(s.start.toISOString()));

describe('computeSlots: basics', () => {
  it('lists every step between opening and closing', () => {
    const s = run();
    expect(s[0].start.toISOString()).toBe('2026-06-03T09:00:00.000Z');
    expect(hh(s.at(-1)!.start.toISOString())).toBe('17:30');
    expect(s).toHaveLength(35); // (9h * 60 - 30) / 15 + 1
  });

  it('end = start + duration', () => {
    const s = run({ service: { durationMin: 45, bufferMin: 0 } })[0];
    expect(s.end.getTime() - s.start.getTime()).toBe(45 * 60_000);
  });

  it('respects the step', () => {
    expect(starts(run({ stepMin: 60, service: { durationMin: 60, bufferMin: 0 } }))).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ]);
  });

  it('returns slots sorted with unique starts', () => {
    const s = run({ staff: [staff('a', [hours(3)]), staff('b', [hours(3)])] });
    const t = s.map((x) => x.start.getTime());
    expect(t).toEqual([...new Set(t)].sort((x, y) => x - y));
  });

  it('a service longer than the working day has no slot', () => {
    expect(run({ service: { durationMin: 600, bufferMin: 0 } })).toEqual([]);
  });

  it('no staff, no slot', () => {
    expect(run({ staff: [] })).toEqual([]);
  });

  it('a closed weekday has no slot', () => {
    expect(run({ staff: [staff('a', [hours(1)])] })).toEqual([]);
  });

  it('handles several ranges in one day', () => {
    const s = run({
      staff: [staff('a', [hours(3, '09:00', '12:00'), hours(3, '14:00', '17:00')])],
      service: { durationMin: 60, bufferMin: 0 },
      stepMin: 60,
    });
    expect(starts(s)).toEqual(['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']);
  });
});

describe('computeSlots: breaks (AC-03)', () => {
  const lunch = [hours(3, '09:00', '18:00', { breakStart: '13:00', breakEnd: '14:00' })];

  it('never offers a slot during the break', () => {
    const s = starts(
      run({ staff: [staff('a', lunch)], service: { durationMin: 60, bufferMin: 0 }, stepMin: 60 }),
    );
    expect(s).not.toContain('13:00');
    expect(s).toEqual(['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00']);
  });

  it('a slot cannot run into the break', () => {
    const s = starts(
      run({ staff: [staff('a', lunch)], service: { durationMin: 60, bufferMin: 0 } }),
    );
    expect(s).toContain('12:00');
    expect(s).not.toContain('12:15');
    expect(s).not.toContain('12:45');
  });

  it('a slot can start exactly when the break ends and end exactly when it starts', () => {
    const s = starts(run({ staff: [staff('a', lunch)] }));
    expect(s).toContain('12:30');
    expect(s).toContain('14:00');
    expect(s).not.toContain('13:00');
    expect(s).not.toContain('13:45');
  });

  it('a break outside working hours changes nothing', () => {
    const a = run({
      staff: [staff('a', [hours(3, '09:00', '18:00', { breakStart: '19:00', breakEnd: '20:00' })])],
    });
    expect(a).toHaveLength(35);
  });
});

describe('computeSlots: time off (AC-03)', () => {
  it('a full day off removes everything', () => {
    const off = [{ start: utc('2026-06-03T00:00:00Z'), end: utc('2026-06-04T00:00:00Z') }];
    expect(run({ staff: [staff('a', [hours(3)], { timeOff: off })] })).toEqual([]);
  });

  it('a partial time off removes only the overlapping slots', () => {
    const off = [{ start: utc('2026-06-03T10:00:00Z'), end: utc('2026-06-03T11:00:00Z') }];
    const s = starts(run({ staff: [staff('a', [hours(3)], { timeOff: off })] }));
    expect(s).toContain('09:30');
    expect(s).not.toContain('09:45');
    expect(s).not.toContain('10:30');
    expect(s).toContain('11:00');
  });

  it('a closing day of the whole business removes everything for every employee', () => {
    const off = [{ start: utc('2026-06-03T00:00:00Z'), end: utc('2026-06-04T00:00:00Z') }];
    expect(
      run({ businessTimeOff: off, staff: [staff('a', [hours(3)]), staff('b', [hours(3)])] }),
    ).toEqual([]);
  });

  it('a time off over several days covers the day', () => {
    const off = [{ start: utc('2026-06-01T00:00:00Z'), end: utc('2026-06-10T00:00:00Z') }];
    expect(run({ staff: [staff('a', [hours(3)], { timeOff: off })] })).toEqual([]);
  });

  it('the time off of one employee does not affect another', () => {
    const off = [{ start: utc('2026-06-03T00:00:00Z'), end: utc('2026-06-04T00:00:00Z') }];
    const s = run({ staff: [staff('a', [hours(3)], { timeOff: off }), staff('b', [hours(3)])] });
    expect(s.every((x) => x.staffIds.join() === 'b')).toBe(true);
    expect(s.length).toBeGreaterThan(0);
  });
});

describe('computeSlots: existing bookings (AC-03)', () => {
  const booking = (from: string, to: string, bufferMin = 0) => ({
    start: utc(`2026-06-03T${from}:00Z`),
    end: utc(`2026-06-03T${to}:00Z`),
    bufferMin,
  });

  it('blocks overlapping slots but allows the ones next to it', () => {
    const s = starts(
      run({ staff: [staff('a', [hours(3)], { bookings: [booking('10:00', '10:30')] })] }),
    );
    expect(s).toContain('09:30');
    expect(s).not.toContain('09:45');
    expect(s).not.toContain('10:00');
    expect(s).not.toContain('10:15');
    expect(s).toContain('10:30');
  });

  it('the preparation time of an existing booking is busy too', () => {
    const s = starts(
      run({ staff: [staff('a', [hours(3)], { bookings: [booking('10:00', '10:30', 15)] })] }),
    );
    expect(s).not.toContain('10:30');
    expect(s).toContain('10:45');
  });

  it('the preparation time of the new service must not touch the next booking', () => {
    const s = starts(
      run({
        service: { durationMin: 30, bufferMin: 15 },
        staff: [staff('a', [hours(3)], { bookings: [booking('10:30', '11:00')] })],
      }),
    );
    expect(s).toContain('09:45'); // 09:45 + 30 + 15 = 10:30, just fits
    expect(s).not.toContain('10:00');
  });

  it('the preparation time after the last slot may pass closing time', () => {
    const s = run({ service: { durationMin: 30, bufferMin: 15 } });
    expect(hh(s.at(-1)!.start.toISOString())).toBe('17:30');
  });

  it('realigns on the grid after an odd end time', () => {
    const s = starts(
      run({ staff: [staff('a', [hours(3)], { bookings: [booking('09:50', '10:20')] })] }),
    );
    expect(s).toContain('10:30');
    expect(s).not.toContain('10:20');
  });

  it('ignores bookings on other days', () => {
    const other = {
      start: utc('2026-06-05T10:00:00Z'),
      end: utc('2026-06-05T11:00:00Z'),
      bufferMin: 0,
    };
    expect(run({ staff: [staff('a', [hours(3)], { bookings: [other] })] })).toHaveLength(35);
  });

  it('a booking over midnight blocks the first slots of the next day', () => {
    const night = {
      start: utc('2026-06-02T23:30:00Z'),
      end: utc('2026-06-03T00:30:00Z'),
      bufferMin: 0,
    };
    const s = starts(
      run({
        staff: [staff('a', [hours(3, '00:00', '03:00')], { bookings: [night] })],
        stepMin: 30,
      }),
    );
    expect(s[0]).toBe('00:30');
  });

  it('a fully booked day has no slot', () => {
    const all = {
      start: utc('2026-06-03T09:00:00Z'),
      end: utc('2026-06-03T18:00:00Z'),
      bufferMin: 0,
    };
    expect(run({ staff: [staff('a', [hours(3)], { bookings: [all] })] })).toEqual([]);
  });
});

describe('computeSlots: any employee', () => {
  const busyMorning = {
    start: utc('2026-06-03T09:00:00Z'),
    end: utc('2026-06-03T12:00:00Z'),
    bufferMin: 0,
  };

  it('lists who can take each slot', () => {
    const s = run({
      staff: [staff('a', [hours(3)], { bookings: [busyMorning] }), staff('b', [hours(3)])],
    });
    expect(s[0].staffIds).toEqual(['b']); // 09:00: only b is free
    expect(s.find((x) => hh(x.start.toISOString()) === '12:00')!.staffIds).toEqual(['a', 'b']);
  });

  it('a slot exists as soon as one employee is free', () => {
    const s = run({
      staff: [
        staff('a', [hours(3)], { bookings: [busyMorning] }),
        staff('b', [hours(3, '10:00', '11:00')]),
      ],
    });
    expect(starts(s)).toContain('10:00');
  });

  it('employees with different hours are merged', () => {
    const s = run({
      staff: [staff('a', [hours(3, '09:00', '12:00')]), staff('b', [hours(3, '14:00', '16:00')])],
      service: { durationMin: 60, bufferMin: 0 },
      stepMin: 60,
    });
    expect(starts(s)).toEqual(['09:00', '10:00', '11:00', '14:00', '15:00']);
  });
});

describe('computeSlots: notice, past, maximum days', () => {
  it('hides slots before the minimum notice', () => {
    const now = utc('2026-06-03T08:00:00Z');
    const s = starts(run({ now, minNoticeHours: 2 }));
    expect(s[0]).toBe('10:00');
  });

  it('rounds the first slot up to the grid', () => {
    const now = utc('2026-06-03T09:07:00Z');
    expect(starts(run({ now, minNoticeHours: 0 }))[0]).toBe('09:15');
  });

  it('a day in the past has no slot', () => {
    expect(run({ now: utc('2026-06-04T08:00:00Z') })).toEqual([]);
  });

  it('after closing time today has no slot', () => {
    expect(run({ now: utc('2026-06-03T18:30:00Z') })).toEqual([]);
  });

  it('a minimum notice larger than the day removes the day', () => {
    expect(run({ now: utc('2026-06-02T12:00:00Z'), minNoticeHours: 48 })).toEqual([]);
  });

  it('maxDaysAhead: the last allowed day works, the next one does not', () => {
    const now = utc('2026-06-01T00:00:00Z');
    expect(run({ now, maxDaysAhead: 2 }).length).toBeGreaterThan(0); // 2026-06-03 is 2 days ahead
    expect(run({ now, maxDaysAhead: 1 })).toEqual([]);
  });
});

describe('computeSlots: time zones and daylight saving', () => {
  const paris = (date: string, working: WorkingRange[]) =>
    computeSlots({
      date,
      timezone: 'Europe/Paris',
      now: utc('2026-01-01T00:00:00Z'),
      service: { durationMin: 60, bufferMin: 0 },
      staff: [staff('a', working)],
      businessTimeOff: [],
      stepMin: 60,
      minNoticeHours: 0,
      maxDaysAhead: 365,
    });
  const iso = (s: ReturnType<typeof run>) => s.map((x) => x.start.toISOString());

  it('converts local hours to UTC for a positive offset (Dubai +4)', () => {
    expect(run({ timezone: 'Asia/Dubai' })[0].start.toISOString()).toBe('2026-06-03T05:00:00.000Z');
  });

  it('converts local hours to UTC for a negative offset with daylight saving (New York, summer -4)', () => {
    expect(run({ timezone: 'America/New_York' })[0].start.toISOString()).toBe(
      '2026-06-03T13:00:00.000Z',
    );
  });

  it('keeps the local grid in a zone with a half-hour offset (India +5:30)', () => {
    const s = run({ timezone: 'Asia/Kolkata', stepMin: 30 });
    expect(s[0].start.toISOString()).toBe('2026-06-03T03:30:00.000Z');
    expect(s[1].start.toISOString()).toBe('2026-06-03T04:00:00.000Z');
  });

  it('winter and summer use different offsets for the same local hour (Paris)', () => {
    expect(paris('2026-01-14', [hours(3)])[0].start.toISOString()).toBe('2026-01-14T08:00:00.000Z'); // UTC+1
    expect(paris('2026-07-15', [hours(3)])[0].start.toISOString()).toBe('2026-07-15T07:00:00.000Z'); // UTC+2
  });

  it('spring forward: the skipped hour gives no slot (2026-03-29, 01:00-05:00 local)', () => {
    // 02:00 -> 03:00 does not exist, so only 3 real hours remain.
    expect(iso(paris('2026-03-29', [hours(0, '01:00', '05:00')]))).toEqual([
      '2026-03-29T00:00:00.000Z', // 01:00 CET
      '2026-03-29T01:00:00.000Z', // 03:00 CEST
      '2026-03-29T02:00:00.000Z', // 04:00 CEST
    ]);
  });

  it('fall back: the repeated hour gives two slots (2026-10-25, 01:00-05:00 local)', () => {
    expect(paris('2026-10-25', [hours(0, '01:00', '05:00')])).toHaveLength(5); // 5 real hours
  });

  it('a normal day of 9 hours stays 9 hours on a daylight saving day', () => {
    expect(paris('2026-03-29', [hours(0, '09:00', '18:00')])).toHaveLength(9);
  });
});

describe('computeSlots: invalid input', () => {
  it('rejects a zero duration', () => {
    expect(() => run({ service: { durationMin: 0, bufferMin: 0 } })).toThrow(RangeError);
  });
  it('rejects a zero step', () => {
    expect(() => run({ stepMin: 0 })).toThrow(RangeError);
  });
  it('rejects an invalid date', () => {
    expect(() => run({ date: '2026-13-45' })).toThrow(RangeError);
  });
  it('rejects an unknown time zone', () => {
    expect(() => run({ timezone: 'Mars/Olympus' })).toThrow(RangeError);
  });
});
