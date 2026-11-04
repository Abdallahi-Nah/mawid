// Time helpers in the business time zone. The API speaks UTC ISO strings; people see local time.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, tz: string): Record<string, number> {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** "YYYY-MM-DD" of an instant, in the time zone. */
export function dayKeyTz(iso: string | Date, tz: string): string {
  const p = parts(new Date(iso), tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Minutes since local midnight of an instant, in the time zone. */
export function minutesTz(iso: string | Date, tz: string): number {
  const p = parts(new Date(iso), tz);
  return p.hour * 60 + p.minute;
}

/** "HH:mm" of an instant, in the time zone. */
export function timeTz(iso: string | Date, tz: string): string {
  const m = minutesTz(iso, tz);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** UTC ISO string for "dateKey at minutes since midnight" in the time zone (handles DST). */
export function zonedToUtcISO(dateKey: string, minutes: number, tz: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const wanted = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess), tz);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  return new Date(guess).toISOString();
}

export const hhmmToMinutes = (v: string): number => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

export function formatDateTz(
  iso: string,
  tz: string,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'full' },
): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
    ...opts,
    timeZone: tz,
  }).format(new Date(iso));
}
