import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/mawid/language-switcher';
import { ThemeToggle } from '@/components/mawid/theme-toggle';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function HomePage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="text-xl font-bold text-primary">{t('common.appName')}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <section className="my-auto space-y-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('home.title')}</h1>
        <p className="text-muted-foreground">{t('home.subtitle')}</p>
        <Button asChild>
          <Link href="/design">{t('home.designLink')}</Link>
        </Button>
      </section>
    </main>
  );
}
