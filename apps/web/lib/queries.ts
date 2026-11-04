'use client';

import type {
  InAppNotification,
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
