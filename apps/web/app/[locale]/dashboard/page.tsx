import { CalendarCheck, Percent, Sparkles, UserPlus, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { BookingsChart } from '@/components/mawid/bookings-chart';
import { AiTools } from '@/components/mawid/ai-tools';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { StatCard } from '@/components/mawid/stat-card';
import { StatusBadge } from '@/components/mawid/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { addDays, fmtTime, intlLocale, parseISO } from '@/lib/calendar';
import { formatDate, formatPrice } from '@/lib/format';
import { parseState } from '@/lib/mock';
import { appointmentsFor } from '@/lib/mock-calendar';

export default function DashboardPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { state?: string };
}) {
  setRequestLocale(params.locale);
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const state = parseState(searchParams.state); // ?state=loading|empty|error
  const todayISO = new Date().toISOString().slice(0, 10); // business timezone is UTC (Nouakchott)
  const today = parseISO(todayISO);

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <StatCard key={i} label="" value="" loading />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <ErrorState
        className="py-24"
        title={t('common.errorTitle')}
        description={t('common.errorDesc')}
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">{t('common.retry')}</Link>
          </Button>
        }
      />
    );
  }
  const empty = state === 'empty';

  const wd = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short' });
  const chart = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    return {
      label: wd.format(d),
      value: empty
        ? 0
        : appointmentsFor(d, todayISO).filter((a) => a.status !== 'cancelled').length,
    };
  });
  const todays = empty ? [] : appointmentsFor(today, todayISO);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {t('dash.greeting', { name: t('mock.owner') })}
        </h1>
        <p className="text-muted-foreground">{formatDate(today, locale)}</p>
      </header>

      <section
        aria-label={t('dash.nav.dashboard')}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label={t('stat.bookings')}
          value={empty ? '0' : '128'}
          icon={<CalendarCheck aria-hidden className="size-4" />}
          delta={empty ? undefined : 12}
          deltaLabel={t('stat.vsLastWeek')}
        />
        <StatCard
          label={t('stat.revenue')}
          value={formatPrice(empty ? 0 : 42500, locale)}
          icon={<Wallet aria-hidden className="size-4" />}
          delta={empty ? undefined : 8}
          deltaLabel={t('stat.vsLastWeek')}
        />
        <StatCard
          label={t('stat.newClients')}
          value={empty ? '0' : '23'}
          icon={<UserPlus aria-hidden className="size-4" />}
          delta={empty ? undefined : 5}
          deltaLabel={t('stat.vsLastWeek')}
        />
        <StatCard
          label={t('stat.occupancy')}
          value={empty ? '0%' : '78%'}
          icon={<Percent aria-hidden className="size-4" />}
          delta={empty ? undefined : -3}
          deltaLabel={t('stat.vsLastWeek')}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">{t('dash.chart.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {empty ? (
              <EmptyState title={t('empty.title')} description={t('empty.description')} />
            ) : (
              <BookingsChart
                data={chart}
                rtl={locale === 'ar'}
                ariaLabel={t('dash.chart.aria')}
                seriesLabel={t('dash.chart.series')}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-gradient-to-br from-secondary to-card shadow-soft">
          <CardHeader className="space-y-3">
            <Badge variant="secondary" className="w-fit gap-1.5 bg-background">
              <Sparkles aria-hidden className="size-3.5 text-primary" />
              {t('dash.ai.badge')}
            </Badge>
            <CardTitle className="text-base">{t('dash.ai.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {empty ? (
              <p className="text-muted-foreground">{t('dash.ai.empty')}</p>
            ) : (
              <>
                <p className="leading-relaxed">{t('dash.ai.text')}</p>
                <ul className="list-disc space-y-1.5 ps-5 text-muted-foreground marker:text-primary">
                  <li>{t('dash.ai.p1')}</li>
                  <li>{t('dash.ai.p2')}</li>
                  <li>{t('dash.ai.p3')}</li>
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-soft">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t('dash.appointments.title')}</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/calendar">{t('dash.appointments.viewCalendar')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {todays.length === 0 ? (
            <EmptyState
              title={t('dash.appointments.emptyTitle')}
              description={t('dash.appointments.emptyDesc')}
            />
          ) : (
            <ul className="divide-y">
              {todays.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span dir="ltr" className="w-24 shrink-0 text-sm font-semibold tabular-nums">
                    {fmtTime(a.start)} – {fmtTime(a.start + a.duration)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {t(`mock.clients.${a.client}`)}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {t(`mock.services.${a.service}`)} · {t(`mock.team.${a.staff}.name`)}
                    </span>
                  </span>
                  <StatusBadge status={a.status} label={t(`status.${a.status}`)} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AiTools />
    </div>
  );
}
