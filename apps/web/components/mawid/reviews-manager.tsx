'use client';

import type { OwnerReview } from '@mawid/shared';
import { MessageSquareReply, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { Field } from '@/components/mawid/form-field';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/i18n/routing';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { useBusiness, useOwnerReviews, useReplyReview } from '@/lib/queries';
import { formatDateTz } from '@/lib/tz';
import { cn } from '@/lib/utils';

export function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <div role="img" aria-label={label} className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn('size-4', n <= rating ? 'fill-warning text-warning' : 'text-input')}
        />
      ))}
    </div>
  );
}

function ReplyForm({ review, onDone }: { review: OwnerReview; onDone: () => void }) {
  const t = useTranslations();
  const reply = useReplyReview();
  const [text, setText] = useState(review.reply ?? '');
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setFieldError(undefined);
    try {
      await reply.mutateAsync({ id: review.id, reply: text });
      toast.success(t('reviewsPage.replied'));
      onDone();
    } catch (err) {
      const fe = fieldErrors(err).reply;
      if (fe) setFieldError(t(`form.errors.${fe}`));
      else setError(errorMessage(t, err));
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field id={`reply-${review.id}`} label={t('reviewsPage.replyLabel')} error={fieldError}>
        <Textarea
          id={`reply-${review.id}`}
          value={text}
          maxLength={1000}
          rows={3}
          placeholder={t('reviewsPage.replyPlaceholder')}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={reply.isPending || text.trim() === ''}>
          {reply.isPending && <Spinner />}
          {t('reviewsPage.send')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Reviews of the business, newest first. The owner can answer each one (FR-72). */
export function ReviewsManager() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const biz = useBusiness();
  const tz = biz.data?.timezone ?? 'UTC';
  const [page, setPage] = useState(1);
  const q = useOwnerReviews(page);
  const [editing, setEditing] = useState<string>();
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / 20));
  const date = (iso: string) => formatDateTz(iso, tz, locale, { dateStyle: 'medium' });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t('reviewsPage.title')}</h1>
        <p className="text-muted-foreground">{t('reviewsPage.desc')}</p>
      </header>

      {q.isError ? (
        <ErrorState
          title={t('common.errorTitle')}
          description={t('reviewsPage.error')}
          action={
            <Button variant="outline" onClick={() => q.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : q.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : q.data.items.length === 0 ? (
        <Card className="shadow-soft">
          <EmptyState
            title={t('reviewsPage.emptyTitle')}
            description={t('reviewsPage.emptyDesc')}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((r) => (
            <li key={r.id}>
              <Card className="space-y-3 p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.customerName}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.serviceName} · {date(r.createdAt)}
                    </p>
                  </div>
                  <Stars rating={r.rating} label={t('reviewsPage.stars', { rating: r.rating })} />
                </div>
                {r.comment && <p className="text-sm leading-relaxed">{r.comment}</p>}
                {editing === r.id ? (
                  <ReplyForm review={r} onDone={() => setEditing(undefined)} />
                ) : r.reply ? (
                  <div className="space-y-2 rounded-lg bg-secondary/60 p-3">
                    <p className="text-xs font-semibold text-primary">
                      {t('reviewsPage.yourReply')}
                    </p>
                    <p className="text-sm">{r.reply}</p>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r.id)}>
                      {t('reviewsPage.editReply')}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(r.id)}>
                    <MessageSquareReply aria-hidden className="me-1.5 size-4" />
                    {t('reviewsPage.reply')}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('common.back')}
          </Button>
          <span className="text-sm text-muted-foreground" dir="ltr">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
