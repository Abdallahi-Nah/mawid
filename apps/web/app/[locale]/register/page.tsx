import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from '@/components/mawid/auth-form';
import { SiteHeader } from '@/components/mawid/site-header';
import { parseState } from '@/lib/mock';

export default function Page({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { state?: string };
}) {
  setRequestLocale(params.locale);
  const state = parseState(searchParams.state);
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-start justify-center px-4 py-10 sm:items-center">
        <AuthForm mode="register" state={state === 'empty' ? undefined : state} />
      </main>
    </>
  );
}
