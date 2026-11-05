'use client';

import { BUSINESS_CATEGORIES, LOCALES, updateBusinessSchema } from '@mawid/shared';
import { Check, Copy, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/mawid/error-state';
import { AiWriteDialog, BUSINESS_KINDS } from '@/components/mawid/ai-write-dialog';
import { Field } from '@/components/mawid/form-field';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { env } from '@/lib/public-env';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { useBusiness, useUpdateBusiness, useUploadLogo } from '@/lib/queries';
import { useLocale } from 'next-intl';

const TIMEZONES = ['Africa/Nouakchott', 'Africa/Casablanca', 'Africa/Dakar', 'Europe/Paris', 'UTC'];

export function SettingsForm() {
  const t = useTranslations();
  const locale = useLocale();
  const biz = useBusiness();
  const update = useUpdateBusiness();
  const logo = useUploadLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState({
    name: '',
    slug: '',
    description: '',
    address: '',
    phone: '',
    category: '',
    timezone: 'Africa/Nouakchott',
    defaultLocale: 'ar',
    brandColor: '',
    bookingMode: 'AUTO',
    cancelLimitHours: '24',
    minNoticeHours: '2',
    maxDaysAhead: '60',
    slotStepMin: '15',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const b = biz.data;
    if (b) {
      setV({
        name: b.name,
        slug: b.slug,
        description: b.description ?? '',
        address: b.address ?? '',
        phone: b.phone ?? '',
        category: b.category ?? '',
        timezone: b.timezone,
        defaultLocale: b.defaultLocale,
        brandColor: b.brandColor ?? '',
        bookingMode: b.bookingMode,
        cancelLimitHours: String(b.cancelLimitHours),
        minNoticeHours: String(b.minNoticeHours),
        maxDaysAhead: String(b.maxDaysAhead),
        slotStepMin: String(b.slotStepMin),
      });
    }
  }, [biz.data]);

  if (biz.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (biz.isError || !biz.data) {
    return (
      <ErrorState
        title={t('common.errorTitle')}
        description={t('common.errorDesc')}
        action={
          <Button variant="outline" onClick={() => biz.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => (errors[k] ? t(`form.errors.${errors[k]}`) : undefined);
  const publicUrl = `${env.appUrl}/${locale}/b/${v.slug}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setApiError(undefined);
    const parsed = updateBusinessSchema.safeParse({
      ...v,
      category: v.category || undefined,
      cancelLimitHours: Number(v.cancelLimitHours),
      minNoticeHours: Number(v.minNoticeHours),
      maxDaysAhead: Number(v.maxDaysAhead),
      slotStepMin: Number(v.slotStepMin),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    update.mutate(parsed.data, {
      onSuccess: () => toast.success(t('common.saved')),
      onError: (e2) => {
        setApiError(errorMessage(t, e2));
        setErrors(fieldErrors(e2));
      },
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('apiErrors.UNKNOWN'));
    }
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    logo.mutate(file, {
      onSuccess: () => toast.success(t('common.saved')),
      onError: (e2) => toast.error(errorMessage(t, e2)),
    });
  }

  return (
    <form onSubmit={save} noValidate className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">{t('settings.logo')}</h2>
        <div className="flex items-center gap-4">
          {biz.data.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={biz.data.logoUrl}
              alt={t('settings.logoAlt')}
              className="size-16 rounded-xl border object-cover"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-xl border bg-secondary text-2xl font-bold text-primary">
              {(v.name[0] ?? '?').toUpperCase()}
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={t('settings.logoUpload')}
            onChange={(e) => onLogo(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={logo.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {logo.isPending ? <Spinner /> : <Upload aria-hidden className="size-4" />}
            {t('settings.logoUpload')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('settings.logoHint')}</p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">{t('settings.profile')}</h2>
        <Field id="s-name" label={t('onb.bizName')} error={err('name')}>
          <Input id="s-name" value={v.name} onChange={set('name')} aria-invalid={!!errors.name} />
        </Field>
        <Field
          id="s-slug"
          label={t('settings.slug')}
          error={err('slug')}
          hint={t('settings.slugHint')}
        >
          <Input
            id="s-slug"
            dir="ltr"
            className="text-start"
            value={v.slug}
            onChange={set('slug')}
            aria-invalid={!!errors.slug}
          />
        </Field>
        <Field id="s-cat" label={t('onb.category')} error={err('category')}>
          <Select value={v.category} onValueChange={(c) => setV((x) => ({ ...x, category: c }))}>
            <SelectTrigger id="s-cat">
              <SelectValue placeholder={t('onb.categoryPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`onb.categories.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="s-desc" label={t('settings.description')} error={err('description')}>
          <div className="space-y-2">
            <Textarea id="s-desc" rows={3} value={v.description} onChange={set('description')} />
            <AiWriteDialog
              kinds={BUSINESS_KINDS}
              defaultLocale={v.defaultLocale as 'ar' | 'fr' | 'en'}
              seed={[v.name, v.category].filter(Boolean).join(', ')}
              onUse={(text) => setV((x) => ({ ...x, description: text }))}
            />
          </div>
        </Field>
        <Field id="s-addr" label={t('settings.address')} error={err('address')}>
          <Input id="s-addr" value={v.address} onChange={set('address')} />
        </Field>
        <Field id="s-phone" label={t('form.phone')} error={err('phone')}>
          <Input
            id="s-phone"
            type="tel"
            dir="ltr"
            className="text-start"
            placeholder={t('form.phonePlaceholder')}
            value={v.phone}
            onChange={set('phone')}
            aria-invalid={!!errors.phone}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">{t('settings.preferences')}</h2>
        <Field id="s-lang" label={t('settings.defaultLocale')}>
          <Select
            value={v.defaultLocale}
            onValueChange={(c) => setV((x) => ({ ...x, defaultLocale: c }))}
          >
            <SelectTrigger id="s-lang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l} value={l}>
                  {t(`settings.locales.${l}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="s-tz" label={t('settings.timezone')} error={err('timezone')}>
          <Select value={v.timezone} onValueChange={(c) => setV((x) => ({ ...x, timezone: c }))}>
            <SelectTrigger id="s-tz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(TIMEZONES.includes(v.timezone) ? TIMEZONES : [v.timezone, ...TIMEZONES]).map(
                (z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field id="s-mode" label={t('settings.bookingMode')} hint={t('settings.bookingModeHint')}>
          <Select
            value={v.bookingMode}
            onValueChange={(c) => setV((x) => ({ ...x, bookingMode: c }))}
          >
            <SelectTrigger id="s-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AUTO">{t('settings.modes.AUTO')}</SelectItem>
              <SelectItem value="MANUAL">{t('settings.modes.MANUAL')}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="s-cancel" label={t('settings.cancelLimit')} error={err('cancelLimitHours')}>
          <Input
            id="s-cancel"
            type="number"
            min={0}
            max={720}
            dir="ltr"
            className="text-start"
            value={v.cancelLimitHours}
            onChange={set('cancelLimitHours')}
          />
        </Field>
        <Field
          id="s-notice"
          label={t('settings.minNotice')}
          error={err('minNoticeHours')}
          hint={t('settings.minNoticeHint')}
        >
          <Input
            id="s-notice"
            type="number"
            min={0}
            max={720}
            dir="ltr"
            className="text-start"
            value={v.minNoticeHours}
            onChange={set('minNoticeHours')}
          />
        </Field>
        <Field
          id="s-ahead"
          label={t('settings.maxDaysAhead')}
          error={err('maxDaysAhead')}
          hint={t('settings.maxDaysAheadHint')}
        >
          <Input
            id="s-ahead"
            type="number"
            min={1}
            max={365}
            dir="ltr"
            className="text-start"
            value={v.maxDaysAhead}
            onChange={set('maxDaysAhead')}
          />
        </Field>
        <Field
          id="s-step"
          label={t('settings.slotStep')}
          error={err('slotStepMin')}
          hint={t('settings.slotStepHint')}
        >
          <Select
            value={v.slotStepMin}
            onValueChange={(c) => setV((x) => ({ ...x, slotStepMin: c }))}
          >
            <SelectTrigger id="s-step">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 20, 30, 60].map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {t('settings.minutes', { count: m })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          id="s-color"
          label={t('settings.brandColor')}
          error={err('brandColor')}
          hint={t('settings.brandColorHint')}
        >
          <div className="flex items-center gap-3">
            <input
              id="s-color"
              type="color"
              value={v.brandColor || '#0f766e'}
              onChange={set('brandColor')}
              className="h-10 w-14 cursor-pointer rounded-md border bg-background p-1"
            />
            {v.brandColor && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setV((x) => ({ ...x, brandColor: '' }))}
              >
                {t('settings.brandColorReset')}
              </Button>
            )}
          </div>
        </Field>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">{t('settings.share')}</h2>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            dir="ltr"
            className="text-start"
            value={publicUrl}
            aria-label={t('settings.share')}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('settings.copyLink')}
            onClick={copy}
          >
            {copied ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
          </Button>
        </div>
        <p aria-live="polite" className="sr-only">
          {copied ? t('settings.copied') : ''}
        </p>
      </Card>

      {apiError && (
        <p
          role="alert"
          className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          {apiError}
        </p>
      )}
      <Button type="submit" disabled={update.isPending}>
        {update.isPending && <Spinner />}
        {t('common.save')}
      </Button>
    </form>
  );
}
