'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/mawid/error-state';
import { Button } from '@/components/ui/button';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');
  return (
    <main>
      <ErrorState
        className="py-24"
        title={t('errorTitle')}
        description={t('errorDesc')}
        action={<Button variant="outline" onClick={reset}>{t('retry')}</Button>}
      />
    </main>
  );
}
