import { Clock, MapPin, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BusinessSkeleton } from '@/components/mawid/business-skeleton';
import { ChatFab } from '@/components/mawid/chat-fab';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { ReviewCard } from '@/components/mawid/review-card';
import { ServiceCard } from '@/components/mawid/service-card';
import { SiteHeader } from '@/components/mawid/site-header';
import { StaffCard } from '@/components/mawid/staff-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatPrice } from '@/lib/format';
import { business, parseState } from '@/lib/mock';

const initials = (name: string) => name.split(' ').slice(0, 2).map((w) => w[0]).join('');

export default function BusinessPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string };
  searchParams: { state?: string; chat?: string };
}) {
  setRequestLocale(params.locale);
  const t = useTranslations();
  const locale = useLocale() as Locale;
  if (params.slug !== business.slug) notFound();
  const state = parseState(searchParams.state); // ?state=loading|empty|error to preview each state
  const bookHref = `/b/${business.slug}/book`;
  const name = t('mock.business.name');

  const header = (
    <SiteHeader
      actions={
        <Button asChild className="hidden lg:inline-flex">
          <Link href={bookHref}>{t('b.book')}</Link>
        </Button>
      }
    />
  );

  if (state === 'loading') {
    return (<>{header}<main className="pb-24"><BusinessSkeleton /></main></>);
  }
  if (state === 'error') {
    return (
      <>
        {header}
        <main>
          <ErrorState
            className="py-24"
            title={t('common.errorTitle')}
            description={t('common.errorDesc')}
            action={<Button asChild variant="outline"><Link href={`/b/${business.slug}`}>{t('common.retry')}</Link></Button>}
          />
        </main>
      </>
    );
  }
  const empty = state === 'empty';

  return (
    <div data-brand={business.brand}>
      {header}
      <main className="mx-auto max-w-4xl pb-28 lg:pb-12">
        <div
          aria-hidden
          className="h-40 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.55),transparent_55%),linear-gradient(135deg,hsl(var(--primary)/0.85),hsl(var(--primary)/0.35))] sm:h-56 sm:rounded-b-2xl"
        />
        <div className="space-y-10 px-4">
          <section className="-mt-10 space-y-3">
            <div className="flex size-20 items-center justify-center rounded-2xl border-4 border-background bg-card text-3xl font-bold text-primary shadow-soft">
              {initials(name)[0]}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
            <p className="text-muted-foreground">{t('mock.business.tagline')}</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Star aria-hidden className="size-4 fill-warning text-warning" />
                <span dir="ltr">{business.rating}</span>
                <span className="font-normal text-muted-foreground">
                  {t('b.rating', { count: business.reviewCount })}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin aria-hidden className="size-4" />
                {t('mock.business.address')}
              </span>
              <span className="flex items-center gap-1.5 text-success">
                <Clock aria-hidden className="size-4" />
                {t('b.openToday', { hours: business.hours })}
              </span>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">{t('b.about')}</h2>
            <p className="leading-relaxed text-muted-foreground">{t('mock.business.description')}</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">{t('b.services')}</h2>
            {empty ? (
              <Card className="shadow-soft"><EmptyState title={t('b.noServicesTitle')} description={t('b.noServicesDesc')} /></Card>
            ) : (
              <div className="grid gap-3">
                {business.services.map((s) => (
                  <ServiceCard
                    key={s.id}
                    name={t(`mock.services.${s.id}`)}
                    description={t(`mock.services.${s.id}Desc`)}
                    duration={t('service.duration', { minutes: s.minutes })}
                    price={formatPrice(s.price, locale)}
                    bookLabel={t('service.book')}
                    href={`${bookHref}?service=${s.id}`}
                  />
                ))}
              </div>
            )}
          </section>

          {!empty && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">{t('b.team')}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {business.team.map((m) => (
                  <StaffCard
                    key={m.id}
                    name={t(`mock.team.${m.id}.name`)}
                    role={t(`mock.team.${m.id}.role`)}
                    initials={initials(t(`mock.team.${m.id}.name`))}
                    rating={m.rating}
                    ratingLabel={t('staff.rating', { rating: m.rating })}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">{t('b.reviews')}</h2>
            {empty ? (
              <Card className="shadow-soft"><EmptyState title={t('b.noReviewsTitle')} description={t('b.noReviewsDesc')} /></Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {business.reviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    name={t(`mock.rev.${r.id}.name`)}
                    initials={initials(t(`mock.rev.${r.id}.name`))}
                    rating={r.rating}
                    ratingLabel={t('review.rating', { rating: r.rating })}
                    text={t(`mock.rev.${r.id}.text`)}
                    date={t(`mock.rev.${r.id}.date`)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <Button asChild size="lg" className="w-full">
          <Link href={bookHref}>{t('b.book')}</Link>
        </Button>
      </div>
      <ChatFab forceError={searchParams.chat === 'error'} />
    </div>
  );
}
