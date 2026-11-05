'use client';

import { useTranslations } from 'next-intl';

/** First Tab stop of every page: jumps over the header to the main content (WCAG 2.4.1). */
export function SkipLink() {
  const t = useTranslations('common');
  return (
    <a
      href="#main"
      onClick={(e) => {
        const main = document.querySelector<HTMLElement>('main');
        if (!main) return;
        e.preventDefault();
        main.setAttribute('tabindex', '-1');
        main.focus();
        main.scrollIntoView();
      }}
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-3 focus-visible:top-3 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground focus-visible:shadow-lifted"
    >
      {t('skipToContent')}
    </a>
  );
}
