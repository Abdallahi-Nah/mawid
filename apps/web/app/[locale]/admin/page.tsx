import { setRequestLocale } from 'next-intl/server';
import { AdminPanel } from '@/components/mawid/admin-panel';

export default function Page({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return <AdminPanel />;
}
