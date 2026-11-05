import { csvCell, csvLine, resolveRange } from './report-range';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('resolveRange', () => {
  it('defaults to the last 30 days up to today', () => {
    const r = resolveRange({}, 'Africa/Nouakchott', NOW);
    expect(r.to).toBe('2026-11-10');
    expect(r.from).toBe('2026-10-12');
    expect(r.days).toBe(30);
    expect(r.start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('uses local days of the business time zone, not UTC days', () => {
    // Auckland is UTC+13 in November: local 10 Nov starts on 9 Nov 11:00 UTC.
    const r = resolveRange({ from: '2026-11-10', to: '2026-11-10' }, 'Pacific/Auckland', NOW);
    expect(r.days).toBe(1);
    expect(r.start.toISOString()).toBe('2026-11-09T11:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-10T11:00:00.000Z');
  });

  it('refuses an inverted range and a range longer than 366 days', () => {
    expect(() => resolveRange({ from: '2026-11-10', to: '2026-11-01' }, 'UTC', NOW)).toThrow();
    expect(() => resolveRange({ from: '2025-01-01', to: '2026-11-01' }, 'UTC', NOW)).toThrow(/366/);
    expect(resolveRange({ from: '2025-11-10', to: '2026-11-10' }, 'UTC', NOW).days).toBe(366);
  });
});

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(300)).toBe('300');
  });

  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+22233111222')).toBe("'+22233111222");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-1+1')).toBe("'-1+1");
  });

  it('keeps Arabic text as is', () => {
    expect(csvLine(['فاطمة', 'قص'])).toBe('فاطمة,قص');
  });
});
