'use client';

import { forgotPasswordSchema, resetPasswordSchema } from '@mawid/shared';
import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export function PasswordForm({ mode, token }: { mode: 'forgot' | 'reset'; token?: string }) {
  const t = useTranslations();
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [apiError, setApiError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const forgot = mode === 'forgot';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(undefined);
    const parsed = forgot
      ? forgotPasswordSchema.safeParse({ email: value })
      : resetPasswordSchema.safeParse({ token: token ?? '', password: value });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0].message);
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    try {
      await api(forgot ? '/auth/forgot-password' : '/auth/reset-password', {
        method: 'POST',
        body: parsed.data,
      });
      setDone(true);
    } catch (err) {
      setApiError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="w-full max-w-md p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <MailCheck aria-hidden className="size-7" />
        </span>
        <h1 className="mt-4 text-xl font-bold">
          {t(forgot ? 'auth.forgotSentTitle' : 'auth.resetDoneTitle')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(forgot ? 'auth.forgotSentDesc' : 'auth.resetDoneDesc')}
        </p>
        {!forgot && (
          <Button asChild className="mt-6">
            <Link href="/login">{t('auth.loginCta')}</Link>
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md p-6">
      <h1 className="text-2xl font-bold">{t(forgot ? 'auth.forgotTitle' : 'auth.resetTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(forgot ? 'auth.forgotDesc' : 'auth.resetDesc')}
      </p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="v">{t(forgot ? 'auth.email' : 'auth.newPassword')}</Label>
          <Input
            id="v"
            type={forgot ? 'email' : 'password'}
            autoComplete={forgot ? 'email' : 'new-password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!fieldError}
          />
          {fieldError && (
            <p role="alert" className="text-sm text-destructive">
              {t(`form.errors.${fieldError}`)}
            </p>
          )}
        </div>
        {apiError && (
          <p
            role="alert"
            className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
          >
            {apiError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Spinner />}
          {t(forgot ? 'auth.forgotCta' : 'auth.resetCta')}
        </Button>
      </form>
    </Card>
  );
}
