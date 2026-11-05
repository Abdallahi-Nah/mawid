import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { StaffManager } from '@/components/mawid/staff-manager';

export default async function Page(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return (
    <AuthGate roles={['OWNER']}>
      <StaffManager />
    </AuthGate>
  );
}
