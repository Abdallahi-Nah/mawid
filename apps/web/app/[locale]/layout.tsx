import { env } from '@/lib/env';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { SkipLink } from '@/components/mawid/skip-link';
import { QueryProvider } from '@/components/mawid/query-provider';
import { ThemeProvider } from '@/components/mawid/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { isLocale, locales } from '@/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'common' });
  return {
    metadataBase: new URL(env.APP_URL),
    title: { default: t('appName'), template: `%s · ${t('appName')}` },
    description: t('tagline'),
    applicationName: t('appName'),
    openGraph: { siteName: t('appName'), type: 'website' },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function LocaleLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const params = await props.params;

  const { children } = props;

  const { locale } = params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={inter.variable}>
      <head>
        {/* Arabic pages need the Arabic font right away: it is preloaded here (and only here). */}
        {locale === 'ar' &&
          [400, 700].map((w) => (
            <link
              key={w}
              rel="preload"
              as="font"
              type="font/woff2"
              href={`/fonts/plex-arabic-${w}.woff2`}
              crossOrigin=""
            />
          ))}
      </head>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <SkipLink />
            <QueryProvider>{children}</QueryProvider>
            <Toaster dir={dir} />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
