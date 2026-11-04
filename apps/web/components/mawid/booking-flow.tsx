'use client';

import { customerDetailsSchema } from '@mawid/shared';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DatePicker } from '@/components/mawid/date-picker';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { ServiceCard } from '@/components/mawid/service-card';
import { SlotPicker } from '@/components/mawid/slot-picker';
import { Spinner } from '@/components/mawid/spinner';
import { StaffCard } from '@/components/mawid/staff-card';
import { Stepper } from '@/components/mawid/stepper';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDate, formatPrice } from '@/lib/format';
import type { PublicBusiness } from '@mawid/shared';
import { slotsFor } from '@/lib/mock';

type SlotsState = 'idle' | 'loading' | 'ready' | 'error';
type Errors = Partial<Record<'name' | 'phone' | 'email', string>>;

const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

export function BookingFlow({
  data,
  initialService,
  forceSlotsError,
}: {
  data: Pick<PublicBusiness, 'slug' | 'services' | 'staff'>;
  initialService?: string;
  forceSlotsError?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serviceId, setServiceId] = useState<string | undefined>(
    data.services.some((s) => s.id === initialService) ? initialService : undefined,
  );
  const [staffId, setStaffId] = useState<string | undefined>();
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState<string | undefined>();
  const [slotsState, setSlotsState] = useState<SlotsState>('idle');
  const [values, setValues] = useState({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Errors>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  const steps = (['service', 'staff', 'datetime', 'details'] as const).map((k) => t(`steps.${k}`));
  const service = data.services.find((s) => s.id === serviceId);
  const team = data.staff.filter((m) => !serviceId || m.serviceIds.includes(serviceId));
  const slots = useMemo(() => (date ? slotsFor(date) : []), [date]);

  // Simulated loading of the slots when the date changes.
  useEffect(() => {
    if (!date) return;
    setSlotsState('loading');
    setTime(undefined);
    const id = setTimeout(() => setSlotsState(forceSlotsError ? 'error' : 'ready'), 450);
    return () => clearTimeout(id);
  }, [date, forceSlotsError]);

  // Move focus to the step title for keyboard and screen reader users.
  useEffect(() => {
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [step, done]);

  const canNext = [!!serviceId, !!staffId, !!date && !!time, true][step];
  const staffName =
    staffId === 'any' ? t('book.anyone') : data.staff.find((m) => m.id === staffId)?.displayName;

  async function submit() {
    const parsed = customerDetailsSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 900)); // mock: no backend yet
    setSubmitting(false);
    setDone(true);
  }

  const summary = (
    <Card className="space-y-4 p-5 shadow-soft">
      <h2 className="font-semibold">{t('book.summary')}</h2>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t('steps.service')}</dt>
          <dd className="font-medium">{service ? service.name : t('book.notSelected')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('book.with')}</dt>
          <dd className="font-medium">{staffName ?? t('book.notSelected')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('book.when')}</dt>
          <dd className="font-medium">
            {date && time ? (
              <>
                {formatDate(date, locale)} · <span dir="ltr">{time}</span>
              </>
            ) : (
              t('book.notSelected')
            )}
          </dd>
        </div>
      </dl>
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">{t('book.total')}</span>
        <span className="text-lg font-semibold">
          {service ? formatPrice(service.price, locale) : '—'}
        </span>
      </div>
    </Card>
  );

  if (done) {
    return (
      <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center shadow-lifted">
        <span className="pop-in flex size-20 items-center justify-center rounded-full bg-success-soft text-success">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path className="check-draw" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          role="status"
          className="text-2xl font-bold outline-none"
        >
          {t('book.successTitle')}
        </h1>
        <p className="text-muted-foreground">{t('book.successDesc')}</p>
        <div className="w-full text-start">{summary}</div>
        <Button asChild className="w-full">
          <Link href={`/b/${data.slug}`}>{t('book.backToBusiness')}</Link>
        </Button>
      </Card>
    );
  }

  const titles = [
    'book.serviceTitle',
    'book.staffTitle',
    'book.dateTitle',
    'book.detailsTitle',
  ] as const;

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <Stepper
        steps={steps}
        current={step}
        progressLabel={t('steps.progress', { current: step + 1, total: steps.length })}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-4">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            {t(titles[step])}
          </h2>

          {step === 0 && (
            <div className="grid gap-3">
              {data.services.map((s) => (
                <ServiceCard
                  key={s.id}
                  name={s.name}
                  description={s.description ?? undefined}
                  duration={t('service.duration', { minutes: s.durationMin })}
                  price={formatPrice(s.price, locale)}
                  selected={serviceId === s.id}
                  bookLabel={serviceId === s.id ? t('service.selected') : t('service.choose')}
                  onBook={() => {
                    setServiceId(s.id);
                    setStaffId((prev) =>
                      prev === 'any' ||
                      data.staff.find((m) => m.id === prev)?.serviceIds.includes(s.id)
                        ? prev
                        : undefined,
                    );
                  }}
                />
              ))}
            </div>
          )}

          {step === 1 && (
            <div role="radiogroup" aria-label={t('steps.staff')} className="grid gap-3">
              <StaffCard
                name={t('book.anyone')}
                role={t('book.anyoneDesc')}
                initials="★"
                selected={staffId === 'any'}
                onSelect={() => setStaffId('any')}
              />
              {team.map((m) => (
                <StaffCard
                  key={m.id}
                  name={m.displayName}
                  initials={initials(m.displayName)}
                  photoUrl={m.photoUrl ?? undefined}
                  selected={staffId === m.id}
                  onSelect={() => setStaffId(m.id)}
                />
              ))}
            </div>
          )}

          {step === 2 && (
            <Card className="space-y-5 p-5 shadow-soft">
              <div className="space-y-1.5">
                <Label>{t('booking.dateLabel')}</Label>
                <DatePicker
                  value={date}
                  onChange={setDate}
                  placeholder={t('booking.datePlaceholder')}
                  label={t('booking.dateLabel')}
                />
              </div>
              <div className="space-y-2" aria-live="polite">
                <Label>{t('booking.slotsLabel')}</Label>
                {!date && (
                  <p className="text-sm text-muted-foreground">{t('book.pickDateFirst')}</p>
                )}
                {date && slotsState === 'loading' && (
                  <div aria-busy="true" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }, (_, i) => (
                      <Skeleton key={i} className="h-11" />
                    ))}
                  </div>
                )}
                {date && slotsState === 'error' && (
                  <ErrorState
                    title={t('book.slotsError')}
                    action={
                      <Button variant="outline" onClick={() => setDate(new Date(date))}>
                        {t('common.retry')}
                      </Button>
                    }
                  />
                )}
                {date && slotsState === 'ready' && slots.length === 0 && (
                  <EmptyState title={t('book.noSlotsTitle')} description={t('book.noSlotsDesc')} />
                )}
                {date && slotsState === 'ready' && slots.length > 0 && (
                  <>
                    <SlotPicker
                      slots={slots}
                      value={time}
                      onChange={setTime}
                      label={t('booking.slotsLabel')}
                    />
                    <p className="text-xs text-muted-foreground">{t('booking.slotsHint')}</p>
                  </>
                )}
              </div>
            </Card>
          )}

          {step === 3 && (
            <Card className="space-y-4 p-5 shadow-soft">
              {(['name', 'phone', 'email'] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={`d-${field}`}>
                    {field === 'email' ? t('form.emailOptional') : t(`form.${field}`)}
                  </Label>
                  <Input
                    id={`d-${field}`}
                    value={values[field]}
                    inputMode={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
                    autoComplete={field === 'name' ? 'name' : field === 'phone' ? 'tel' : 'email'}
                    dir={field === 'name' ? undefined : 'ltr'}
                    placeholder={
                      field === 'name'
                        ? t('form.namePlaceholder')
                        : field === 'phone'
                          ? t('form.phonePlaceholder')
                          : undefined
                    }
                    aria-invalid={!!errors[field]}
                    aria-describedby={errors[field] ? `d-${field}-err` : undefined}
                    className={
                      errors[field]
                        ? 'border-destructive focus-visible:ring-destructive'
                        : undefined
                    }
                    onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                  />
                  {errors[field] && (
                    <p id={`d-${field}-err`} role="alert" className="text-sm text-destructive">
                      {t(`form.errors.${errors[field]}`)}
                    </p>
                  )}
                </div>
              ))}
            </Card>
          )}
        </section>

        <aside className={step === 3 ? undefined : 'hidden lg:block'}>{summary}</aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Button
          variant="outline"
          disabled={step === 0 || submitting}
          onClick={() => setStep((s) => s - 1)}
        >
          {t('common.back')}
        </Button>
        {step < 3 ? (
          <Button
            className="flex-1 lg:flex-none"
            disabled={!canNext}
            onClick={() => setStep((s) => s + 1)}
          >
            {t('common.next')}
          </Button>
        ) : (
          <Button className="flex-1 lg:flex-none" disabled={submitting} onClick={submit}>
            {submitting ? (
              <>
                <Spinner />
                {t('book.confirming')}
              </>
            ) : (
              <>
                <Check aria-hidden className="size-4" />
                {t('book.confirm')}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
