import { setRequestLocale } from 'next-intl/server';
import { PasswordForm } from '@/components/mawid/password-forms';
import { SiteHeader } from '@/components/mawid/site-header';

export default function Page({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-start justify-center px-4 py-10 sm:items-center"
      >
        <PasswordForm mode="forgot" token={undefined} />
      </main>
    </>
  );
}
