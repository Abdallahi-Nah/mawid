'use client';

import { CalendarCheck, CalendarDays, Download, Percent, Star, UserX, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AiTools } from '@/components/mawid/ai-tools';
import { BookingsChart } from '@/components/mawid/bookings-chart';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { PlanCard } from '@/components/mawid/plan-card';
import { Spinner } from '@/components/mawid/spinner';
import { StatCard } from '@/components/mawid/stat-card';
import { StatusBadge } from '@/components/mawid/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { downloadFile } from '@/lib/api';
import { intlLocale } from '@/lib/calendar';
import { formatPrice } from '@/lib/format';
import {
  useBookings,
  useBookingsPerDay,
  useBusiness,
  useMe,
  usePeakHours,
  useReportSummary,
  useTopServices,
} from '@/lib/queries';
import { badgeStatus } from '@/lib/status';
import { dayKeyTz, timeTz, zonedToUtcISO } from '@/lib/tz';

const RANGES = [7, 30, 90] as const;
const pct = (n: number): string => `${Math.round(n * 1000) / 10}%`;

/** Dashboard home: key figures, charts and today's appointments, all from the API (FR-80, FR-81). */
export function DashboardHome() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const me = useMe();
  const biz = useBusiness();
  const tz = biz.data?.timezone ?? 'UTC';
  const isOwner = me.data?.role === 'OWNER';
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [exporting, setExporting] = useState(false);

  const todayKey = dayKeyTz(new Date(), tz);
  const range = useMemo(() => {
    const to = todayKey;
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    return { from: d.toISOString().slice(0, 10), to };
  }, [todayKey, days]);

  const ready = isOwner && !!biz.data;
  const summary = useReportSummary(range);
  const perDay = useBookingsPerDay(range);
  const top = useTopServices(range);
  const peak = usePeakHours(range);

  const tomorrow = new Date(`${todayKey}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const todays = useBookings(
    zonedToUtcISO(todayKey, 0, tz),
    zonedToUtcISO(tomorrow.toISOString().slice(0, 10), 0, tz),
    !!biz.data,
  );

  const dayFmt = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const perDayData = (perDay.data ?? []).map((p) => ({
    label: dayFmt.format(new Date(`${p.date}T00:00:00Z`)),
    value: p.bookings,
  }));
  const peakData = useMemo(() => {
    const rows = peak.data ?? [];
    const used = rows.filter((r) => r.bookings > 0).map((r) => r.hour);
    const from = Math.min(8, ...used);
    const to = Math.max(19, ...used);
    return rows
      .filter((r) => r.hour >= from && r.hour <= to)
      .map((r) => ({ label: `${String(r.hour).padStart(2, '0')}:00`, value: r.bookings }));
  }, [peak.data]);

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadFile(
        `/reports/bookings.csv?from=${range.from}&to=${range.to}`,
        `bookings-${range.from}_${range.to}.csv`,
      );
    } catch {
      toast.error(t('home.exportError'));
    } finally {
      setExporting(false);
    }
  }

  const s = summary.data;
  const loadingStats = ready && !s;
  const noBooking = ready && !!s && s.total === 0;
  const topMax = Math.max(1, ...(top.data ?? []).map((x) => x.bookings));
  const todaysList = (todays.data?.items ?? []).filter((b) => b.status !== 'CANCELLED');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('dash.greeting', { name: me.data?.name ?? '' })}
          </h1>
          <p className="text-muted-foreground">
            {new Intl.DateTimeFormat(intlLocale(locale), {
              dateStyle: 'full',
              timeZone: tz,
            }).format(new Date())}
          </p>
        </div>
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label={t('home.range')} className="flex rounded-lg border p-0.5">
              {RANGES.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={d === days ? 'default' : 'ghost'}
                  aria-pressed={d === days}
                  onClick={() => setDays(d)}
                >
                  {t(`home.range${d}`)}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={exporting}
            >
              {exporting ? <Spinner /> : <Download aria-hidden className="me-2 size-4" />}
              {exporting ? t('home.exporting') : t('home.export')}
            </Button>
          </div>
        )}
      </header>

      {isOwner && summary.isError && (
        <ErrorState
          title={t('common.errorTitle')}
          description={t('home.loadError')}
          action={
            <Button variant="outline" onClick={() => summary.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      {isOwner && !summary.isError && (
        <>
          <section
            aria-label={t('dash.nav.dashboard')}
            aria-busy={loadingStats}
            className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3"
          >
            <StatCard
              label={t('home.today')}
              value={s ? String(s.today) : ''}
              loading={loadingStats}
              icon={<CalendarCheck aria-hidden className="size-4" />}
            />
            <StatCard
              label={t('home.week')}
              value={s ? String(s.thisWeek) : ''}
              loading={loadingStats}
              icon={<CalendarDays aria-hidden className="size-4" />}
            />
            <StatCard
              label={t('home.revenue')}
              value={s ? formatPrice(s.estimatedRevenue, locale) : ''}
              loading={loadingStats}
              icon={<Wallet aria-hidden className="size-4" />}
            />
            <StatCard
              label={t('home.cancelRate')}
              value={s ? pct(s.cancellationRate) : ''}
              loading={loadingStats}
              icon={<Percent aria-hidden className="size-4" />}
            />
            <StatCard
              label={t('home.noShowRate')}
              value={s ? pct(s.noShowRate) : ''}
              loading={loadingStats}
              icon={<UserX aria-hidden className="size-4" />}
            />
            <StatCard
              label={t('home.rating')}
              value={
                s
                  ? s.ratingAverage === null
                    ? t('home.ratingNone')
                    : `${s.ratingAverage} / 5 · ${t('home.reviewsCount', { count: s.reviewCount })}`
                  : ''
              }
              loading={loadingStats}
              icon={<Star aria-hidden className="size-4" />}
            />
          </section>

          {noBooking ? (
            <Card className="shadow-soft">
              <EmptyState
                title={t('home.emptyTitle')}
                description={t('home.emptyDesc')}
                action={
                  <Button asChild variant="outline">
                    <Link href="/dashboard/settings">{t('shareCard.title')}</Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle className="text-base">{t('home.perDay.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {perDay.isPending ? (
                    <Skeleton className="h-60 rounded-xl" />
                  ) : (
                    <BookingsChart
                      data={perDayData}
                      rtl={locale === 'ar'}
                      ariaLabel={t('home.perDay.aria')}
                      seriesLabel={t('home.perDay.series')}
                    />
                  )}
                </CardContent>
              </Card>
              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle className="text-base">{t('home.peak.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {peak.isPending ? (
                    <Skeleton className="h-60 rounded-xl" />
                  ) : (
                    <BookingsChart
                      data={peakData}
                      rtl={locale === 'ar'}
                      ariaLabel={t('home.peak.aria')}
                      seriesLabel={t('home.peak.series')}
                    />
                  )}
                </CardContent>
              </Card>
              <Card className="shadow-soft xl:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">{t('home.top.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {top.isPending ? (
                    <Skeleton className="h-24 rounded-xl" />
                  ) : (top.data?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('home.top.empty')}</p>
                  ) : (
                    <ol className="space-y-3">
                      {top.data?.map((x) => (
                        <li key={x.serviceId} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate font-medium">{x.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {t('home.top.bookings', { count: x.bookings })} ·{' '}
                              {formatPrice(x.revenue, locale)}
                            </span>
                          </div>
                          <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.round((x.bookings / topMax) * 100)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      <Card className="shadow-soft">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t('dash.appointments.title')}</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/calendar">{t('dash.appointments.viewCalendar')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {todays.isPending ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : todaysList.length === 0 ? (
            <EmptyState
              title={t('dash.appointments.emptyTitle')}
              description={t('dash.appointments.emptyDesc')}
            />
          ) : (
            <ul className="divide-y">
              {todaysList.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span dir="ltr" className="w-24 shrink-0 text-sm font-semibold tabular-nums">
                    {timeTz(b.startsAt, tz)} – {timeTz(b.endsAt, tz)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{b.customer.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {b.service.name} · {b.staff.displayName}
                    </span>
                  </span>
                  <StatusBadge
                    status={badgeStatus(b.status)}
                    label={t(`status.${badgeStatus(b.status)}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <>
          <PlanCard />
          <AiTools />
        </>
      )}
    </div>
  );
}
