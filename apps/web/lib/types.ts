import type { Page, WorkingHoursRow } from '@mawid/shared';

export type { Page, WorkingHoursRow };
export type Role = 'CLIENT' | 'STAFF' | 'OWNER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  businessId: string | null;
  locale: string;
}
export interface BusinessDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  category: string | null;
  timezone: string;
  defaultLocale: string;
  brandColor: string | null;
  bookingMode: 'AUTO' | 'MANUAL';
  cancelLimitHours: number;
}
export interface ServiceDto {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  category: string | null;
  bufferMin: number;
  active: boolean;
}
export interface StaffDto {
  id: string;
  displayName: string;
  photoUrl: string | null;
  active: boolean;
  serviceIds: string[];
}
export interface TimeOffDto {
  id: string;
  staffId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}
