import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { CalendarView } from '@/components/mawid/calendar-view';
import { ErrorState } from '@/components/mawid/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { parseState } from '@/lib/mock';

export default function CalendarPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { state?: string };
}) {
  setRequestLocale(params.locale);
  const t = useTranslations();
  const state = parseState(searchParams.state); // ?state=loading|empty|error

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
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
            <Link href="/dashboard/calendar">{t('common.retry')}</Link>
          </Button>
        }
      />
    );
  }
  const todayISO = new Date().toISOString().slice(0, 10); // business timezone is UTC (Nouakchott)
  return <CalendarView todayISO={todayISO} forceEmpty={state === 'empty'} />;
}
