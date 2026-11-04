import type { Locale } from '@/i18n/routing';

// Latin digits also in Arabic (usual in Mauritania).
const intlLocale = (locale: Locale): string => (locale === 'ar' ? 'ar-u-nu-latn' : locale);

export function formatPrice(amount: number, locale: Locale, currency = 'MRU'): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long' }).format(date);
}
