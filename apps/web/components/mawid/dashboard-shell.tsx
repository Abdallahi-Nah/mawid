'use client';

import { CalendarDays, ExternalLink, LayoutDashboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { business } from '@/lib/mock';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', key: 'dashboard', Icon: LayoutDashboard },
  { href: '/dashboard/calendar', key: 'calendar', Icon: CalendarDays },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const t = useTranslations('dash.nav');
  const pathname = usePathname();

  return (
    <div className="mx-auto flex max-w-7xl gap-8 px-4">
      <aside className="sticky top-20 hidden h-fit w-56 shrink-0 py-6 lg:block">
        <nav aria-label={t('aria')} className="flex flex-col gap-1">
          {items.map(({ href, key, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {t(key)}
              </Link>
            );
          })}
          <Link
            href={`/b/${business.slug}`}
            className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <ExternalLink aria-hidden className="size-4" />
            {t('publicPage')}
          </Link>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 py-6 pb-24 lg:pb-8">{children}</main>

      <nav
        aria-label={t('aria')}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t bg-background/95 backdrop-blur lg:hidden"
      >
        {items.map(({ href, key, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon aria-hidden className="size-5" />
              {t(key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
