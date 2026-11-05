'use client';

import type {
  AdminAiUsage,
  AdminBusiness,
  AdminStats,
  FailedNotification,
  BookingsPerDayPoint,
  InAppNotification,
  OwnerPayment,
  OwnerReview,
  PaymentStatus,
  PeakHour,
  PlanInfo,
  ReportSummary,
  TopService,
  ManualBookingInput,
  MoveBookingInput,
  ServiceInput,
  ServiceUpdateInput,
  StaffInput,
  StaffUpdateInput,
  TimeOffInput,
  UpdateBusinessInput,
  UpdateCustomerInput,
} from '@mawid/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type {
  ApiBookingStatus,
  BusinessDto,
  CustomerDetail,
  CustomerSummary,
  OwnerBooking,
  Page,
  ServiceDto,
  StaffDto,
  TimeOffDto,
  User,
  WorkingHoursRow,
} from '@/lib/types';

const ALL = '?pageSize=100';

/** null = not logged in. */
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<User | null> => {
      try {
        return await api<User>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

export const useBusiness = () =>
  useQuery({ queryKey: ['business'], queryFn: () => api<BusinessDto>('/businesses/me') });
export const useServices = () =>
  useQuery({ queryKey: ['services'], queryFn: () => api<Page<ServiceDto>>(`/services${ALL}`) });
export const useStaff = () =>
  useQuery({ queryKey: ['staff'], queryFn: () => api<Page<StaffDto>>(`/staff${ALL}`) });
export const useTimeOff = () =>
  useQuery({ queryKey: ['time-off'], queryFn: () => api<Page<TimeOffDto>>(`/time-off${ALL}`) });
export const useWorkingHours = (staffId: string | undefined) =>
  useQuery({
    queryKey: ['working-hours', staffId],
    queryFn: () => api<WorkingHoursRow[]>(`/staff/${staffId}/working-hours`),
    enabled: !!staffId,
  });

/** Mutation that refreshes the listed queries when it succeeds. */
function useApiMutation<V, R = unknown>(fn: (v: V) => Promise<R>, invalidate: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

export const useUpdateBusiness = () =>
  useApiMutation(
    (v: UpdateBusinessInput) => api<BusinessDto>('/businesses/me', { method: 'PATCH', body: v }),
    [['business']],
  );
export const useUploadLogo = () =>
  useApiMutation(
    (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<BusinessDto>('/businesses/me/logo', { method: 'POST', form });
    },
    [['business']],
  );

export const useCreateService = () =>
  useApiMutation(
    (v: ServiceInput) => api<ServiceDto>('/services', { method: 'POST', body: v }),
    [['services']],
  );
export const useUpdateService = () =>
  useApiMutation(
    (v: { id: string; data: ServiceUpdateInput }) =>
      api<ServiceDto>(`/services/${v.id}`, { method: 'PATCH', body: v.data }),
    [['services']],
  );
export const useDeleteService = () =>
  useApiMutation(
    (id: string) => api<void>(`/services/${id}`, { method: 'DELETE' }),
    [['services'], ['staff']],
  );

export const useCreateStaff = () =>
  useApiMutation(
    (v: StaffInput) => api<StaffDto>('/staff', { method: 'POST', body: v }),
    [['staff']],
  );
export const useUpdateStaff = () =>
  useApiMutation(
    (v: { id: string; data: StaffUpdateInput }) =>
      api<StaffDto>(`/staff/${v.id}`, { method: 'PATCH', body: v.data }),
    [['staff']],
  );
export const useDeleteStaff = () =>
  useApiMutation((id: string) => api<void>(`/staff/${id}`, { method: 'DELETE' }), [['staff']]);
export const useUploadStaffPhoto = () =>
  useApiMutation(
    (v: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', v.file);
      return api<StaffDto>(`/staff/${v.id}/photo`, { method: 'POST', form });
    },
    [['staff']],
  );
export const useSetWorkingHours = () =>
  useApiMutation(
    (v: { id: string; rows: WorkingHoursRow[] }) =>
      api<WorkingHoursRow[]>(`/staff/${v.id}/working-hours`, { method: 'PUT', body: v.rows }),
    [['working-hours']],
  );

export const useCreateTimeOff = () =>
  useApiMutation(
    (v: TimeOffInput) => api<TimeOffDto>('/time-off', { method: 'POST', body: v }),
    [['time-off']],
  );
export const useDeleteTimeOff = () =>
  useApiMutation(
    (id: string) => api<void>(`/time-off/${id}`, { method: 'DELETE' }),
    [['time-off']],
  );

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => qc.clear(),
  });
};

// Bookings, customers and notifications (phase 3)
export const useBookings = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: ['bookings', from, to],
    queryFn: () =>
      api<Page<OwnerBooking>>(
        `/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&pageSize=500`,
      ),
    enabled,
    placeholderData: (prev) => prev,
  });

const REFRESH_BOOKINGS = [['bookings'], ['customers'], ['customer'], ['notifications']];
export const useCreateManualBooking = () =>
  useApiMutation(
    (v: ManualBookingInput) => api<OwnerBooking>('/bookings', { method: 'POST', body: v }),
    REFRESH_BOOKINGS,
  );
export const useMoveBooking = () =>
  useApiMutation(
    (v: { id: string; data: MoveBookingInput }) =>
      api<OwnerBooking>(`/bookings/${v.id}`, { method: 'PATCH', body: v.data }),
    REFRESH_BOOKINGS,
  );
export const useBookingStatus = () =>
  useApiMutation(
    (v: { id: string; status: ApiBookingStatus }) =>
      api<OwnerBooking>(`/bookings/${v.id}/status`, {
        method: 'PATCH',
        body: { status: v.status },
      }),
    REFRESH_BOOKINGS,
  );

