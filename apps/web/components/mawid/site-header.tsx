import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/mawid/language-switcher';
import { ThemeToggle } from '@/components/mawid/theme-toggle';
import { Link } from '@/i18n/navigation';

export function SiteHeader({ nav, actions }: { nav?: ReactNode; actions?: ReactNode }) {
  const t = useTranslations('common');
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="text-xl font-bold text-primary">
          {t('appName')}
        </Link>
        <nav className="hidden flex-1 items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          {nav}
        </nav>
        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <LanguageSwitcher />
          <ThemeToggle />
          {actions}
        </div>
      </div>
    </header>
  );
}
