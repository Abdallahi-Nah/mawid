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
  minNoticeHours: number;
  maxDaysAhead: number;
  slotStepMin: number;
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

export type ApiBookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export interface OwnerBooking {
  id: string;
  status: ApiBookingStatus;
  source: string;
  startsAt: string;
  endsAt: string;
  price: number;
  notes: string | null;
  customer: { id: string; name: string; phone: string; email: string | null };
  service: { id: string; name: string; durationMin: number };
  staff: { id: string; displayName: string };
}
export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  visitsCount: number;
  noShowCount: number;
  bookingsCount: number;
  lastBookingAt: string | null;
}
export interface CustomerDetail extends CustomerSummary {
  notes: string | null;
  createdAt: string;
  history: {
    id: string;
    status: ApiBookingStatus;
    startsAt: string;
    price: number;
    serviceName: string;
    staffName: string;
  }[];
}
export type { InAppNotification } from '@mawid/shared';
