import { Clock, MapPin, Phone, Star } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BusinessSkeleton } from '@/components/mawid/business-skeleton';
import { ChatFab } from '@/components/mawid/chat-fab';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { ServiceCard } from '@/components/mawid/service-card';
import { SiteHeader } from '@/components/mawid/site-header';
import { StaffCard } from '@/components/mawid/staff-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatPrice } from '@/lib/format';
import { hexToHsl } from '@/lib/color';
import { parseState } from '@/lib/mock';
import { fetchPublicBusiness, fetchPublicReviews, todayHours } from '@/lib/public';
import { ReviewCard } from '@/components/mawid/review-card';
import { formatDateTz } from '@/lib/tz';
import { jsonLd, openingHours, pageUrl, schemaType, alternates, ogLocale } from '@/lib/seo';

const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const locale = params.locale as Locale;
  const b = await fetchPublicBusiness(params.slug).catch(() => null);
  if (!b) return { robots: { index: false } };
  const t = await getTranslations({ locale, namespace: 'b' });
  const path = `/b/${b.slug}`;
  const description =
    b.description?.slice(0, 160) ?? `${t('book')} · ${b.name}${b.address ? ` · ${b.address}` : ''}`;
  return {
    title: b.name,
    description,
    alternates: alternates(locale, path),
    openGraph: {
      title: b.name,
      description,
      url: pageUrl(locale, path),
      locale: ogLocale(locale),
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: b.name, description },
  };
}

export default async function BusinessPage(props: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ state?: string; chat?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const state = parseState(searchParams.state); // ?state=loading|empty|error previews the states
  const bookHref = `/b/${params.slug}/book`;

  const header = (book: boolean) => (
    <SiteHeader
      actions={
        book ? (
          <Button asChild className="hidden lg:inline-flex">
            <Link href={bookHref}>{t('b.book')}</Link>
          </Button>
        ) : undefined
      }
    />
  );
  const errorView = (
    <>
      {header(false)}
      <main>
        <ErrorState
          className="py-24"
          title={t('common.errorTitle')}
          description={t('common.errorDesc')}
          action={
            <Button asChild variant="outline">
              <Link href={`/b/${params.slug}`}>{t('common.retry')}</Link>
            </Button>
          }
        />
      </main>
    </>
  );

  if (state === 'loading')
    return (
      <>
        {header(false)}
        <main className="pb-24">
          <BusinessSkeleton />
        </main>
      </>
    );
  if (state === 'error') return errorView;

  let business;
  try {
    business = await fetchPublicBusiness(params.slug);
  } catch {
    return errorView;
  }
  if (!business) notFound();

  const empty = state === 'empty';
  const reviews = empty ? null : await fetchPublicReviews(params.slug);
  const services = empty ? [] : business.services;
  const hours = todayHours(business);
  const brand = business.brandColor ? hexToHsl(business.brandColor) : null;

  return (
    <div
      style={brand ? ({ '--primary': brand, '--ring': brand } as React.CSSProperties) : undefined}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': schemaType(business.category),
            name: business.name,
            url: pageUrl(locale, `/b/${business.slug}`),
            description: business.description ?? undefined,
            image: business.logoUrl ?? undefined,
            telephone: business.phone ?? undefined,
            address: business.address
              ? { '@type': 'PostalAddress', streetAddress: business.address }
              : undefined,
            openingHoursSpecification: openingHours(business.staff),
            aggregateRating:
              business.ratingAverage !== null && business.reviewCount > 0
                ? {
                    '@type': 'AggregateRating',
                    ratingValue: business.ratingAverage,
                    reviewCount: business.reviewCount,
                  }
                : undefined,
          }),
        }}
      />
      {header(services.length > 0)}
      <main className="mx-auto max-w-4xl pb-28 lg:pb-12">
        <div
          aria-hidden
          className="h-40 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.55),transparent_55%),linear-gradient(135deg,hsl(var(--primary)/0.85),hsl(var(--primary)/0.35))] sm:h-56 sm:rounded-b-2xl"
        />
        <div className="space-y-10 px-4">
          <section className="-mt-10 space-y-3">
            {business.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logoUrl}
                alt=""
                className="size-20 rounded-2xl border-4 border-background bg-card object-cover shadow-soft"
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-2xl border-4 border-background bg-card text-3xl font-bold text-primary shadow-soft">
                {business.name[0]?.toUpperCase()}
              </div>
            )}
            <h1 className="text-3xl font-bold tracking-tight">{business.name}</h1>
            {business.ratingAverage !== null && business.reviewCount > 0 && (
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Star aria-hidden className="size-4 fill-warning text-warning" />
                {t('b.ratingSummary', { avg: business.ratingAverage, count: business.reviewCount })}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {business.address && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin aria-hidden className="size-4" />
                  {business.address}
                </span>
              )}
              {business.phone && (
                <a
                  href={`tel:${business.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Phone aria-hidden className="size-4" />
                  <span dir="ltr">{business.phone}</span>
                </a>
              )}
              <span
                className={
                  hours
                    ? 'flex items-center gap-1.5 text-success'
                    : 'flex items-center gap-1.5 text-muted-foreground'
                }
              >
                <Clock aria-hidden className="size-4" />
                {hours ? t('b.openToday', { hours }) : t('b.closedToday')}
              </span>
            </div>
          </section>

          {business.description && (
            <section className="space-y-2">
              <h2 className="text-xl font-semibold">{t('b.about')}</h2>
              <p className="leading-relaxed text-muted-foreground">{business.description}</p>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">{t('b.services')}</h2>
            {services.length === 0 ? (
              <Card className="shadow-soft">
                <EmptyState title={t('b.noServicesTitle')} description={t('b.noServicesDesc')} />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {services.map((s) => (
                  <ServiceCard
                    key={s.id}
                    name={s.name}
                    description={s.description ?? undefined}
                    duration={t('service.duration', { minutes: s.durationMin })}
                    price={formatPrice(s.price, locale)}
                    bookLabel={t('service.book')}
                    href={`${bookHref}?service=${s.id}`}
                  />
                ))}
              </div>
            )}
          </section>

          {services.length > 0 && business.staff.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">{t('b.team')}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {business.staff.map((m) => (
                  <StaffCard
                    key={m.id}
                    name={m.displayName}
                    initials={initials(m.displayName)}
                    photoUrl={m.photoUrl ?? undefined}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">{t('b.reviews')}</h2>
            {!reviews || reviews.items.length === 0 ? (
              <Card className="shadow-soft">
                <EmptyState title={t('b.noReviewsTitle')} description={t('b.noReviewsDesc')} />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {reviews.items.map((r) => (
                  <ReviewCard
                    key={r.id}
                    name={r.author}
                    initials={initials(r.author)}
                    rating={r.rating}
                    ratingLabel={t('reviewsPage.stars', { rating: r.rating })}
                    text={r.comment ?? ''}
                    date={formatDateTz(r.createdAt, business.timezone, locale, {
                      dateStyle: 'medium',
                    })}
                    reply={r.reply}
                    replyLabel={t('b.ownerReply')}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      {services.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
          <Button asChild size="lg" className="w-full">
            <Link href={bookHref}>{t('b.book')}</Link>
          </Button>
        </div>
      )}
      <ChatFab
        slug={business.slug}
        businessName={business.name}
        forceUnavailable={searchParams.chat === 'error'}
      />
    </div>
  );
}
