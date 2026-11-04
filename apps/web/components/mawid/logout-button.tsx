'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { useLogout } from '@/lib/queries';

export function LogoutButton() {
  const t = useTranslations('auth');
  const router = useRouter();
  const logout = useLogout();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('logout')}
      title={t('logout')}
      disabled={logout.isPending}
      onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
    >
      <LogOut aria-hidden className="size-4 rtl:-scale-x-100" />
    </Button>
  );
}
