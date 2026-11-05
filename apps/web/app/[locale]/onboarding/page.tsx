import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { OnboardingWizard } from '@/components/mawid/onboarding-wizard';
import { SiteHeader } from '@/components/mawid/site-header';
import { parseState } from '@/lib/mock';

export default async function OnboardingPage(props: {
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
      <main id="main" className="mx-auto flex max-w-6xl justify-center px-4 py-8">
        <AuthGate roles={['OWNER']}>
          <OnboardingWizard state={state === 'empty' ? undefined : state} />
        </AuthGate>
      </main>
    </>
  );
}
