import type { BookingStatus } from '@/components/mawid/status-badge';
import type { ApiBookingStatus } from '@/lib/types';

const MAP: Record<ApiBookingStatus, BookingStatus> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'noShow',
};
export const badgeStatus = (s: ApiBookingStatus): BookingStatus => MAP[s];

/** Same life cycle as the API (apps/api/src/bookings/status.ts). */
export const NEXT_STATUSES: Record<ApiBookingStatus, ApiBookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
export const isOpen = (s: ApiBookingStatus): boolean => s === 'PENDING' || s === 'CONFIRMED';
