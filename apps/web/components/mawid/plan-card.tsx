'use client';

import { Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlan } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Plan, limits and what was used this month. Close to a limit, it says to upgrade (FR-91). */
export function PlanCard() {
  const t = useTranslations('plan');
  const q = usePlan();
  if (q.isError) return null; // the dashboard still works without this card
  if (!q.data) return <Skeleton className="h-44 rounded-xl" />;
  const { plan, limits, usage } = q.data;
  const rows = [
    { key: 'staff', label: t('staff'), used: usage.staff, limit: limits.staff },
    {
      key: 'bookings',
      label: t('bookings'),
      used: usage.bookingsThisMonth,
      limit: limits.bookingsPerMonth,
    },
    {
      key: 'ai',
      label: t('ai'),
      used: usage.aiMessagesThisMonth,
      limit: limits.aiMessagesPerMonth,
    },
  ];
  const nearLimit =
    plan !== 'BUSINESS' && rows.some((r) => r.limit !== null && r.used / r.limit >= 0.8);

  return (
    <Card className="shadow-soft">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown aria-hidden className="size-4 text-primary" />
          {t('title')}
        </CardTitle>
        <Badge variant="secondary">{t(`names.${plan}`)}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {rows.map((r) => {
            const pct = r.limit ? Math.min(100, Math.round((r.used / r.limit) * 100)) : 0;
            const full = r.limit !== null && r.used >= r.limit;
            return (
              <li key={r.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{r.label}</span>
                  <span
                    dir="ltr"
                    className={cn('tabular-nums', full && 'font-semibold text-destructive')}
                  >
                    {r.limit === null
                      ? `${r.used} · ${t('unlimited')}`
                      : t('usage', { used: r.used, limit: r.limit })}
                  </span>
                </div>
                {r.limit !== null && (
                  <div
                    role="progressbar"
                    aria-label={t('aria', { label: r.label, used: r.used, limit: r.limit })}
                    aria-valuemin={0}
                    aria-valuemax={r.limit}
                    aria-valuenow={Math.min(r.used, r.limit)}
                    className="h-2 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={cn('h-full rounded-full', full ? 'bg-destructive' : 'bg-primary')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {nearLimit && (
          <div className="rounded-lg bg-warning-soft p-3 text-sm">
            <p className="font-semibold text-warning">{t('upgradeTitle')}</p>
            <p className="mt-1 text-foreground/90">
              {t('upgradeText', { plan: t(`names.${plan}`) })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
