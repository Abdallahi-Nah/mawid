import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { SettingsForm } from '@/components/mawid/settings-form';

export default async function Page(props: { params: Promise<{ locale: string }> }) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return (
    <AuthGate roles={['OWNER']}>
      <SettingsForm />
    </AuthGate>
  );
}
