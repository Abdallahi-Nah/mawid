import { setRequestLocale } from 'next-intl/server';
import { CustomersList } from '@/components/mawid/customers-list';

export default function CustomersPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return <CustomersList />;
}
