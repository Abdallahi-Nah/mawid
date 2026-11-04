import { setRequestLocale } from 'next-intl/server';
import { DashboardShell } from '@/components/mawid/dashboard-shell';
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
      <SiteHeader />
      <DashboardShell>{children}</DashboardShell>
    </>
  );
}
