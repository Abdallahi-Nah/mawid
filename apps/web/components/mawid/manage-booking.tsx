'use client';

import type { PublicBookingView, SlotsResponse } from '@mawid/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/mawid/confirm-dialog';
import { DatePicker } from '@/components/mawid/date-picker';
import { EmptyState } from '@/components/mawid/empty-state';
import { SlotPicker } from '@/components/mawid/slot-picker';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { toISO } from '@/lib/calendar';
import { errorMessage } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import { formatDateTz, timeTz } from '@/lib/tz';

const STATUS_KEY = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'noShow',
} as const;

/** Page opened from the link in the confirmation email: details, cancel and reschedule. */
export function ManageBooking({ initial, token }: { initial: PublicBookingView; token: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'ar' | 'fr' | 'en';
  const [view, setView] = useState(initial);
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [date, setDate] = useState<Date>();
  const [startsAt, setStartsAt] = useState<string>();
  const tz = view.business.timezone;

  const dateKey = date ? toISO(date) : undefined;
  const slotsQuery = useQuery({
    queryKey: ['reslots', token, dateKey],
    queryFn: () =>
      api<SlotsResponse>(
        `/public/businesses/${view.business.slug}/slots?serviceId=${view.service.id}&staffId=${view.staff.id}&date=${dateKey}`,
      ),
    enabled: mode === 'reschedule' && !!dateKey,
    staleTime: 0,
  });
  const slots = useMemo(
    () =>
      (slotsQuery.data?.slots ?? []).map((s) => ({ time: timeTz(s.start, tz), start: s.start })),
    [slotsQuery.data, tz],
  );

  async function act(path: 'cancel' | 'reschedule', body?: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      const next = await api<PublicBookingView>(`/public/bookings/${token}/${path}`, {
        method: 'POST',
        body: body ?? {},
      });
      setView(next);
      setMode('view');
      toast.success(t(path === 'cancel' ? 'manage.cancelled' : 'manage.rescheduled'));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SLOT_TAKEN') {
        setStartsAt(undefined);
        void slotsQuery.refetch();
      }
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  const closed =
    view.status === 'CANCELLED' || view.status === 'COMPLETED' || view.status === 'NO_SHOW';
  const whenDate = formatDateTz(view.startsAt, tz, locale);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('manage.title')}</h1>
      <Card className="space-y-4 p-5 shadow-soft">
        <p
          role="status"
          className={
            view.status === 'CANCELLED'
              ? 'rounded-lg bg-destructive-soft p-3 text-sm font-medium text-destructive'
              : 'rounded-lg bg-secondary p-3 text-sm font-medium'
          }
        >
          {t(`status.${STATUS_KEY[view.status]}`)}
        </p>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('steps.service')}</dt>
            <dd className="font-medium">
              {view.service.name} · {t('service.duration', { minutes: view.service.durationMin })}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('book.with')}</dt>
            <dd className="font-medium">{view.staff.displayName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('book.when')}</dt>
            <dd className="font-medium">
              {whenDate} · <span dir="ltr">{timeTz(view.startsAt, tz)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('manage.place')}</dt>
            <dd className="font-medium">
              {view.business.name}
              {view.business.address ? ` · ${view.business.address}` : ''}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <dt className="text-muted-foreground">{t('book.total')}</dt>
            <dd className="text-lg font-semibold">{formatPrice(view.price, locale)}</dd>
          </div>
        </dl>
      </Card>

      {!closed && (
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <a href={view.icsUrl}>
              <CalendarPlus aria-hidden className="size-4" />
              {t('book.icsFile')}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={view.googleCalendarUrl} target="_blank" rel="noopener noreferrer">
              Google
            </a>
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {!closed && !view.canChange && (
        <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
          {t('manage.tooLate', { hours: view.cancelLimitHours })}
          {view.business.phone ? ` ${t('manage.callUs', { phone: view.business.phone })}` : ''}
        </p>
      )}

      {!closed && view.canChange && mode === 'view' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => setMode('reschedule')}>
            {t('manage.reschedule')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(true)}>
            {t('manage.cancel')}
          </Button>
        </div>
      )}

      {mode === 'reschedule' && (
        <Card className="space-y-4 p-5 shadow-soft">
          <h2 className="font-semibold">{t('manage.pickNew')}</h2>
          <DatePicker
            value={date}
            onChange={(d) => {
              setDate(d);
              setStartsAt(undefined);
            }}
            placeholder={t('booking.datePlaceholder')}
            label={t('booking.dateLabel')}
          />
          <div aria-live="polite" className="space-y-2">
            {!date && <p className="text-sm text-muted-foreground">{t('book.pickDateFirst')}</p>}
            {date && slotsQuery.isFetching && (
              <div aria-busy="true" className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-11" />
                ))}
              </div>
            )}
            {date && slotsQuery.isError && (
              <p role="alert" className="text-sm text-destructive">
                {t('book.slotsError')}
              </p>
            )}
            {date && !slotsQuery.isFetching && !slotsQuery.isError && slots.length === 0 && (
              <EmptyState title={t('book.noSlotsTitle')} description={t('book.noSlotsDesc')} />
            )}
            {date && !slotsQuery.isFetching && slots.length > 0 && (
              <SlotPicker
                slots={slots}
                value={startsAt ? timeTz(startsAt, tz) : undefined}
                onChange={(tm) => setStartsAt(slots.find((x) => x.time === tm)?.start)}
                label={t('booking.slotsLabel')}
              />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setMode('view')}>
              {t('common.back')}
            </Button>
            <Button
              className="flex-1"
              disabled={!startsAt || busy}
              onClick={() => act('reschedule', { startsAt })}
            >
              {busy && <Spinner />}
              {t('manage.confirmNew')}
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('manage.cancelTitle')}
        description={t('manage.cancelDesc')}
        busy={busy}
        confirmLabel={t('manage.cancelConfirm')}
        error={error}
        onConfirm={() => act('cancel').then(() => setConfirmOpen(false))}
      />

      <Button asChild variant="ghost" className="w-full">
        <Link href={`/b/${view.business.slug}`}>{t('book.backToBusiness')}</Link>
      </Button>
    </div>
  );
}
