import { setRequestLocale } from 'next-intl/server';
import { AdminPanel } from '@/components/mawid/admin-panel';

export default async function Page(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <AdminPanel />;
}
