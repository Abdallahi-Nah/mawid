import '@/lib/env';
import type { Metadata } from 'next';
import { Inter, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { ThemeProvider } from '@/components/mawid/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { isLocale, locales } from '@/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'common' });
  return { title: t('appName'), description: t('tagline') };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${inter.variable} ${plexArabic.variable}`}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            {children}
            <Toaster dir={dir} />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
