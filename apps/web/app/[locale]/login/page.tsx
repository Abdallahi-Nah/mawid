import { setRequestLocale } from 'next-intl/server';
import { AuthForm } from '@/components/mawid/auth-form';
import { SiteHeader } from '@/components/mawid/site-header';
import { parseState } from '@/lib/mock';

export default async function Page(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  setRequestLocale(params.locale);
  const state = parseState(searchParams.state);
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-start justify-center px-4 py-10 sm:items-center"
      >
        <AuthForm mode="login" state={state === 'empty' ? undefined : state} />
      </main>
    </>
  );
}
