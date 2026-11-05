import type { Metadata } from 'next';
import { locales, type Locale } from '@/i18n/routing';
import { env } from '@/lib/env';

/** Absolute URL of a page: path without the language, for example "/b/salon-nour". */
export const pageUrl = (locale: Locale, path = ''): string =>
  `${env.APP_URL}/${locale}${path === '/' ? '' : path}`;

const OG_LOCALE: Record<Locale, string> = { ar: 'ar_AR', fr: 'fr_FR', en: 'en_US' };
export const ogLocale = (locale: Locale): string => OG_LOCALE[locale];

/** Canonical link and hreflang links to the same page in the other languages. */
export function alternates(locale: Locale, path = ''): NonNullable<Metadata['alternates']> {
  return {
    canonical: pageUrl(locale, path),
    languages: {
      ...Object.fromEntries(locales.map((l) => [l, pageUrl(l, path)])),
      'x-default': pageUrl('ar', path),
    },
  };
}

/** JSON for a <script type="application/ld+json">: "<" is escaped so the data can never close the tag. */
export const jsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

const SCHEMA_TYPE: Record<string, string> = {
  salon: 'BeautySalon',
  clinic: 'MedicalClinic',
  garage: 'AutoRepair',
  restaurant: 'Restaurant',
};
export const schemaType = (category: string | null): string =>
  (category && SCHEMA_TYPE[category]) || 'LocalBusiness';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** One line per open weekday: the earliest start and the latest end of all the employees. */
export function openingHours(
  staff: { workingHours: { weekday: number; startTime: string; endTime: string }[] }[],
): { '@type': 'OpeningHoursSpecification'; dayOfWeek: string; opens: string; closes: string }[] {
  const byDay = new Map<number, { opens: string; closes: string }>();
  for (const w of staff.flatMap((s) => s.workingHours)) {
    const cur = byDay.get(w.weekday);
    byDay.set(w.weekday, {
      opens: cur && cur.opens < w.startTime ? cur.opens : w.startTime,
      closes: cur && cur.closes > w.endTime ? cur.closes : w.endTime,
    });
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a - b)
    .map(([d, h]) => ({
      '@type': 'OpeningHoursSpecification' as const,
      dayOfWeek: DAYS[d],
      ...h,
    }));
}
