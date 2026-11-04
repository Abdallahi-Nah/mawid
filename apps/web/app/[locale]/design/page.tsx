import { setRequestLocale } from 'next-intl/server';
import { DesignClient } from './design-client';

export default function DesignPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return <DesignClient />;
}
