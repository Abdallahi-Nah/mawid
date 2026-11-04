import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SiteHeader } from '@/components/mawid/site-header';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SearchX aria-hidden className="size-7" />
        </span>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('desc')}</p>
        <Button asChild className="mt-2">
          <Link href="/">{t('home')}</Link>
        </Button>
      </main>
    </>
  );
}
