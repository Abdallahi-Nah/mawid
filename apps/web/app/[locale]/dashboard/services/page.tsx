import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { ServicesManager } from '@/components/mawid/services-manager';

export default function Page({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <AuthGate roles={['OWNER']}>
      <ServicesManager />
    </AuthGate>
  );
}
