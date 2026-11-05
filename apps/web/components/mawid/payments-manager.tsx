'use client';

import type { OwnerPayment, PaymentStatus } from '@mawid/shared';
import { Check, ExternalLink, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/mawid/confirm-dialog';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import { useBusiness, useDecidePayment, usePayments } from '@/lib/queries';
import { formatDateTz } from '@/lib/tz';
import { cn } from '@/lib/utils';
import type { Locale } from '@/i18n/routing';

const FILTERS: (PaymentStatus | 'all')[] = ['PENDING', 'PAID', 'FAILED', 'all'];
const TONE: Record<string, string> = {
  PENDING: 'bg-warning-soft text-warning',
  PAID: 'bg-success-soft text-success',
  FAILED: 'bg-destructive-soft text-destructive',
  REFUNDED: 'bg-muted text-muted-foreground',
};

/** Deposits sent by customers: the owner looks at the proof, then validates or rejects (FR-61). */
export function PaymentsManager() {
  const t = useTranslations('payments');
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const biz = useBusiness();
  const tz = biz.data?.timezone ?? 'UTC';
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('PENDING');
  const [page, setPage] = useState(1);
  const q = usePayments(filter === 'all' ? undefined : filter, page);
  const decide = useDecidePayment();
  const [target, setTarget] = useState<{ p: OwnerPayment; action: 'validate' | 'reject' }>();
  const [error, setError] = useState<string>();

  async function confirm() {
    if (!target) return;
    setError(undefined);
    try {
      await decide.mutateAsync({ id: target.p.id, action: target.action });
      toast.success(t(target.action === 'validate' ? 'validated' : 'rejected'));
      setTarget(undefined);
    } catch (e) {
      setError(errorMessage(tAll, e));
    }
  }

  const items = q.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / 20));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('desc')}</p>
      </header>

      <div role="group" aria-label={t('title')} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={f === filter ? 'default' : 'outline'}
            aria-pressed={f === filter}
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
          >
            {t(`filters.${f}`)}
          </Button>
        ))}
      </div>

      {q.isError ? (
        <ErrorState
          title={tAll('common.errorTitle')}
          description={t('error')}
          action={
            <Button variant="outline" onClick={() => q.refetch()}>
              {tAll('common.retry')}
            </Button>
          }
        />
      ) : q.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <Card className="shadow-soft">
          <EmptyState title={t('emptyTitle')} description={t('emptyDesc')} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => {
            const hasProof = !!(p.reference || p.proofUrl);
            return (
              <li key={p.id}>
                <Card className="space-y-3 p-4 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.booking.customerName}</p>
                      <p dir="ltr" className="text-start text-sm text-muted-foreground">
                        {p.booking.customerPhone}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium',
                        TONE[p.status],
                      )}
                    >
                      {t(`status.${p.status}`)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm min-[420px]:grid-cols-2">
                    <div>
                      <dt className="inline text-muted-foreground">{t('booking')} : </dt>
                      <dd className="inline">
                        {p.booking.serviceName} ·{' '}
                        {formatDateTz(p.booking.startsAt, tz, locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">{t('amount')} : </dt>
                      <dd className="inline font-semibold">{formatPrice(p.amount, locale)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">{t('reference')} : </dt>
                      <dd dir="ltr" className="inline">
                        {p.reference ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">{t('proof')} : </dt>
                      <dd className="inline">
                        {p.proofUrl ? (
                          <a
                            href={p.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                          >
                            {t('viewProof')}
                            <ExternalLink aria-hidden className="size-3.5" />
                          </a>
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                  </dl>
                  {p.proofUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.proofUrl}
                      alt={t('proofAlt', { name: p.booking.customerName })}
                      loading="lazy"
                      className="max-h-48 rounded-lg border object-contain"
                    />
                  )}
                  {p.status === 'PENDING' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={!hasProof}
                        onClick={() => setTarget({ p, action: 'validate' })}
                      >
                        <Check aria-hidden className="me-1.5 size-4" />
                        {t('validate')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!hasProof}
                        onClick={() => setTarget({ p, action: 'reject' })}
                      >
                        <X aria-hidden className="me-1.5 size-4" />
                        {t('reject')}
                      </Button>
                      {!hasProof && (
                        <span className="text-sm text-muted-foreground">{t('noProof')}</span>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {tAll('common.back')}
          </Button>
          <span className="text-sm text-muted-foreground" dir="ltr">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {tAll('common.next')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(undefined)}
        title={t(target?.action === 'reject' ? 'rejectTitle' : 'validateTitle')}
        description={t(target?.action === 'reject' ? 'rejectDesc' : 'validateDesc')}
        confirmLabel={t(target?.action === 'reject' ? 'reject' : 'validate')}
        tone={target?.action === 'reject' ? 'destructive' : 'default'}
        busy={decide.isPending}
        error={error}
        onConfirm={confirm}
      />
    </div>
  );
}
