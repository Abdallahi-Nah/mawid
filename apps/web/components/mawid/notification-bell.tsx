'use client';

import { Bell } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from '@/i18n/navigation';
import { intlLocale } from '@/lib/calendar';
import { useBusiness, useNotifications, useReadNotifications } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Bell of the dashboard: new, cancelled and moved bookings. Refreshed every 30 seconds. */
export function NotificationBell() {
  const t = useTranslations('notif');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const q = useNotifications();
  const biz = useBusiness();
  const read = useReadNotifications();
  const unread = q.data?.unreadCount ?? 0;
  const tz = biz.data?.timezone ?? 'UTC';
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz,
    }).format(new Date(iso));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? t('ariaUnread', { count: unread }) : t('aria')}
        >
          <Bell aria-hidden className="size-4" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -end-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">{t('title')}</h2>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => read.mutate(undefined)}>
              {t('markAll')}
            </Button>
          )}
        </div>
        {q.isError ? (
          <p className="p-4 text-sm text-destructive">{t('error')}</p>
        ) : (q.data?.items.length ?? 0) === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {q.data?.items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.type === 'owner_payment' ? '/dashboard/payments' : '/dashboard/calendar'}
                  onClick={() => {
                    if (!n.readAt) read.mutate(n.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'block px-4 py-3 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                    !n.readAt && 'bg-secondary/50',
                  )}
                >
                  <span className="font-medium">
                    {t(`types.${n.type}`, { name: n.booking.customerName })}
                  </span>
                  <span className="block text-muted-foreground">
                    {n.booking.serviceName} · {fmt(n.booking.startsAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
