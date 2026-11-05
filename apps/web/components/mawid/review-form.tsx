'use client';

import type { ReviewFormView } from '@mawid/shared';
import { Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Field } from '@/components/mawid/form-field';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTz } from '@/lib/tz';
import { cn } from '@/lib/utils';

/** Rating page opened from the email after a visit: 1 to 5 stars and a comment (FR-71). */
export function ReviewForm({ initial, token }: { initial: ReviewFormView; token: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(initial.reviewed);
  const [thanks, setThanks] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (rating < 1) {
      setError(t('reviewForm.pickRating'));
      return;
    }
    setBusy(true);
    try {
      await api<ReviewFormView>(`/public/reviews/${token}`, {
        method: 'POST',
        body: { rating, comment },
      });
      setThanks(true);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REVIEW_EXISTS') setDone(true);
      else if (err instanceof ApiError && err.code === 'NOT_COMPLETED') setNotReady(true);
      else setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  if (notReady || done) {
    const key = notReady ? 'notReady' : thanks ? 'thanks' : 'already';
    return (
      <Card className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center shadow-soft">
        <h1 role="status" className="text-2xl font-bold">
          {t(`reviewForm.${key}Title`)}
        </h1>
        <p className="text-muted-foreground">{t(`reviewForm.${key}Desc`)}</p>
      </Card>
    );
  }

  const shown = hover || rating;
  return (
    <Card className="mx-auto max-w-md space-y-5 p-6 shadow-soft">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t('reviewForm.title')}</h1>
        <p className="text-muted-foreground">
          {t('reviewForm.subtitle', {
            service: initial.serviceName,
            business: initial.businessName,
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatDateTz(initial.startsAt, initial.timezone, locale, { dateStyle: 'long' })}
        </p>
      </header>
      <form onSubmit={submit} noValidate className="space-y-5">
        <fieldset className="space-y-2" onMouseLeave={() => setHover(0)}>
          <legend className="text-sm font-medium">{t('reviewForm.rating')}</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                onMouseEnter={() => setHover(n)}
                className="relative cursor-pointer rounded-md p-1 focus-within:ring-2 focus-within:ring-ring"
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="peer sr-only"
                  aria-label={t('reviewForm.ratingStar', { n })}
                />
                <Star
                  aria-hidden
                  className={cn(
                    'size-10 transition-colors',
                    n <= shown ? 'fill-warning text-warning' : 'text-input',
                  )}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="rv-comment" label={t('reviewForm.comment')}>
          <Textarea
            id="rv-comment"
            rows={4}
            maxLength={1000}
            value={comment}
            placeholder={t('reviewForm.commentPlaceholder')}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Spinner />}
          {t('reviewForm.submit')}
        </Button>
      </form>
    </Card>
  );
}
