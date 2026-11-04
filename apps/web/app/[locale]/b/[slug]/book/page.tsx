import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/mawid/booking-flow';
import { SiteHeader } from '@/components/mawid/site-header';
import { business } from '@/lib/mock';

export default function BookPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string };
  searchParams: { service?: string; state?: string };
}) {
  setRequestLocale(params.locale);
  const t = useTranslations();
  if (params.slug !== business.slug) notFound();
  return (
    <div data-brand={business.brand}>
      <SiteHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('book.title')}</h1>
          <p className="text-muted-foreground">{t('book.at', { business: t('mock.business.name') })}</p>
        </div>
        <BookingFlow initialService={searchParams.service} forceSlotsError={searchParams.state === 'error'} />
      </main>
    </div>
  );
}
