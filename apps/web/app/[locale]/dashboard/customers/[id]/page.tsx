import { setRequestLocale } from 'next-intl/server';
import { CustomerDetailView } from '@/components/mawid/customer-detail';

export default async function CustomerPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <CustomerDetailView id={params.id} />;
}
