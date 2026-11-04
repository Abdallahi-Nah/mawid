import { defineRouting } from 'next-intl/routing';

export const locales = ['ar', 'fr', 'en'] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: 'ar',
  localeDetection: false,
});

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
