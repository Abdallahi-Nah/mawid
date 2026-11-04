'use client';

import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { ErrorState } from '@/components/mawid/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useRouter } from '@/i18n/navigation';
import { useMe } from '@/lib/queries';
import type { Role } from '@/lib/types';

/** Protects a page: not logged in -> /login, wrong role -> "no access". The API checks the role again on every call. */
export function AuthGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    if (me.data === null) router.replace('/login');
  }, [me.data, router]);

  if (me.isError) {
    return (
      <ErrorState
        title={t('common.errorTitle')}
        description={t('common.errorDesc')}
        action={
          <Button variant="outline" onClick={() => me.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }
  if (me.isPending || me.data === null) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (!roles.includes(me.data.role) || !me.data.businessId) {
    return (
      <ErrorState
        title={t('auth.forbiddenTitle')}
        description={t('auth.forbiddenDesc')}
        action={
          <Button asChild variant="outline">
            <Link href="/">{t('auth.goHome')}</Link>
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}
