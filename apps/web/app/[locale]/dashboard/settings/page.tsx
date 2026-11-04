import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { SettingsForm } from '@/components/mawid/settings-form';

export default function Page({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <AuthGate roles={['OWNER']}>
      <SettingsForm />
    </AuthGate>
  );
}
