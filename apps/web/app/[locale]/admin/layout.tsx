import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { LogoutButton } from '@/components/mawid/logout-button';
import { SiteHeader } from '@/components/mawid/site-header';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const params = await props.params;

  const { children } = props;

  setRequestLocale(params.locale);
  return (
    <>
      <SiteHeader actions={<LogoutButton />} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <AuthGate roles={['ADMIN']} needsBusiness={false}>
          {children}
        </AuthGate>
      </main>
    </>
  );
}