export const useCustomers = (q: string, page: number) =>
  useQuery({
    queryKey: ['customers', q, page],
    queryFn: () =>
      api<Page<CustomerSummary>>(
        `/customers?page=${page}&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    placeholderData: (prev) => prev,
  });
export const useCustomer = (id: string) =>
  useQuery({ queryKey: ['customer', id], queryFn: () => api<CustomerDetail>(`/customers/${id}`) });
export const useUpdateCustomer = () =>
  useApiMutation(
    (v: { id: string; data: UpdateCustomerInput }) =>
      api<CustomerDetail>(`/customers/${v.id}`, { method: 'PATCH', body: v.data }),
    [['customer'], ['customers']],
  );

export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api<Page<InAppNotification> & { unreadCount: number }>('/notifications?pageSize=20'),
    refetchInterval: 30_000,
  });
export const useReadNotifications = () =>
  useApiMutation(
    (id?: string) =>
      id
        ? api<void>(`/notifications/${id}/read`, { method: 'PATCH' })
        : api<void>('/notifications/read-all', { method: 'POST' }),
    [['notifications']],
  );

// ---------------------------------------------------------------------------------------------
// Phase 5: reports, plan, deposits, reviews, admin
// ---------------------------------------------------------------------------------------------
export interface DayRange {
  from: string;
  to: string;
}
const rangeQs = (r: DayRange) => `from=${r.from}&to=${r.to}`;

export const useReportSummary = (r: DayRange) =>
  useQuery({
    queryKey: ['report', 'summary', r],
    queryFn: () => api<ReportSummary>(`/reports/summary?${rangeQs(r)}`),
    placeholderData: (prev) => prev,
  });
export const useBookingsPerDay = (r: DayRange) =>
  useQuery({
    queryKey: ['report', 'per-day', r],
    queryFn: () => api<BookingsPerDayPoint[]>(`/reports/bookings-per-day?${rangeQs(r)}`),
    placeholderData: (prev) => prev,
  });
export const useTopServices = (r: DayRange) =>
  useQuery({
    queryKey: ['report', 'top', r],
    queryFn: () => api<TopService[]>(`/reports/top-services?${rangeQs(r)}`),
    placeholderData: (prev) => prev,
  });
export const usePeakHours = (r: DayRange) =>
  useQuery({
    queryKey: ['report', 'peak', r],
    queryFn: () => api<PeakHour[]>(`/reports/peak-hours?${rangeQs(r)}`),
    placeholderData: (prev) => prev,
  });

export const usePlan = () =>
  useQuery({ queryKey: ['plan'], queryFn: () => api<PlanInfo>('/businesses/me/plan') });

export const usePayments = (status: PaymentStatus | undefined, page: number) =>
  useQuery({
    queryKey: ['payments', status ?? 'all', page],
    queryFn: () =>
      api<Page<OwnerPayment>>(
        `/payments?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`,
      ),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });
const REFRESH_PAYMENTS = [['payments'], ['bookings'], ['notifications'], ['plan']];
export const useDecidePayment = () =>
  useApiMutation(
    (v: { id: string; action: 'validate' | 'reject' }) =>
      api<OwnerPayment>(`/payments/${v.id}/${v.action}`, { method: 'POST' }),
    REFRESH_PAYMENTS,
  );

export const useOwnerReviews = (page: number) =>
  useQuery({
    queryKey: ['reviews', page],
    queryFn: () => api<Page<OwnerReview>>(`/reviews?page=${page}&pageSize=20`),
    placeholderData: (prev) => prev,
  });
export const useReplyReview = () =>
  useApiMutation(
    (v: { id: string; reply: string }) =>
      api<OwnerReview>(`/reviews/${v.id}/reply`, { method: 'PATCH', body: { reply: v.reply } }),
    [['reviews']],
  );

export const useAdminBusinesses = (q: string, plan: string, suspended: string, page: number) =>
  useQuery({
    queryKey: ['admin', 'businesses', q, plan, suspended, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q) p.set('q', q);
      if (plan) p.set('plan', plan);
      if (suspended) p.set('suspended', suspended);
      return api<Page<AdminBusiness>>(`/admin/businesses?${p}`);
    },
    placeholderData: (prev) => prev,
  });
export const useAdminStats = () =>
  useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<AdminStats>('/admin/stats') });
export const useAdminAiUsage = () =>
  useQuery({
    queryKey: ['admin', 'ai-usage'],
    queryFn: () => api<AdminAiUsage[]>('/admin/ai-usage'),
  });
export const useAdminSuspend = () =>
  useApiMutation(
    (v: { id: string; suspended: boolean }) =>
      api<AdminBusiness>(`/admin/businesses/${v.id}/suspension`, {
        method: 'PATCH',
        body: { suspended: v.suspended },
      }),
    [['admin']],
  );
export const useAdminPlan = () =>
  useApiMutation(
    (v: { id: string; plan: string }) =>
      api<AdminBusiness>(`/admin/businesses/${v.id}/plan`, {
        method: 'PATCH',
        body: { plan: v.plan },
      }),
    [['admin']],
  );

export const useFailedNotifications = () =>
  useQuery({
    queryKey: ['admin', 'failed-notifications'],
    queryFn: () => api<Page<FailedNotification>>('/admin/failed-notifications?pageSize=50'),
    refetchInterval: 60_000,
  });
export const useRetryNotification = () =>
  useApiMutation(
    (id: string) => api(`/admin/failed-notifications/${id}/retry`, { method: 'POST' }),
    [['admin', 'failed-notifications']],
  );
