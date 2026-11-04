import { Check, CalendarClock, Sparkles, BellRing } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { HeroDemo } from '@/components/mawid/hero-demo';
import { SiteHeader } from '@/components/mawid/site-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatPrice } from '@/lib/format';
import { business } from '@/lib/mock';
import { cn } from '@/lib/utils';

const benefits = [
  { key: 'one', Icon: CalendarClock },
  { key: 'two', Icon: Sparkles },
  { key: 'three', Icon: BellRing },
] as const;

const plans = [
  { key: 'starter', price: 0, popular: false },
  { key: 'pro', price: 1500, popular: true },
  { key: 'business', price: 3500, popular: false },
] as const;

export default function HomePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = useTranslations('home');
  const locale = useLocale() as Locale;

  return (
    <>
      <SiteHeader
        nav={
          <>
            <a href="#features" className="hover:text-foreground">
              {t('nav.features')}
            </a>
            <a href="#demo" className="hover:text-foreground">
              {t('nav.demo')}
            </a>
            <a href="#pricing" className="hover:text-foreground">
              {t('nav.pricing')}
            </a>
          </>
        }
        actions={
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">{t('nav.login')}</Link>
          </Button>
        }
      />
      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.14),transparent)]"
          />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-24">
            <div className="space-y-6">
              <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
                <Sparkles aria-hidden className="size-3.5" />
                {t('hero.badge')}
              </Badge>
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                {t('hero.title')}
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">{t('hero.subtitle')}</p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/register">{t('hero.cta')}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href={`/b/${business.slug}`}>{t('hero.secondary')}</Link>
                </Button>
              </div>
            </div>
            <HeroDemo />
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
          <h2 className="mb-8 text-center text-3xl font-bold tracking-tight">
            {t('benefits.title')}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {benefits.map(({ key, Icon }) => (
              <Card key={key} className="space-y-3 p-6 shadow-soft">
                <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="text-lg font-semibold">{t(`benefits.${key}.title`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`benefits.${key}.desc`)}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
          <Card className="flex flex-col items-start gap-4 bg-primary p-8 text-primary-foreground shadow-lifted sm:p-12">
            <h2 className="text-3xl font-bold tracking-tight">{t('demo.title')}</h2>
            <p className="max-w-xl text-primary-foreground/85">{t('demo.desc')}</p>
            <Button asChild size="lg" variant="secondary">
              <Link href={`/b/${business.slug}`}>{t('demo.cta')}</Link>
            </Button>
          </Card>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
          <div className="mb-8 space-y-2 text-center">
            <h2 className="text-3xl font-bold tracking-tight">{t('pricing.title')}</h2>
            <p className="text-muted-foreground">{t('pricing.subtitle')}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => (
              <Card
                key={p.key}
                className={cn(
                  'flex flex-col gap-5 p-6 shadow-soft',
                  p.popular && 'border-primary ring-1 ring-primary',
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{t(`pricing.plans.${p.key}.name`)}</h3>
                  {p.popular && <Badge>{t('pricing.popular')}</Badge>}
                </div>
                <p>
                  <span className="text-3xl font-bold">{formatPrice(p.price, locale)}</span>{' '}
                  <span className="text-sm text-muted-foreground">{t('pricing.perMonth')}</span>
                </p>
                <ul className="flex-1 space-y-2 text-sm">
                  {(['f1', 'f2', 'f3'] as const).map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check aria-hidden className="size-4 shrink-0 text-success" />
                      {t(`pricing.plans.${p.key}.${f}`)}
                    </li>
                  ))}
                </ul>
                <Button asChild variant={p.popular ? 'default' : 'outline'}>
                  <Link href="/register">{t('pricing.choose')}</Link>
                </Button>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 text-center">
          <h2 className="mb-5 text-3xl font-bold tracking-tight">{t('cta.title')}</h2>
          <Button asChild size="lg">
            <Link href="/register">{t('hero.cta')}</Link>
          </Button>
        </section>
      </main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        {t('footer')}
      </footer>
    </>
  );
}
