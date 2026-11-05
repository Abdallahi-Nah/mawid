'use client';

import type { PublicBookingView } from '@mawid/shared';
import { CheckCircle2, Clock, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/mawid/form-field';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

const MAX_BYTES = 2 * 1024 * 1024;

/** The customer pays the deposit outside Mawid (mobile payment) and sends the reference or a screenshot (FR-61). */
export function DepositSection({
  view,
  token,
  onChange,
}: {
  view: PublicBookingView;
  token: string;
  onChange: (next: PublicBookingView) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as 'ar' | 'fr' | 'en';
  const deposit = view.deposit;
  const fileRef = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState('');
  const [fileName, setFileName] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  if (!deposit) return null;

  const key =
    deposit.status === 'PAID'
      ? 'PAID'
      : deposit.status === 'FAILED'
        ? 'FAILED'
        : deposit.submitted
          ? 'submitted'
          : 'todo';
  const showForm =
    view.status === 'PENDING' &&
    (deposit.status === 'FAILED' ||
      (deposit.status === 'PENDING' && (!deposit.submitted || again)));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const file = fileRef.current?.files?.[0];
    if (!reference.trim() && !file) {
      setError(t('deposit.needProof'));
      return;
    }
    if (file && file.size > MAX_BYTES) {
      setError(t('apiErrors.PAYLOAD_TOO_LARGE'));
      return;
    }
    const form = new FormData();
    if (reference.trim()) form.set('reference', reference.trim());
    if (file) form.set('file', file);
    setBusy(true);
    try {
      const next = await api<PublicBookingView>(`/public/bookings/${token}/payment`, {
        method: 'POST',
        form,
      });
      onChange(next);
      setReference('');
      setFileName(undefined);
      setAgain(false);
      toast.success(t('deposit.sent'));
    } catch (e2) {
      setError(errorMessage(t, e2));
    } finally {
      setBusy(false);
    }
  }

  const Icon = key === 'PAID' ? CheckCircle2 : key === 'submitted' ? Clock : Wallet;
  return (
    <Card className="space-y-4 p-5 shadow-soft">
      <h2 className="flex items-center gap-2 font-semibold">
        <Wallet aria-hidden className="size-4 text-primary" />
        {t('deposit.title')}
      </h2>
      <p className="text-lg font-semibold">
        {t('deposit.amount', { amount: formatPrice(deposit.amount, locale) })}
      </p>
      <p
        role="status"
        className={cn(
          'flex items-start gap-2 rounded-lg p-3 text-sm font-medium',
          key === 'PAID' && 'bg-success-soft text-success',
          key === 'FAILED' && 'bg-destructive-soft text-destructive',
          (key === 'todo' || key === 'submitted') && 'bg-warning-soft text-warning',
        )}
      >
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t(`deposit.status.${key}`)}
      </p>

      {view.status === 'PENDING' && deposit.status !== 'PAID' && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{t('deposit.howTo')}</p>
          <p className="whitespace-pre-line rounded-lg bg-muted p-3">
            {deposit.instructions ?? t('deposit.noInstructions')}
          </p>
        </div>
      )}

      {showForm ? (
        <form onSubmit={send} noValidate className="space-y-3">
          <Field id="dep-ref" label={t('deposit.reference')} hint={t('deposit.referenceHint')}>
            <Input
              id="dep-ref"
              dir="ltr"
              className="text-start"
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field id="dep-file" label={t('deposit.file')} hint={t('deposit.fileHint')}>
            <Input
              id="dep-file"
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFileName(e.target.files?.[0]?.name)}
            />
          </Field>
          {fileName && <p className="sr-only">{fileName}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Spinner />}
            {t('deposit.send')}
          </Button>
        </form>
      ) : (
        deposit.status === 'PENDING' &&
        deposit.submitted &&
        view.status === 'PENDING' && (
          <Button type="button" variant="ghost" onClick={() => setAgain(true)}>
            {t('deposit.resend')}
          </Button>
        )
      )}
    </Card>
  );
}
