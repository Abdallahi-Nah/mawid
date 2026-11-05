'use client';

import { ChevronLeft, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { NewBookingDialog } from '@/components/mawid/new-booking-dialog';
import { Spinner } from '@/components/mawid/spinner';
import { StatusBadge } from '@/components/mawid/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import {
  addDays,
  fmtTime,
  intlLocale,
  monthGrid,
  parseISO,
  sameDay,
  toISO,
  weekDays,
  weekStartsOn,
} from '@/lib/calendar';
import { errorMessage } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import {
  useBookings,
  useBookingStatus,
  useBusiness,
  useMoveBooking,
  useStaff,
} from '@/lib/queries';
import { badgeStatus, isOpen, NEXT_STATUSES } from '@/lib/status';
import { dayKeyTz, hhmmToMinutes, minutesTz, zonedToUtcISO } from '@/lib/tz';
import type { OwnerBooking } from '@/lib/types';
import { cn } from '@/lib/utils';

type View = 'day' | 'week' | 'month';
interface Local {
  b: OwnerBooking;
  dateKey: string;
  start: number; // minutes since local midnight
  end: number;
}

const HOUR_H = 64; // px

// Static class names so Tailwind can generate them.
const palette = [
  { event: 'border-chart-1 bg-chart-1/15', dot: 'bg-chart-1' },
  { event: 'border-chart-2 bg-chart-2/15', dot: 'bg-chart-2' },
  { event: 'border-chart-3 bg-chart-3/15', dot: 'bg-chart-3' },
  { event: 'border-chart-4 bg-chart-4/15', dot: 'bg-chart-4' },
  { event: 'border-chart-5 bg-chart-5/15', dot: 'bg-chart-5' },
];

