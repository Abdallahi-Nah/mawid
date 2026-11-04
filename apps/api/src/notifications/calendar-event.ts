import type { CalendarEvent } from './ics';

/** What the calendar file and the Google link need from a booking. */
export function calendarEvent(b: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  service: { name: string };
  staff: { displayName: string };
  business: { name: string; address: string | null };
}): CalendarEvent {
  return {
    uid: `${b.id}@mawid`,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    summary: `${b.service.name} - ${b.business.name}`,
    description: `${b.service.name} (${b.staff.displayName}) - ${b.business.name}`,
    location: b.business.address,
    cancelled: b.status === 'CANCELLED',
  };
}
