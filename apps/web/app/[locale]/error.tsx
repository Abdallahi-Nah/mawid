'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SiteHeader } from '@/components/mawid/site-header';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/** Something broke while showing a page (error 500): a calm message and a way out. */
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  const t = useTranslations();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive-soft text-destructive">
          <TriangleAlert aria-hidden className="size-7" />
        </span>
        <h1 className="text-2xl font-bold">{t('common.errorTitle')}</h1>
        <p className="text-muted-foreground">{t('common.errorDesc')}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>{t('common.retry')}</Button>
          <Button asChild variant="outline">
            <Link href="/">{t('notFound.home')}</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
