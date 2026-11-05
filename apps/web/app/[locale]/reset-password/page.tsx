import { setRequestLocale } from 'next-intl/server';
import { PasswordForm } from '@/components/mawid/password-forms';
import { SiteHeader } from '@/components/mawid/site-header';

export default async function Page(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  setRequestLocale(params.locale);
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-start justify-center px-4 py-10 sm:items-center"
      >
        <PasswordForm mode="reset" token={searchParams.token} />
      </main>
    </>
  );
}
