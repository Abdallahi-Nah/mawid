import { setRequestLocale } from 'next-intl/server';
import { CustomersList } from '@/components/mawid/customers-list';

export default async function CustomersPage(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <CustomersList />;
}
