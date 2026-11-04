import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { DashboardShell } from '@/components/mawid/dashboard-shell';
import { LogoutButton } from '@/components/mawid/logout-button';
import { SiteHeader } from '@/components/mawid/site-header';

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
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
