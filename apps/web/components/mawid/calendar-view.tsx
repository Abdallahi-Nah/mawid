'use client';

import { ChevronLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/mawid/empty-state';
import { StatusBadge } from '@/components/mawid/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Locale } from '@/i18n/routing';
import { addDays, fmtTime, intlLocale, monthGrid, parseISO, sameDay, toISO, weekDays, weekStartsOn } from '@/lib/calendar';
import { formatPrice } from '@/lib/format';
import { appointmentsFor, STAFF_IDS, type Appointment, type StaffId } from '@/lib/mock-calendar';
import { cn } from '@/lib/utils';

type View = 'day' | 'week' | 'month';

const DAY_START = 8; // hours
const DAY_END = 19;
const HOUR_H = 64; // px

// Static class names so Tailwind can generate them.
const staffStyle: Record<StaffId, { event: string; dot: string }> = {
  one: { event: 'border-chart-1 bg-chart-1/15', dot: 'bg-chart-1' },
  two: { event: 'border-chart-2 bg-chart-2/15', dot: 'bg-chart-2' },
  three: { event: 'border-chart-3 bg-chart-3/15', dot: 'bg-chart-3' },
};

export function CalendarView({ todayISO, forceEmpty }: { todayISO: string; forceEmpty?: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const rtl = locale === 'ar';
  const intl = intlLocale(locale);
  const wso = weekStartsOn(locale);

  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(() => parseISO(todayISO));
  const [staff, setStaff] = useState<'all' | StaffId>('all');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const today = parseISO(todayISO);

  const days = useMemo(
    () => (view === 'day' ? [cursor] : view === 'week' ? weekDays(cursor, wso) : monthGrid(cursor, wso)),
    [view, cursor, wso],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const d of days) {
      const list = forceEmpty ? [] : appointmentsFor(d, todayISO).filter((a) => staff === 'all' || a.staff === staff);
      map.set(toISO(d), list);
    }
    return map;
  }, [days, staff, todayISO, forceEmpty]);
  const inPeriod = days.filter((d) => view !== 'month' || d.getMonth() === cursor.getMonth());
  const total = inPeriod.reduce((n, d) => n + (byDay.get(toISO(d))?.length ?? 0), 0);

  const move = (dir: 1 | -1) =>
    setCursor((c) =>
      view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1),
    );

  const label = (() => {
    if (view === 'day') return new Intl.DateTimeFormat(intl, { dateStyle: 'full' }).format(cursor);
    if (view === 'month') return new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric' }).format(cursor);
    const f = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric' });
    return f.formatRange(days[0], days[6]);
  })();
  const weekday = (d: Date, style: 'short' | 'long' = 'short') => new Intl.DateTimeFormat(intl, { weekday: style }).format(d);
  const dayNum = (d: Date) => new Intl.DateTimeFormat(intl, { day: 'numeric' }).format(d);
  const initials = (id: StaffId) => t(`mock.team.${id}.name`).split(' ').slice(0, 2).map((w) => w[0]).join('');

  const openDay = (d: Date) => {
    setCursor(d);
    setView('day');
  };

  // Plain render function (not a component) so the buttons keep their identity and focus across renders.
  const renderEvent = (a: Appointment, opts: { compact?: boolean; className?: string; style?: React.CSSProperties } = {}) => {
    const { compact, className, style } = opts;
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => setSelected(a)}
        style={style}
        className={cn(
          'block w-full overflow-hidden rounded-md border-s-4 px-2 py-1 text-start text-xs leading-tight transition-shadow hover:shadow-soft',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          staffStyle[a.staff].event,
          a.status === 'cancelled' && 'opacity-60 line-through',
          className,
        )}
      >
        <span dir="ltr" className="font-semibold tabular-nums">{fmtTime(a.start)}</span>{' '}
        <span className="font-medium">{t(`mock.clients.${a.client}`)}</span>
        {!compact && <span className="block truncate text-muted-foreground">{t(`mock.services.${a.service}`)}</span>}
      </button>
    );
  }

  const columns = staff === 'all' ? STAFF_IDS : [staff];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold tracking-tight">{t('cal.title')}</h1>
        <Tabs value={view} onValueChange={(v) => setView(v as View)} dir={rtl ? 'rtl' : 'ltr'}>
          <TabsList aria-label={t('cal.viewsAria')}>
            {(['day', 'week', 'month'] as const).map((v) => (
              <TabsTrigger key={v} value={v}>{t(`cal.views.${v}`)}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label={t('cal.prev')} onClick={() => move(-1)}>
          <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
        </Button>
        <Button variant="outline" size="icon" aria-label={t('cal.next')} onClick={() => move(1)}>
          <ChevronLeft aria-hidden className="size-4 rotate-180 rtl:rotate-0" />
        </Button>
        <Button variant="outline" onClick={() => setCursor(today)}>{t('cal.today')}</Button>
        <p aria-live="polite" suppressHydrationWarning className="min-w-0 flex-1 basis-full truncate px-1 font-semibold sm:basis-auto">{label}</p>
        <Select value={staff} onValueChange={(v) => setStaff(v as 'all' | StaffId)} dir={rtl ? 'rtl' : 'ltr'}>
          <SelectTrigger aria-label={t('cal.filterStaff')} className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('cal.allStaff')}</SelectItem>
            {STAFF_IDS.map((id) => (
              <SelectItem key={id} value={id}>{t(`mock.team.${id}.name`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {STAFF_IDS.map((id) => (
          <li key={id} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2.5 rounded-full', staffStyle[id].dot)} />
            {t(`mock.team.${id}.name`)}
          </li>
        ))}
      </ul>

      {total === 0 ? (
        <Card className="shadow-soft">
          <EmptyState title={t('cal.emptyTitle')} description={t('cal.emptyDesc')} />
        </Card>
      ) : view === 'day' ? (
        <Card className="overflow-hidden shadow-soft">
          <div className="flex border-b ps-12 text-sm font-medium">
            {columns.map((id) => (
              <div key={id} className="flex flex-1 items-center justify-center gap-2 border-s px-1 py-2 first:border-s-0">
                <span aria-hidden className={cn('size-2.5 rounded-full', staffStyle[id].dot)} />
                <span className="truncate" title={t(`mock.team.${id}.name`)}>{initials(id)}</span>
              </div>
            ))}
          </div>
          <div className="relative" style={{ height: (DAY_END - DAY_START) * HOUR_H }}>
            {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
              <div key={i} aria-hidden className="absolute inset-x-0 border-t" style={{ top: i * HOUR_H }}>
                <span dir="ltr" className="absolute start-1 -top-2.5 bg-card px-0.5 text-xs text-muted-foreground tabular-nums">
                  {fmtTime((DAY_START + i) * 60)}
                </span>
              </div>
            ))}
            <div className="absolute inset-y-0 end-0 start-12 grid" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
              {columns.map((id) => (
                <div key={id} className="relative border-s first:border-s-0">
                  {(byDay.get(toISO(cursor)) ?? []).filter((a) => a.staff === id).map((a) => (
                    renderEvent(a, {
                      className: 'absolute inset-x-0.5 !w-auto',
                      style: {
                        top: ((a.start - DAY_START * 60) / 60) * HOUR_H + 1,
                        height: (a.duration / 60) * HOUR_H - 2,
                      },
                    })
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : view === 'week' ? (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const list = byDay.get(toISO(d)) ?? [];
            const isToday = sameDay(d, today);
            return (
              <Card key={toISO(d)} className={cn('flex flex-col gap-2 p-2 shadow-soft', isToday && 'border-primary')}>
                <button
                  type="button"
                  onClick={() => openDay(d)}
                  aria-label={t('cal.openDay', { date: weekday(d, 'long') + ' ' + dayNum(d) })}
                  className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-start hover:bg-muted md:flex-col md:items-start md:gap-0"
                >
                  <span className="text-xs text-muted-foreground">{weekday(d)}</span>
                  <span className={cn('flex size-7 items-center justify-center rounded-full text-sm font-semibold', isToday && 'bg-primary text-primary-foreground')}>
                    {dayNum(d)}
                  </span>
                </button>
                <div className="space-y-1.5">
                  {list.length === 0 ? (
                    <span aria-hidden className="block px-1 text-xs text-muted-foreground">—</span>
                  ) : (
                    list.map((a) => renderEvent(a, { compact: true }))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden shadow-soft">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
            {weekDays(cursor, wso).map((d) => (
              <div key={d.getDay()} className="py-2">{weekday(d)}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {days.map((d) => {
              const list = byDay.get(toISO(d)) ?? [];
              const outside = d.getMonth() !== cursor.getMonth();
              const isToday = sameDay(d, today);
              return (
                <button
                  key={toISO(d)}
                  type="button"
                  onClick={() => openDay(d)}
                  aria-label={t('cal.openDay', { date: weekday(d, 'long') + ' ' + dayNum(d) })}
                  className={cn(
                    'flex min-h-16 flex-col items-stretch gap-1 bg-card p-1 text-start transition-colors hover:bg-muted md:min-h-28 md:p-1.5',
                    'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    outside && 'bg-muted/30 text-muted-foreground',
                  )}
                >
                  <span className={cn('flex size-6 items-center justify-center self-start rounded-full text-xs font-semibold', isToday && 'bg-primary text-primary-foreground')}>
                    {dayNum(d)}
                  </span>
                  <span className="hidden space-y-1 md:block">
                    {list.slice(0, 2).map((a) => (
                      <span key={a.id} className={cn('block truncate rounded border-s-4 px-1.5 py-0.5 text-[11px]', staffStyle[a.staff].event)}>
                        <span dir="ltr" className="tabular-nums">{fmtTime(a.start)}</span> {t(`mock.clients.${a.client}`)}
                      </span>
                    ))}
                    {list.length > 2 && <span className="block px-1 text-[11px] text-muted-foreground">{t('cal.more', { count: list.length - 2 })}</span>}
                  </span>
                  <span aria-hidden className="flex flex-wrap gap-0.5 md:hidden">
                    {list.slice(0, 6).map((a) => <span key={a.id} className={cn('size-1.5 rounded-full', staffStyle[a.staff].dot)} />)}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{t(`mock.services.${selected.service}`)}</DialogTitle>
                <DialogDescription>
                  {new Intl.DateTimeFormat(intl, { dateStyle: 'full' }).format(parseISO(selected.date))} ·{' '}
                  <span dir="ltr">{fmtTime(selected.start)} – {fmtTime(selected.start + selected.duration)}</span>
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
                <dt className="text-muted-foreground">{t('table.client')}</dt>
                <dd className="font-medium">{t(`mock.clients.${selected.client}`)}</dd>
                <dt className="text-muted-foreground">{t('book.with')}</dt>
                <dd className="font-medium">{t(`mock.team.${selected.staff}.name`)}</dd>
                <dt className="text-muted-foreground">{t('cal.duration')}</dt>
                <dd className="font-medium">{t('service.duration', { minutes: selected.duration })}</dd>
                <dt className="text-muted-foreground">{t('cal.price')}</dt>
                <dd className="font-medium">{formatPrice(selected.price, locale)}</dd>
                <dt className="text-muted-foreground">{t('table.status')}</dt>
                <dd><StatusBadge status={selected.status} label={t(`status.${selected.status}`)} /></dd>
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
