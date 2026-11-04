import type { BookingStatus } from '@/components/mawid/status-badge';
import { business } from '@/lib/mock';
import { toISO } from '@/lib/calendar';

export type StaffId = 'one' | 'two' | 'three';
export const STAFF_IDS: StaffId[] = ['one', 'two', 'three'];
export const CLIENT_IDS = ['one', 'two', 'three', 'four', 'five', 'six'] as const;
export type ServiceId = (typeof business.services)[number]['id'];

export interface Appointment {
  id: string;
  date: string; // YYYY-MM-DD
  start: number; // minutes from midnight
  duration: number; // minutes
  staff: StaffId;
  service: ServiceId;
  client: (typeof CLIENT_IDS)[number];
  status: BookingStatus;
  price: number;
}

/** Deterministic fake appointments for one day. Friday is closed. One staff member never overlaps. */
export function appointmentsFor(date: Date, todayISO: string): Appointment[] {
  if (date.getDay() === 5) return [];
  const iso = toISO(date);
  const n = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const out: Appointment[] = [];
  STAFF_IDS.forEach((staff, s) => {
    const count = 1 + ((n + s) % 3);
    for (let k = 0; k < count; k++) {
      const seed = n * 7 + s * 3 + k;
      const svc = business.services[seed % business.services.length];
      const start = 9 * 60 + k * 120 + ((n + s) % 2) * 30;
      let status: BookingStatus;
      if (iso < todayISO) status = seed % 11 === 0 ? 'noShow' : seed % 7 === 0 ? 'cancelled' : 'completed';
      else if (iso === todayISO) status = start < 12 * 60 ? 'completed' : seed % 5 === 0 ? 'pending' : 'confirmed';
      else status = seed % 13 === 0 ? 'cancelled' : seed % 5 === 0 ? 'pending' : 'confirmed';
      out.push({
        id: `${iso}-${staff}-${k}`,
        date: iso,
        start,
        duration: svc.minutes,
        staff,
        service: svc.id,
        client: CLIENT_IDS[(n + s + k) % CLIENT_IDS.length],
        status,
        price: svc.price,
      });
    }
  });
  return out.sort((a, b) => a.start - b.start);
}
