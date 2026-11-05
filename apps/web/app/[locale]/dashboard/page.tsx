import { setRequestLocale } from 'next-intl/server';
import { DashboardHome } from '@/components/mawid/dashboard-home';

export default function DashboardPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return <DashboardHome />;
}
