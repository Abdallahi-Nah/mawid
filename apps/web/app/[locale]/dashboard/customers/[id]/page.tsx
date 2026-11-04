import { setRequestLocale } from 'next-intl/server';
import { CustomerDetailView } from '@/components/mawid/customer-detail';

export default function CustomerPage({ params }: { params: { locale: string; id: string } }) {
  setRequestLocale(params.locale);
  return <CustomerDetailView id={params.id} />;
}
