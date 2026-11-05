import { setRequestLocale } from 'next-intl/server';
import { AuthGate } from '@/components/mawid/auth-gate';
import { ReviewsManager } from '@/components/mawid/reviews-manager';

export default function Page({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <AuthGate roles={['OWNER']}>
      <ReviewsManager />
    </AuthGate>
  );
}
