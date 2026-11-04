'use client';

import { loginSchema, registerSchema } from '@mawid/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorState } from '@/components/mawid/error-state';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, useRouter } from '@/i18n/navigation';

type Mode = 'login' | 'register';
type Field = 'name' | 'email' | 'password' | 'terms';

export function AuthForm({ mode, state }: { mode: Mode; state?: 'loading' | 'error' | 'empty' }) {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(state === 'error');
  const register = mode === 'register';

  if (state === 'loading') {
    return (
      <Card aria-busy="true" className="w-full max-w-md space-y-4 p-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = register
      ? registerSchema.safeParse({ ...values, terms })
      : loginSchema.safeParse({ email: values.email, password: values.password });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700)); // fake request
    setSubmitting(false);
    router.push(register ? '/onboarding' : '/dashboard');
  }

  const err = (f: Field) => (errors[f] ? t(`form.errors.${errors[f]}`) : undefined);
  const field = (id: Field, type: string, autoComplete: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t(`auth.${id}`)}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={values[id as 'name' | 'email' | 'password']}
        onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
        aria-invalid={!!errors[id]}
        aria-describedby={errors[id] ? `${id}-err` : undefined}
      />
      {errors[id] && (
        <p id={`${id}-err`} role="alert" className="text-sm text-destructive">
          {err(id)}
        </p>
      )}
    </div>
  );

  if (failed) {
    return (
      <Card className="w-full max-w-md">
        <ErrorState
          title={t('auth.errorTitle')}
          description={t('auth.errorDesc')}
          action={<Button variant="outline" onClick={() => setFailed(false)}>{t('common.retry')}</Button>}
        />
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md p-6">
      <h1 className="text-2xl font-bold">{t(register ? 'auth.registerTitle' : 'auth.loginTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t(register ? 'auth.registerDesc' : 'auth.loginDesc')}</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {register && field('name', 'text', 'name')}
        {field('email', 'email', 'email')}
        {field('password', 'password', register ? 'new-password' : 'current-password')}
        {register && (
          <div>
            <div className="flex items-center gap-2">
              <Checkbox id="terms" checked={terms} onCheckedChange={(c) => setTerms(c === true)} />
              <Label htmlFor="terms">{t('form.terms')}</Label>
            </div>
            {errors.terms && <p role="alert" className="mt-1 text-sm text-destructive">{err('terms')}</p>}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Spinner />}
          {t(register ? 'auth.registerCta' : 'auth.loginCta')}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t(register ? 'auth.haveAccount' : 'auth.noAccount')}{' '}
        <Link href={register ? '/login' : '/register'} className="font-medium text-primary hover:underline">
          {t(register ? 'auth.loginCta' : 'auth.registerCta')}
        </Link>
      </p>
    </Card>
  );
}
