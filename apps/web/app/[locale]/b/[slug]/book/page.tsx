import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/mawid/booking-flow';
import { ErrorState } from '@/components/mawid/error-state';
import { SiteHeader } from '@/components/mawid/site-header';
import { hexToHsl } from '@/lib/color';
import { fetchPublicBusiness } from '@/lib/public';

export default async function BookPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string };
  searchParams: { service?: string };
}) {
  setRequestLocale(params.locale);
  const t = await getTranslations();
  let business;
  try {
    business = await fetchPublicBusiness(params.slug);
  } catch {
    return (
      <>
        <SiteHeader />
        <main>
          <ErrorState
            className="py-24"
            title={t('common.errorTitle')}
            description={t('common.errorDesc')}
          />
        </main>
      </>
    );
  }
  if (!business) notFound();
  const brand = business.brandColor ? hexToHsl(business.brandColor) : null;
  return (
    <div
      style={brand ? ({ '--primary': brand, '--ring': brand } as React.CSSProperties) : undefined}
    >
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('book.title')}</h1>
          <p className="text-muted-foreground">{t('book.at', { business: business.name })}</p>
        </div>
        <BookingFlow data={business} initialService={searchParams.service} />
      </main>
    </div>
  );
}