export function CalendarView() {
  const t = useTranslations();
  const biz = useBusiness();
  const staff = useStaff();
  if (biz.isError || staff.isError) {
    return (
      <ErrorState
        className="py-24"
        title={t('common.errorTitle')}
        description={t('common.errorDesc')}
        action={
          <Button
            variant="outline"
            onClick={() => {
              void biz.refetch();
              void staff.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        }
      />
    );
  }
  if (!biz.data || !staff.data) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  return (
    <Calendar
      tz={biz.data.timezone}
      step={biz.data.slotStepMin ?? 15}
      team={staff.data.items.filter((m) => m.active)}
    />
  );
}

function Calendar({
  tz,
  step,
  team,
}: {
  tz: string;
  step: number;
  team: { id: string; displayName: string }[];
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const rtl = locale === 'ar';
  const intl = intlLocale(locale);
  const wso = weekStartsOn(locale);
  const todayKey = dayKeyTz(new Date(), tz);
  const today = parseISO(todayKey);

  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(today);
  const [staffFilter, setStaffFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const drag = useRef<{ id: string; grab: number } | null>(null);
  const move = useMoveBooking();

  const days = useMemo(
    () =>
      view === 'day' ? [cursor] : view === 'week' ? weekDays(cursor, wso) : monthGrid(cursor, wso),
    [view, cursor, wso],
  );
  const from = zonedToUtcISO(toISO(days[0]), 0, tz);
  const to = zonedToUtcISO(toISO(addDays(days[days.length - 1], 1)), 0, tz);
  const q = useBookings(from, to);

  const colorOf = (staffId: string) =>
    palette[
      Math.max(
        0,
        team.findIndex((m) => m.id === staffId),
      ) % palette.length
    ];
  const items = useMemo<Local[]>(
    () =>
      (q.data?.items ?? [])
        .filter((b) => staffFilter === 'all' || b.staff.id === staffFilter)
        .map((b) => {
          const dateKey = dayKeyTz(b.startsAt, tz);
          const start = minutesTz(b.startsAt, tz);
          const sameDayEnd = dayKeyTz(b.endsAt, tz) === dateKey;
          return { b, dateKey, start, end: sameDayEnd ? minutesTz(b.endsAt, tz) : 1440 };
        }),
    [q.data, staffFilter, tz],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Local[]>();
    for (const l of items) map.set(l.dateKey, [...(map.get(l.dateKey) ?? []), l]);
    return map;
  }, [items]);
  const listOf = (d: Date) => byDay.get(toISO(d)) ?? [];
  const inPeriod = days.filter((d) => view !== 'month' || d.getMonth() === cursor.getMonth());
  const total = inPeriod.reduce((n, d) => n + listOf(d).length, 0);
  const selected = q.data?.items.find((b) => b.id === selectedId) ?? null;

  const step_ = (dir: 1 | -1) =>
    setCursor((c) =>
      view === 'day'
        ? addDays(c, dir)
        : view === 'week'
          ? addDays(c, 7 * dir)
          : new Date(c.getFullYear(), c.getMonth() + dir, 1),
    );
  const label = (() => {
    if (view === 'day') return new Intl.DateTimeFormat(intl, { dateStyle: 'full' }).format(cursor);
    if (view === 'month')
      return new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric' }).format(cursor);
    const f = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric' });
    return f.formatRange(days[0], days[6]);
  })();
  const weekday = (d: Date, style: 'short' | 'long' = 'short') =>
    new Intl.DateTimeFormat(intl, { weekday: style }).format(d);
  const dayNum = (d: Date) => new Intl.DateTimeFormat(intl, { day: 'numeric' }).format(d);
  const initials = (name: string) =>
    name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('');
  const openDay = (d: Date) => {
    setCursor(d);
    setView('day');
  };

  function moveTo(id: string, dateKey: string, minutes: number, staffId?: string) {
    const clamped = Math.max(0, Math.min(1439, minutes));
    move.mutate(
      {
        id,
        data: { startsAt: zonedToUtcISO(dateKey, clamped, tz), ...(staffId ? { staffId } : {}) },
      },
      {
        onSuccess: () => toast.success(t('cal.moved')),
        onError: (e) => toast.error(errorMessage(t, e)),
      },
    );
  }

  const onDragStart = (e: React.DragEvent<HTMLElement>, b: OwnerBooking) => {
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { id: b.id, grab: e.clientY - rect.top };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', b.id);
  };
  const allowDrop = (e: React.DragEvent) => {
    if (drag.current) e.preventDefault();
  };
  const dropOnDay = (e: React.DragEvent, d: Date) => {
    e.preventDefault();
    const cur = drag.current;
    drag.current = null;
    const b = q.data?.items.find((x) => x.id === cur?.id);
    if (!b) return;
    moveTo(b.id, toISO(d), minutesTz(b.startsAt, tz)); // same time, other day
  };
  const dropOnColumn = (e: React.DragEvent<HTMLElement>, staffId: string, startHour: number) => {
    e.preventDefault();
    const cur = drag.current;
    drag.current = null;
    const b = q.data?.items.find((x) => x.id === cur?.id);
    if (!b || !cur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = ((e.clientY - rect.top - cur.grab) / HOUR_H) * 60 + startHour * 60;
    const minutes = Math.round(raw / step) * step;
    moveTo(b.id, toISO(cursor), minutes, staffId !== b.staff.id ? staffId : undefined);
  };

  // Plain render function (not a component) so the buttons keep their identity and focus across renders.
  const renderEvent = (
    l: Local,
    opts: { compact?: boolean; className?: string; style?: React.CSSProperties } = {},
  ) => {
    const { b } = l;
    return (
      <button
        key={b.id}
        type="button"
        draggable={isOpen(b.status)}
        onDragStart={(e) => onDragStart(e, b)}
        onDragEnd={() => (drag.current = null)}
        onClick={() => setSelectedId(b.id)}
        style={opts.style}
        className={cn(
          'block w-full overflow-hidden rounded-md border-s-4 px-2 py-1 text-start text-xs leading-tight transition-shadow hover:shadow-soft',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          colorOf(b.staff.id).event,
          isOpen(b.status) && 'cursor-grab',
          b.status === 'CANCELLED' && 'text-muted-foreground line-through',
          b.status === 'PENDING' && 'border-dashed',
          opts.className,
        )}
      >
        <span dir="ltr" className="font-semibold tabular-nums">
          {fmtTime(l.start)}
        </span>{' '}
        <span className="font-medium">{b.customer.name}</span>
        {!opts.compact && (
          <span className="block truncate text-muted-foreground">{b.service.name}</span>
        )}
      </button>
    );
  };

  const columns = staffFilter === 'all' ? team : team.filter((m) => m.id === staffFilter);
  const dayList = listOf(cursor);
  const startHour = Math.min(8, ...dayList.map((l) => Math.floor(l.start / 60)));
  const endHour = Math.max(19, ...dayList.map((l) => Math.ceil(l.end / 60)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="me-auto text-2xl font-bold tracking-tight">{t('cal.title')}</h1>
        <Button onClick={() => setNewOpen(true)}>
          <Plus aria-hidden className="size-4" />
          {t('cal.new')}
        </Button>
        <div
          role="group"
          aria-label={t('cal.viewsAria')}
          className="inline-flex rounded-lg border bg-muted p-0.5"
        >
          {(['day', 'week', 'month'] as const).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={v === view ? 'default' : 'ghost'}
              aria-pressed={v === view}
              onClick={() => setView(v)}
            >
              {t(`cal.views.${v}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label={t('cal.prev')} onClick={() => step_(-1)}>
          <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
        </Button>
        <Button variant="outline" size="icon" aria-label={t('cal.next')} onClick={() => step_(1)}>
          <ChevronLeft aria-hidden className="size-4 rotate-180 rtl:rotate-0" />
        </Button>
        <Button variant="outline" onClick={() => setCursor(today)}>
          {t('cal.today')}
        </Button>
        <p
          aria-live="polite"
          suppressHydrationWarning
          className="min-w-0 flex-1 basis-full truncate px-1 font-semibold sm:basis-auto"
        >
          {label}
          {q.isFetching && <Spinner className="ms-2 inline-block size-3" />}
        </p>
        <Select value={staffFilter} onValueChange={setStaffFilter} dir={rtl ? 'rtl' : 'ltr'}>
          <SelectTrigger aria-label={t('cal.filterStaff')} className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('cal.allStaff')}</SelectItem>
            {team.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {team.map((m) => (
          <li key={m.id} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2.5 rounded-full', colorOf(m.id).dot)} />
            {m.displayName}
          </li>
        ))}
      </ul>
      <p className="hidden text-xs text-muted-foreground md:block">{t('cal.dragHint')}</p>

      {q.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          description={t('common.errorDesc')}
          action={
            <Button variant="outline" onClick={() => void q.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : q.isPending ? (
        <div aria-busy="true" className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : total === 0 && view !== 'day' ? (
        <Card className="shadow-soft">
          <EmptyState title={t('cal.emptyTitle')} description={t('cal.emptyDesc')} />
        </Card>
      ) : view === 'day' ? (
        <Card className="overflow-hidden shadow-soft">
          <div className="flex border-b ps-12 text-sm font-medium">
            {columns.map((m) => (
              <div
                key={m.id}
                className="flex flex-1 items-center justify-center gap-2 border-s px-1 py-2 first:border-s-0"
              >
                <span aria-hidden className={cn('size-2.5 rounded-full', colorOf(m.id).dot)} />
                <span className="truncate" title={m.displayName}>
                  {initials(m.displayName)}
                </span>
              </div>
            ))}
          </div>
          <div className="relative" style={{ height: (endHour - startHour) * HOUR_H }}>
            {Array.from({ length: endHour - startHour }, (_, i) => (
              <div
                key={i}
                aria-hidden
                className="absolute inset-x-0 border-t"
                style={{ top: i * HOUR_H }}
              >
                <span
                  dir="ltr"
                  className="absolute start-1 -top-2.5 bg-card px-0.5 text-xs text-muted-foreground tabular-nums"
                >
                  {fmtTime((startHour + i) * 60)}
                </span>
              </div>
            ))}
            <div
              className="absolute inset-y-0 end-0 start-12 grid"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`,
              }}
            >
              {columns.map((m) => (
                <div
                  key={m.id}
                  data-column={m.id}
                  onDragOver={allowDrop}
                  onDrop={(e) => dropOnColumn(e, m.id, startHour)}
                  className="relative border-s first:border-s-0"
                >
                  {dayList
                    .filter((l) => l.b.staff.id === m.id)
                    .map((l) =>
                      renderEvent(l, {
                        className: 'absolute inset-x-0.5 !w-auto',
                        style: {
                          top: ((l.start - startHour * 60) / 60) * HOUR_H + 1,
                          height: Math.max(28, ((l.end - l.start) / 60) * HOUR_H - 2),
                        },
                      }),
                    )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : view === 'week' ? (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const list = listOf(d);
            const isToday = sameDay(d, today);
            return (
              <Card
                key={toISO(d)}
                onDragOver={allowDrop}
                onDrop={(e) => dropOnDay(e, d)}
                className={cn('flex flex-col gap-2 p-2 shadow-soft', isToday && 'border-primary')}
              >
                <button
                  type="button"
                  onClick={() => openDay(d)}
                  className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-start hover:bg-muted md:flex-col md:items-start md:gap-0"
                >
                  <span className="text-xs text-muted-foreground">{weekday(d)}</span>
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-sm font-semibold',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {dayNum(d)}
                  </span>
                  <span className="sr-only">
                    {t('cal.openDay', { date: weekday(d, 'long') + ' ' + dayNum(d) })}
                  </span>
                </button>
                <div className="space-y-1.5">
                  {list.length === 0 ? (
                    <span aria-hidden className="block px-1 text-xs text-muted-foreground">
                      —
                    </span>
                  ) : (
                    list.map((l) => renderEvent(l, { compact: true }))
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
              <div key={d.getDay()} className="py-2">
                {weekday(d)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {days.map((d) => {
              const list = listOf(d);
              const outside = d.getMonth() !== cursor.getMonth();
              const isToday = sameDay(d, today);
              return (
                <button
                  key={toISO(d)}
                  type="button"
                  onClick={() => openDay(d)}
                  onDragOver={allowDrop}
                  onDrop={(e) => dropOnDay(e, d)}
                  aria-label={t('cal.openDay', { date: weekday(d, 'long') + ' ' + dayNum(d) })}
                  className={cn(
                    'flex min-h-16 flex-col items-stretch gap-1 bg-card p-1 text-start transition-colors hover:bg-muted md:min-h-28 md:p-1.5',
                    'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    outside && 'bg-muted/30 text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center self-start rounded-full text-xs font-semibold',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {dayNum(d)}
                  </span>
                  <span className="hidden space-y-1 md:block">
                    {list.slice(0, 2).map((l) => (
                      <span
                        key={l.b.id}
                        className={cn(
                          'block truncate rounded border-s-4 px-1.5 py-0.5 text-[11px]',
                          colorOf(l.b.staff.id).event,
                        )}
                      >
                        <span dir="ltr" className="tabular-nums">
                          {fmtTime(l.start)}
                        </span>{' '}
                        {l.b.customer.name}
                      </span>
                    ))}
                    {list.length > 2 && (
                      <span className="block px-1 text-[11px] text-muted-foreground">
                        {t('cal.more', { count: list.length - 2 })}
                      </span>
                    )}
                  </span>
                  <span aria-hidden className="flex flex-wrap gap-0.5 md:hidden">
                    {list.slice(0, 6).map((l) => (
                      <span
                        key={l.b.id}
                        className={cn('size-1.5 rounded-full', colorOf(l.b.staff.id).dot)}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <BookingDetail booking={selected} tz={tz} onClose={() => setSelectedId(null)} />
      <NewBookingDialog
        key={newOpen ? 'open' : 'closed'}
        open={newOpen}
        onOpenChange={setNewOpen}
        tz={tz}
        defaultDate={toISO(view === 'day' ? cursor : today)}
      />
    </div>
  );
}

function BookingDetail({
  booking,
  tz,
  onClose,
}: {
  booking: OwnerBooking | null;
  tz: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const intl = intlLocale(locale);
  const status = useBookingStatus();
  const move = useMoveBooking();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string>();

  const busy = status.isPending || move.isPending;
  const when = booking
    ? new Intl.DateTimeFormat(intl, { dateStyle: 'full', timeZone: tz }).format(
        new Date(booking.startsAt),
      )
    : '';
  const range = booking
    ? `${fmtTime(minutesTz(booking.startsAt, tz))} – ${fmtTime(minutesTz(booking.endsAt, tz))}`
    : '';

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {booking && (
          <>
            <DialogHeader>
              <DialogTitle>{booking.service.name}</DialogTitle>
              <DialogDescription>
                {when} · <span dir="ltr">{range}</span>
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground">{t('table.client')}</dt>
              <dd className="font-medium">
                <Link
                  href={`/dashboard/customers/${booking.customer.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {booking.customer.name}
                </Link>
                <span dir="ltr" className="block text-muted-foreground">
                  {booking.customer.phone}
                </span>
              </dd>
              <dt className="text-muted-foreground">{t('book.with')}</dt>
              <dd className="font-medium">{booking.staff.displayName}</dd>
              <dt className="text-muted-foreground">{t('cal.duration')}</dt>
              <dd className="font-medium">
                {t('service.duration', { minutes: booking.service.durationMin })}
              </dd>
              <dt className="text-muted-foreground">{t('cal.price')}</dt>
              <dd className="font-medium">{formatPrice(booking.price, locale)}</dd>
              <dt className="text-muted-foreground">{t('table.status')}</dt>
              <dd>
                <StatusBadge
                  status={badgeStatus(booking.status)}
                  label={t(`status.${badgeStatus(booking.status)}`)}
                />
              </dd>
              {booking.notes && (
                <>
                  <dt className="text-muted-foreground">{t('cal.notes')}</dt>
                  <dd>{booking.notes}</dd>
                </>
              )}
            </dl>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            {NEXT_STATUSES[booking.status].length > 0 && (
              <div className="flex flex-wrap gap-2">
                {NEXT_STATUSES[booking.status].map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    disabled={busy}
                    variant={next === 'CANCELLED' || next === 'NO_SHOW' ? 'outline' : 'default'}
                    onClick={() => {
                      setError(undefined);
                      status.mutate(
                        { id: booking.id, status: next },
                        { onError: (e) => setError(errorMessage(t, e)) },
                      );
                    }}
                  >
                    {t(`cal.action.${next}`)}
                  </Button>
                ))}
              </div>
            )}

            {isOpen(booking.status) && (
              <form
                className="space-y-2 border-t pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!date || !time) return;
                  setError(undefined);
                  move.mutate(
                    {
                      id: booking.id,
                      data: { startsAt: zonedToUtcISO(date, hhmmToMinutes(time), tz) },
                    },
                    {
                      onSuccess: () => toast.success(t('cal.moved')),
                      onError: (er) => setError(errorMessage(t, er)),
                    },
                  );
                }}
              >
                <p className="text-sm font-medium">{t('cal.moveTitle')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="mv-date">{t('booking.dateLabel')}</Label>
                    <Input
                      id="mv-date"
                      type="date"
                      dir="ltr"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mv-time">{t('cal.time')}</Label>
                    <Input
                      id="mv-time"
                      type="time"
                      dir="ltr"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={busy || !date || !time}>
                  {t('cal.move')}
                </Button>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
