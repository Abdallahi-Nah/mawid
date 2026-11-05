import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { DashboardShell } from '@/components/mawid/dashboard-shell';
import { LogoutButton } from '@/components/mawid/logout-button';
import { SiteHeader } from '@/components/mawid/site-header';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const params = await props.params;

  const { children } = props;

  setRequestLocale(params.locale);
  return (
    <>
      <SiteHeader actions={<LogoutButton />} />
      <AuthGate roles={['OWNER', 'STAFF']}>
        <DashboardShell>{children}</DashboardShell>
      </AuthGate>
    </>
  );
}
