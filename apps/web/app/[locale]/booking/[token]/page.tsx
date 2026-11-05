import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { PublicBookingView } from '@mawid/shared';
import { ErrorState } from '@/components/mawid/error-state';
import { ManageBooking } from '@/components/mawid/manage-booking';
import { SiteHeader } from '@/components/mawid/site-header';
import { env } from '@/lib/env';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BookingPage(props: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getTranslations();
  let view: PublicBookingView | null = null;
  let failed = false;
  try {
    const res = await fetch(`${env.API_URL}/public/bookings/${encodeURIComponent(params.token)}`, {
      cache: 'no-store',
    });
    if (res.ok) view = (await res.json()) as PublicBookingView;
    else if (res.status !== 404 && res.status !== 400) failed = true;
  } catch {
    failed = true;
  }
  if (failed) {
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
  if (!view) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <ManageBooking initial={view} token={params.token} />
      </main>
    </>
  );
}
