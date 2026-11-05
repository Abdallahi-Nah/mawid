'use client';

import { Check, Copy, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useBusiness } from '@/lib/queries';
import { env } from '@/lib/public-env';

/** Link and QR code of the public page (FR-13). The QR code is drawn in the browser: nothing is sent anywhere. */
export function ShareCard() {
  const t = useTranslations('shareCard');
  const biz = useBusiness();
  const slug = biz.data?.slug;
  const link = slug ? `${env.appUrl}/${biz.data?.defaultLocale ?? 'ar'}/b/${slug}` : '';
  const [qr, setQr] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    // Loaded only when this card is shown: the QR library is not part of the other pages.
    void import('qrcode')
      .then((QR) => QR.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: 'M' }))
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('error'));
    }
  }

  return (
    <Card className="space-y-4 p-5 shadow-soft">
      <div>
        <h2 className="font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('desc')}</p>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex size-40 shrink-0 items-center justify-center rounded-xl border bg-white p-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={t('qrAlt')} width={144} height={144} className="size-full" />
          ) : failed ? (
            <p role="alert" className="text-center text-xs text-destructive">
              {t('error')}
            </p>
          ) : (
            <Skeleton className="size-full" />
          )}
        </div>
        <div className="w-full min-w-0 flex-1 space-y-3">
          <div className="flex gap-2">
            <Input
              readOnly
              dir="ltr"
              value={link}
              aria-label={t('title')}
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copy}
              aria-label={t('copy')}
            >
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
            </Button>
          </div>
          <Button asChild variant="outline" disabled={!qr}>
            <a href={qr} download={`qr-${slug ?? 'mawid'}.png`} aria-disabled={!qr}>
              <Download aria-hidden className="me-2 size-4" />
              {t('download')}
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
