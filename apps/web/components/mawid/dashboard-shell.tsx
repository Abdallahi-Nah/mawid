'use client';

import {
  CalendarDays,
  Contact,
  ExternalLink,
  LayoutDashboard,
  MessageSquareText,
  MoreHorizontal,
  Scissors,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/mawid/error-state';
import { NotificationBell } from '@/components/mawid/notification-bell';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link, usePathname } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { useBusiness, useMe } from '@/lib/queries';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', key: 'dashboard', Icon: LayoutDashboard, ownerOnly: false },
  { href: '/dashboard/calendar', key: 'calendar', Icon: CalendarDays, ownerOnly: false },
  { href: '/dashboard/customers', key: 'customers', Icon: Contact, ownerOnly: false },
  { href: '/dashboard/payments', key: 'payments', Icon: Wallet, ownerOnly: true },
  { href: '/dashboard/reviews', key: 'reviews', Icon: MessageSquareText, ownerOnly: true },
  { href: '/dashboard/services', key: 'services', Icon: Scissors, ownerOnly: true },
  { href: '/dashboard/staff', key: 'staff', Icon: Users, ownerOnly: true },
  { href: '/dashboard/settings', key: 'settings', Icon: Settings, ownerOnly: true },
] as const;

/** On a phone the bar shows the first five entries; the others are under "More". */
const BAR_SIZE = 5;

const isActive = (pathname: string, href: string): boolean =>
  pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));

export function DashboardShell({ children }: { children: ReactNode }) {
  const t = useTranslations('dash.nav');
  const tErr = useTranslations('apiErrors');
  const pathname = usePathname();
  const me = useMe();
  const biz = useBusiness();
  const visible = items.filter((i) => !i.ownerOnly || me.data?.role === 'OWNER');
  const [moreOpen, setMoreOpen] = useState(false);
  const bar = visible.length > BAR_SIZE + 1 ? visible.slice(0, BAR_SIZE) : visible;
  const more = visible.length > BAR_SIZE + 1 ? visible.slice(BAR_SIZE) : [];
  const moreActive = more.some((i) => isActive(pathname, i.href));

  return (
    <div className="mx-auto flex max-w-7xl gap-8 px-4">
      <aside className="sticky top-20 hidden h-fit w-56 shrink-0 py-6 lg:block">
        <nav aria-label={t('aria')} className="flex flex-col gap-1">
          {visible.map(({ href, key, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {t(key)}
              </Link>
            );
          })}
          {biz.data && (
            <Link
              href={`/b/${biz.data.slug}`}
              className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink aria-hidden className="size-4" />
              {t('publicPage')}
            </Link>
          )}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 py-6 pb-24 lg:pb-8">
        {biz.error instanceof ApiError && biz.error.code === 'BUSINESS_SUSPENDED' ? (
          <ErrorState
            className="py-24"
            title={t('suspendedTitle')}
            description={tErr('BUSINESS_SUSPENDED')}
          />
        ) : (
          <>
            <div className="mb-4 flex justify-end">
              <NotificationBell />
            </div>
            {children}
          </>
        )}
      </main>

      <nav
        aria-label={t('aria')}
        style={{
          gridTemplateColumns: `repeat(${bar.length + (more.length ? 1 : 0)}, minmax(0, 1fr))`,
        }}
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background/95 backdrop-blur lg:hidden"
      >
        {bar.map(({ href, key, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon aria-hidden className="size-5" />
              <span className="w-full truncate text-center">{t(key)}</span>
            </Link>
          );
        })}
        {more.length > 0 && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger
              className={cn(
                'flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-medium',
                moreActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <MoreHorizontal aria-hidden className="size-5" />
              <span className="w-full truncate text-center">{t('more')}</span>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-52 p-1">
              <ul>
                {more.map(({ href, key, Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={isActive(pathname, href) ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted',
                        isActive(pathname, href) && 'bg-secondary text-secondary-foreground',
                      )}
                    >
                      <Icon aria-hidden className="size-4" />
                      {t(key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </nav>
    </div>
  );
}
