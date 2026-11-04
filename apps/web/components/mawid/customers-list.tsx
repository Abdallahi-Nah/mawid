'use client';

import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { intlLocale } from '@/lib/calendar';
import { useCustomers } from '@/lib/queries';

export function CustomersList() {
  const t = useTranslations();
  const locale = useLocale();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const q = useCustomers(term, page);

  // Wait a little after typing before asking the API.
  useEffect(() => {
    const id = setTimeout(() => {
      setTerm(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [text]);

  const date = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' }).format(new Date(iso))
      : '—';
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('customers.title')}</h1>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t('customers.search')}
          placeholder={t('customers.search')}
          className="ps-9"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

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
        <div aria-busy="true" className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : q.data.items.length === 0 ? (
        <Card className="shadow-soft">
          <EmptyState
            title={term ? t('customers.noResultTitle') : t('customers.emptyTitle')}
            description={term ? t('customers.noResultDesc') : t('customers.emptyDesc')}
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {q.data.items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/customers/${c.id}`}
                className="block rounded-xl border bg-card p-4 shadow-soft transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-semibold">{c.name}</span>
                  <span dir="ltr" className="text-sm text-muted-foreground">
                    {c.phone}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('customers.visits', { count: c.visitsCount })} ·{' '}
                  {t('customers.noShows', { count: c.noShowCount })} ·{' '}
                  {t('customers.last', { date: date(c.lastBookingAt) })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {q.data && pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('common.back')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
