'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const names: Record<Locale, { short: string; full: string }> = {
  ar: { short: 'ع', full: 'العربية' },
  fr: { short: 'FR', full: 'Français' },
  en: { short: 'EN', full: 'English' },
};

export function LanguageSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div
      role="group"
      aria-label={t('language')}
      className="inline-flex rounded-lg border bg-card p-0.5"
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={names[l].full}
          aria-label={`${names[l].short} ${names[l].full}`}
          aria-pressed={l === locale}
          onClick={() => router.replace(pathname, { locale: l })}
          className={cn(
            'h-8 min-w-9 rounded-md px-2 text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            l === locale
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-secondary',
          )}
        >
          {names[l].short}
        </button>
      ))}
    </div>
  );
}
