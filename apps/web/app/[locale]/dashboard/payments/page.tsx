import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { PaymentsManager } from '@/components/mawid/payments-manager';

export default function Page({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <AuthGate roles={['OWNER']}>
      <PaymentsManager />
    </AuthGate>
  );
}
