import type { ReviewFormView } from '@mawid/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ErrorState } from '@/components/mawid/error-state';
import { ReviewForm } from '@/components/mawid/review-form';
import { SiteHeader } from '@/components/mawid/site-header';
import { Card } from '@/components/ui/card';
import { env } from '@/lib/env';

// The link is secret: search engines must not index it.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ReviewPage(props: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getTranslations();
  let view: ReviewFormView | null = null;
  let failed = false;
  try {
    const res = await fetch(`${env.API_URL}/public/reviews/${encodeURIComponent(params.token)}`, {
      cache: 'no-store',
    });
    if (res.ok) view = (await res.json()) as ReviewFormView;
    else if (res.status !== 404 && res.status !== 400) failed = true;
  } catch {
    failed = true;
  }
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-6">
        {failed ? (
          <ErrorState
            className="py-24"
            title={t('common.errorTitle')}
            description={t('common.errorDesc')}
          />
        ) : view ? (
          <ReviewForm initial={view} token={params.token} />
        ) : (
          <Card className="flex flex-col items-center gap-3 p-8 text-center shadow-soft">
            <h1 role="status" className="text-2xl font-bold">
              {t('reviewForm.invalidTitle')}
            </h1>
            <p className="text-muted-foreground">{t('reviewForm.invalidDesc')}</p>
          </Card>
        )}
      </main>
    </>
  );
}
