import { setRequestLocale } from 'next-intl/server';
import { DashboardHome } from '@/components/mawid/dashboard-home';

export default async function DashboardPage(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <DashboardHome />;
}
