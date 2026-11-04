import { buildIcs, escapeIcsText, foldLine, googleCalendarUrl, icsDate } from './ics';

const event = {
  uid: 'abc@mawid',
  startsAt: new Date('2026-12-01T10:00:00Z'),
  endsAt: new Date('2026-12-01T10:30:00Z'),
  summary: 'Coupe - Salon Nour',
  description: 'Coupe (Sidi Mohamed)',
  location: 'Tevragh Zeina, Nouakchott',
};

describe('ics', () => {
  it('formats dates in UTC', () => {
    expect(icsDate(new Date('2026-03-09T04:05:06Z'))).toBe('20260309T040506Z');
  });

  it('builds a valid calendar with CRLF line endings', () => {
    const ics = buildIcs(event, new Date('2026-11-01T00:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('UID:abc@mawid\r\n');
    expect(ics).toContain('DTSTART:20261201T100000Z\r\n');
    expect(ics).toContain('DTEND:20261201T103000Z\r\n');
    expect(ics).toContain('DTSTAMP:20261101T000000Z\r\n');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('marks a cancelled booking as cancelled', () => {
    const ics = buildIcs({ ...event, cancelled: true });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('escapes special characters', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('omits the location when there is none', () => {
    expect(buildIcs({ ...event, location: null })).not.toContain('LOCATION');
  });

  it('folds long lines at 75 bytes and never cuts a character', () => {
    const line = 'DESCRIPTION:' + 'ا'.repeat(60); // Arabic letters are 2 bytes each
    const folded = foldLine(line);
    for (const part of folded.split('\r\n'))
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(foldLine('SHORT')).toBe('SHORT');
  });

  it('builds a Google Calendar link', () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('dates')).toBe('20261201T100000Z/20261201T103000Z');
    expect(url.searchParams.get('text')).toBe('Coupe - Salon Nour');
    expect(url.searchParams.get('location')).toBe('Tevragh Zeina, Nouakchott');
  });
});
