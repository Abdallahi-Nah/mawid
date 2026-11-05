import { setRequestLocale } from 'next-intl/server';
import { DesignClient } from './design-client';

export default async function DesignPage(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <DesignClient />;
}
