import { setRequestLocale } from 'next-intl/server';
import { OnboardingWizard } from '@/components/mawid/onboarding-wizard';
import { SiteHeader } from '@/components/mawid/site-header';
import { parseState } from '@/lib/mock';

export default function OnboardingPage({
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
      <main id="main" className="mx-auto flex max-w-6xl justify-center px-4 py-8">
        <OnboardingWizard state={state === 'empty' ? undefined : state} />
      </main>
    </>
  );
}
