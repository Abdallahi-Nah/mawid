'use client';

import { updateCustomerSchema } from '@mawid/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/mawid/error-state';
import { Spinner } from '@/components/mawid/spinner';
import { StatusBadge } from '@/components/mawid/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import { intlLocale } from '@/lib/calendar';
import { errorMessage } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import { useBusiness, useCustomer, useUpdateCustomer } from '@/lib/queries';
import { badgeStatus } from '@/lib/status';
import type { Locale } from '@/i18n/routing';

export function CustomerDetailView({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const q = useCustomer(id);
  const biz = useBusiness();
  const update = useUpdateCustomer();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (q.data) setNotes(q.data.notes ?? '');
  }, [q.data]);

  if (q.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <ErrorState
        className="py-24"
        title={t('common.errorTitle')}
        description={t('common.errorDesc')}
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard/customers">{t('common.back')}</Link>
          </Button>
        }
      />
    );
  }
  const c = q.data;
  const tz = biz.data?.timezone ?? 'UTC';
  const when = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz,
    }).format(new Date(iso));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const parsed = updateCustomerSchema.safeParse({ notes });
    if (!parsed.success) {
      setError(t(`form.errors.${parsed.error.issues[0].message}`));
      return;
    }
    update.mutate(
      { id, data: parsed.data },
      {
        onSuccess: () => toast.success(t('common.saved')),
        onError: (er) => setError(errorMessage(t, er)),
      },
    );
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/customers">← {t('customers.title')}</Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>

      <Card className="space-y-3 p-5 shadow-soft">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('form.phone')}</dt>
          <dd dir="ltr" className="text-start font-medium">
            {c.phone}
          </dd>
          <dt className="text-muted-foreground">{t('form.email')}</dt>
          <dd dir="ltr" className="text-start font-medium">
            {c.email ?? '—'}
          </dd>
          <dt className="text-muted-foreground">{t('customers.visitsLabel')}</dt>
          <dd className="font-medium">{c.visitsCount}</dd>
          <dt className="text-muted-foreground">{t('customers.noShowsLabel')}</dt>
          <dd className="font-medium">{c.noShowCount}</dd>
        </dl>
      </Card>

      <Card className="p-5 shadow-soft">
        <form onSubmit={save} className="space-y-3">
          <Label htmlFor="c-notes">{t('customers.notes')}</Label>
          <Textarea
            id="c-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('customers.notesHint')}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Spinner />}
            {t('common.save')}
          </Button>
        </form>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('customers.history')}</h2>
        {c.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('customers.noHistory')}</p>
        ) : (
          <ul className="space-y-2">
            {c.history.map((h) => (
              <li key={h.id} className="rounded-xl border bg-card p-4 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{h.serviceName}</span>
                  <StatusBadge
                    status={badgeStatus(h.status)}
                    label={t(`status.${badgeStatus(h.status)}`)}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {when(h.startsAt)} · {h.staffName} · {formatPrice(h.price, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
