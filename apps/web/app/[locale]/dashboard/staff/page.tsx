import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { StaffManager } from '@/components/mawid/staff-manager';

export default function Page({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <AuthGate roles={['OWNER']}>
      <StaffManager />
    </AuthGate>
  );
}
