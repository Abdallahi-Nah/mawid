'use client';

import type { AdminBusiness } from '@mawid/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/mawid/confirm-dialog';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { StatCard } from '@/components/mawid/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdminAiUsage,
  useAdminBusinesses,
  useAdminPlan,
  useAdminStats,
  useAdminSuspend,
} from '@/lib/queries';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const PLANS = ['FREE', 'PRO', 'BUSINESS'] as const;
const usd = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(n);
const num = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale).format(n);

/** Admin area (FR-90): all businesses, suspension, plans, global statistics and AI cost. */
export function AdminPanel() {
  const t = useTranslations();
  const locale = useLocale();
  const stats = useAdminStats();
  const usage = useAdminAiUsage();
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminBusinesses(q.trim(), plan, state, page);
  const suspend = useAdminSuspend();
  const changePlan = useAdminPlan();
  const [target, setTarget] = useState<AdminBusiness>();
  const [error, setError] = useState<string>();
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));

  async function toggle() {
    if (!target) return;
    setError(undefined);
    const suspended = !target.suspendedAt;
    try {
      await suspend.mutateAsync({ id: target.id, suspended });
      toast.success(t(suspended ? 'admin.suspended' : 'admin.reactivated'));
      setTarget(undefined);
    } catch (e) {
      setError(errorMessage(t, e));
    }
  }
  async function setPlanOf(b: AdminBusiness, value: string) {
    try {
      await changePlan.mutateAsync({ id: b.id, plan: value });
      toast.success(t('admin.planChanged'));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  }

  const s = stats.data;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.title')}</h1>
        <p className="text-muted-foreground">{t('admin.desc')}</p>
      </header>

      {stats.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          description={t('admin.error')}
          action={
            <Button variant="outline" onClick={() => stats.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <section
          aria-label={t('admin.title')}
          aria-busy={!s}
          className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard
            label={t('admin.stats.businesses')}
            value={s ? num(s.businesses.total, locale) : ''}
            loading={!s}
          />
          <StatCard
            label={`${t('admin.stats.active')} / ${t('admin.stats.suspended')}`}
            value={s ? `${s.businesses.active} / ${s.businesses.suspended}` : ''}
            loading={!s}
          />
          <StatCard
            label={t('admin.stats.users')}
            value={s ? num(s.users, locale) : ''}
            loading={!s}
          />
          <StatCard
            label={`${t('admin.stats.bookings')} (${t('admin.stats.thisMonth')})`}
            value={
              s ? `${num(s.bookings.thisMonth, locale)} / ${num(s.bookings.total, locale)}` : ''
            }
            loading={!s}
          />
          <StatCard
            label={t('admin.stats.aiCalls')}
            value={s ? num(s.ai.calls, locale) : ''}
            loading={!s}
          />
          <StatCard
            label={t('admin.stats.aiCost')}
            value={s ? usd(s.ai.estimatedCostUsd, locale) : ''}
            loading={!s}
          />
        </section>
      )}

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t('admin.stats.businesses')}</CardTitle>
          <div className="grid grid-cols-1 gap-2 pt-2 min-[560px]:grid-cols-[1fr_10rem_10rem]">
            <Input
              type="search"
              value={q}
              aria-label={t('admin.search')}
              placeholder={t('admin.search')}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <Select
              value={plan || 'all'}
              onValueChange={(v) => {
                setPlan(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label={t('admin.columns.plan')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('admin.allPlans')}</SelectItem>
                {PLANS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`plan.names.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={state || 'all'}
              onValueChange={(v) => {
                setState(v === 'all' ? '' : v);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label={t('admin.columns.state')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('admin.allStates')}</SelectItem>
                <SelectItem value="false">{t('admin.onlyActive')}</SelectItem>
                <SelectItem value="true">{t('admin.onlySuspended')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {list.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t('admin.error')}
            </p>
          ) : list.isPending ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : list.data.items.length === 0 ? (
            <EmptyState title={t('admin.emptyTitle')} description={t('admin.emptyDesc')} />
          ) : (
            <ul className="divide-y">
              {list.data.items.map((b) => (
                <li key={b.id} className="grid gap-3 py-4 min-[900px]:grid-cols-[1.4fr_1fr_auto]">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className="truncate">{b.name}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          b.suspendedAt
                            ? 'bg-destructive-soft text-destructive'
                            : 'bg-success-soft text-success',
                        )}
                      >
                        {b.suspendedAt ? t('admin.suspendedBadge') : t('admin.active')}
                      </span>
                    </p>
                    <p dir="ltr" className="truncate text-start text-sm text-muted-foreground">
                      /b/{b.slug} · {b.ownerEmail ?? '—'}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('admin.columns.staff')} : {b.staffCount} · {t('admin.columns.bookings')} :{' '}
                    {b.bookingsThisMonth} · {t('admin.columns.ai')} : {b.aiCallsThisMonth}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={b.plan} onValueChange={(v) => setPlanOf(b, v)}>
                      <SelectTrigger
                        className="w-32"
                        aria-label={t('admin.planLabel', { name: b.name })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {t(`plan.names.${p}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant={b.suspendedAt ? 'default' : 'outline'}
                      onClick={() => {
                        setError(undefined);
                        setTarget(b);
                      }}
                    >
                      {b.suspendedAt ? t('admin.reactivate') : t('admin.suspend')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t('common.back')}
              </Button>
              <span dir="ltr" className="text-sm text-muted-foreground">
                {page} / {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">{t('admin.aiTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {usage.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t('admin.error')}
            </p>
          ) : usage.isPending ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : usage.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('admin.aiEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">{t('admin.aiTitle')}</caption>
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th scope="col" className="py-2 pe-3 text-start font-medium">
                      {t('admin.columns.business')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">
                      {t('admin.aiColumns.calls')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">
                      {t('admin.aiColumns.errors')}
                    </th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">
                      {t('admin.aiColumns.tokens')}
                    </th>
                    <th scope="col" className="ps-3 py-2 text-end font-medium">
                      {t('admin.aiColumns.cost')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usage.data.map((u) => (
                    <tr key={u.businessId}>
                      <th scope="row" className="py-2 pe-3 text-start font-medium">
                        {u.name}
                      </th>
                      <td className="px-3 py-2 text-end tabular-nums">{num(u.calls, locale)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{num(u.errors, locale)}</td>
                      <td dir="ltr" className="px-3 py-2 text-end tabular-nums">
                        {num(u.tokensIn, locale)} / {num(u.tokensOut, locale)}
                      </td>
                      <td dir="ltr" className="ps-3 py-2 text-end tabular-nums">
                        {usd(u.estimatedCostUsd, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('admin.costNote')}</p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(undefined)}
        title={t(target?.suspendedAt ? 'admin.reactivateTitle' : 'admin.suspendTitle', {
          name: target?.name ?? '',
        })}
        description={t(target?.suspendedAt ? 'admin.reactivateDesc' : 'admin.suspendDesc')}
        confirmLabel={t(target?.suspendedAt ? 'admin.reactivate' : 'admin.suspend')}
        tone={target?.suspendedAt ? 'default' : 'destructive'}
        busy={suspend.isPending}
        error={error}
        onConfirm={toggle}
      />
    </div>
  );
}
