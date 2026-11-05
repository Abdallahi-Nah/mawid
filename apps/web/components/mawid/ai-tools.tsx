'use client';

import type { ReviewAnalysisResult } from '@mawid/shared';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AiWriteDialog, MESSAGE_KINDS } from '@/components/mawid/ai-write-dialog';
import { Spinner } from '@/components/mawid/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useBusiness } from '@/lib/queries';
import { cn } from '@/lib/utils';

const tone = {
  positive: 'bg-success-soft text-success',
  neutral: 'bg-muted text-muted-foreground',
  negative: 'bg-destructive-soft text-destructive',
} as const;

/** The two AI helpers of the dashboard: writing messages, and analysing reviews. */
export function AiTools() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <WriterCard />
      <ReviewAnalysisCard />
    </div>
  );
}

function WriterCard() {
  const t = useTranslations('aiWrite');
  const biz = useBusiness();
  const ui = useLocale() as 'ar' | 'fr' | 'en';
  return (
    <Card className="shadow-soft">
      <CardHeader className="space-y-2">
        <Badge variant="secondary" className="w-fit gap-1.5">
          <Sparkles aria-hidden className="size-3.5 text-primary" />
          {t('badge')}
        </Badge>
        <CardTitle className="text-base">{t('cardTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('cardDesc')}</p>
        <AiWriteDialog
          kinds={MESSAGE_KINDS}
          defaultLocale={(biz.data?.defaultLocale as 'ar' | 'fr' | 'en' | undefined) ?? ui}
        />
      </CardContent>
    </Card>
  );
}

function ReviewAnalysisCard() {
  const t = useTranslations();
  const locale = useLocale() as 'ar' | 'fr' | 'en';
  const [error, setError] = useState<string>();
  const analyze = useMutation({
    mutationFn: () =>
      api<ReviewAnalysisResult>('/ai/reviews/analyze', { method: 'POST', body: { locale } }),
    onMutate: () => setError(undefined),
    onError: (e) => setError(errorMessage(t, e)),
  });
  const r = analyze.data;
  const total = r
    ? r.sentiment_counts.positive + r.sentiment_counts.neutral + r.sentiment_counts.negative
    : 0;

  return (
    <Card className="shadow-soft">
      <CardHeader className="space-y-2">
        <Badge variant="secondary" className="w-fit gap-1.5">
          <Sparkles aria-hidden className="size-3.5 text-primary" />
          {t('aiWrite.badge')}
        </Badge>
        <CardTitle className="text-base">{t('aiReviews.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!r && <p className="text-sm text-muted-foreground">{t('aiReviews.desc')}</p>}
        {r && r.reviewCount === 0 && (
          <p className="text-sm text-muted-foreground">{t('aiReviews.none')}</p>
        )}
        {r && r.reviewCount > 0 && (
          <div className="space-y-3">
            <p className="text-sm">{r.summary}</p>
            <div
              role="img"
              aria-label={t('aiReviews.counts', r.sentiment_counts)}
              className="flex h-2.5 overflow-hidden rounded-full bg-muted"
            >
              {total > 0 &&
                (['positive', 'neutral', 'negative'] as const).map((k) => (
                  <span
                    key={k}
                    style={{ width: `${(r.sentiment_counts[k] / total) * 100}%` }}
                    className={cn(
                      k === 'positive' && 'bg-success',
                      k === 'neutral' && 'bg-muted-foreground/40',
                      k === 'negative' && 'bg-destructive',
                    )}
                  />
                ))}
            </div>
            <ul className="flex flex-wrap gap-2 text-xs">
              {(['positive', 'neutral', 'negative'] as const).map((k) => (
                <li key={k} className={cn('rounded-full px-2.5 py-0.5 font-medium', tone[k])}>
                  {t(`aiReviews.${k}`)}: {r.sentiment_counts[k]}
                </li>
              ))}
            </ul>
            {r.themes.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={t('aiReviews.themes')}>
                {r.themes.map((th) => (
                  <li
                    key={th.name}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      tone[th.sentiment],
                    )}
                  >
                    {th.name} · {th.mentions}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={analyze.isPending}
          onClick={() => analyze.mutate()}
        >
          {analyze.isPending ? (
            <Spinner />
          ) : (
            <Sparkles aria-hidden className="size-4 text-primary" />
          )}
          {r ? t('aiReviews.again') : t('aiReviews.analyze')}
        </Button>
      </CardContent>
    </Card>
  );
}
