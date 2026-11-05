import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { PaymentsManager } from '@/components/mawid/payments-manager';

export default async function Page(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return (
    <AuthGate roles={['OWNER']}>
      <PaymentsManager />
    </AuthGate>
  );
}
