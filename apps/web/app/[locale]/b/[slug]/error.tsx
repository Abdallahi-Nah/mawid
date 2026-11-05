'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/mawid/error-state';
import { Button } from '@/components/ui/button';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  const t = useTranslations('common');
  return (
    <main>
      <ErrorState
        className="py-24"
        title={t('errorTitle')}
        description={t('errorDesc')}
        action={
          <Button variant="outline" onClick={reset}>
            {t('retry')}
          </Button>
        }
      />
    </main>
  );
}
