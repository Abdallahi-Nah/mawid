'use client';

import { onboardingBusinessSchema } from '@mawid/shared';
import { Check, Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ErrorState } from '@/components/mawid/error-state';
import { Spinner } from '@/components/mawid/spinner';
import { Stepper } from '@/components/mawid/stepper';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { business } from '@/lib/mock';
import { useMe } from '@/lib/queries';
import { slugify } from '@/lib/slug';
import type { Page, ServiceDto, StaffDto } from '@/lib/types';

const CATEGORIES = ['salon', 'clinic', 'garage', 'restaurant'] as const;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WEEKDAY: Record<(typeof DAYS)[number], number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function OnboardingWizard({ state }: { state?: 'loading' | 'error' }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const me = useMe();
  const [saveError, setSaveError] = useState<string>();
  const [hoursError, setHoursError] = useState<string>();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(state === 'error');
  const [info, setInfo] = useState({ name: '', category: '', phone: '' });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'category' | 'phone', string>>>({});
  const [services, setServices] = useState<string[]>(['cut']);
  const [days, setDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'sat']);
  const [hours, setHours] = useState({ open: '09:00', close: '18:00' });
  const [team, setTeam] = useState<string[]>([]);
  const [member, setMember] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [step, done]);

  if (state === 'loading') {
    return (
      <div aria-busy="true" className="w-full max-w-2xl space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (failed) {
    return (
      <Card className="w-full max-w-2xl">
        <ErrorState
          title={t('onb.errorTitle')}
          description={t('onb.errorDesc')}
          action={
            <Button variant="outline" onClick={() => setFailed(false)}>
              {t('common.retry')}
            </Button>
          }
        />
      </Card>
    );
  }

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function next() {
    if (step === 0) {
      const parsed = onboardingBusinessSchema.safeParse(info);
      if (!parsed.success) {
        const e: typeof errors = {};
        for (const i of parsed.error.issues) e[i.path[0] as keyof typeof errors] ??= i.message;
        setErrors(e);
        return;
      }
      setErrors({});
    }
    if (step === 2) {
      if (days.length === 0 || hours.close <= hours.open) {
        setHoursError(days.length === 0 ? 'required' : 'endBeforeStart');
        return;
      }
      setHoursError(undefined);
    }
    setStep(step + 1);
  }

  // Creates everything for real. Safe to retry: services and employees that already exist are skipped.
  async function finish() {
    setSaving(true);
    setSaveError(undefined);
    try {
      const slug = slugify(info.name);
      const profile = { name: info.name, category: info.category, phone: info.phone };
      try {
        await api('/businesses/me', {
          method: 'PATCH',
          body: slug ? { ...profile, slug } : profile,
        });
      } catch (e) {
        // The address is taken: keep the generated one.
        if (e instanceof ApiError && e.code === 'SLUG_TAKEN')
          await api('/businesses/me', { method: 'PATCH', body: profile });
        else throw e;
      }
      const existingServices = (await api<Page<ServiceDto>>('/services?pageSize=100')).items;
      const serviceIds: string[] = [];
      for (const id of services) {
        const name = t(`mock.services.${id}`);
        const found = existingServices.find((x) => x.name === name);
        if (found) {
          serviceIds.push(found.id);
          continue;
        }
        const def = business.services.find((x) => x.id === id)!;
        const created = await api<ServiceDto>('/services', {
          method: 'POST',
          body: {
            name,
            description: t(`mock.services.${id}Desc`),
            durationMin: def.minutes,
            price: def.price,
          },
        });
        serviceIds.push(created.id);
      }
      const existingStaff = (await api<Page<StaffDto>>('/staff?pageSize=100')).items;
      const rows = days.map((d) => ({
        weekday: WEEKDAY[d as (typeof DAYS)[number]],
        startTime: hours.open,
        endTime: hours.close,
      }));
      for (const displayName of team.length ? team : [me.data?.name ?? info.name]) {
        const found = existingStaff.find((x) => x.displayName === displayName);
        const staff =
          found ??
          (await api<StaffDto>('/staff', { method: 'POST', body: { displayName, serviceIds } }));
        await api(`/staff/${staff.id}/working-hours`, { method: 'PUT', body: rows });
      }
      await Promise.all(
        ['business', 'services', 'staff', 'working-hours'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
      setDone(true);
    } catch (e) {
      setSaveError(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  }

  const addMember = () => {
    const v = member.trim();
    if (v && !team.includes(v)) setTeam([...team, v]);
    setMember('');
  };

  const steps = (['business', 'services', 'hours', 'team'] as const).map((k) =>
    t(`onb.steps.${k}`),
  );
  const err = (k: 'name' | 'category' | 'phone') =>
    errors[k] ? t(`form.errors.${errors[k]}`) : undefined;

  if (done) {
    return (
      <Card className="w-full max-w-2xl p-8 text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
          <Check aria-hidden className="size-8" />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">
          {t('onb.doneTitle')}
        </h1>
        <p className="mt-2 text-muted-foreground">{t('onb.doneDesc', { name: info.name })}</p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">{t('onb.goDashboard')}</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      <Stepper
        steps={steps}
        current={step}
        progressLabel={t('steps.progress', { current: step + 1, total: steps.length })}
      />
      <Card className="space-y-5 p-6">
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
          {steps[step]}
        </h1>

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">{t('onb.bizName')}</Label>
              <Input
                id="b-name"
                value={info.name}
                aria-invalid={!!errors.name}
                onChange={(e) => setInfo({ ...info, name: e.target.value })}
              />
              {errors.name && (
                <p role="alert" className="text-sm text-destructive">
                  {err('name')}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-cat">{t('onb.category')}</Label>
              <Select
                value={info.category}
                onValueChange={(v) => setInfo({ ...info, category: v })}
              >
                <SelectTrigger id="b-cat" aria-invalid={!!errors.category}>
                  <SelectValue placeholder={t('onb.categoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`onb.categories.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p role="alert" className="text-sm text-destructive">
                  {err('category')}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-phone">{t('form.phone')}</Label>
              <Input
                id="b-phone"
                type="tel"
                dir="ltr"
                className="text-start"
                placeholder={t('form.phonePlaceholder')}
                value={info.phone}
                aria-invalid={!!errors.phone}
                onChange={(e) => setInfo({ ...info, phone: e.target.value })}
              />
              {errors.phone && (
                <p role="alert" className="text-sm text-destructive">
                  {err('phone')}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('onb.servicesHint')}</p>
            {business.services.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox
                  id={`s-${s.id}`}
                  checked={services.includes(s.id)}
                  onCheckedChange={() => toggle(services, setServices, s.id)}
                />
                <Label htmlFor={`s-${s.id}`} className="flex-1 cursor-pointer">
                  {t(`mock.services.${s.id}`)}
                </Label>
                <span className="text-sm text-muted-foreground">
                  {t('onb.minutes', { count: s.minutes })}
                </span>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DAYS.map((d) => (
                <li
                  key={d}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <Label htmlFor={`d-${d}`}>{t(`onb.days.${d}`)}</Label>
                  <Switch
                    id={`d-${d}`}
                    checked={days.includes(d)}
                    onCheckedChange={() => toggle(days, setDays, d)}
                  />
                </li>
              ))}
            </ul>
            {hoursError && (
              <p role="alert" className="text-sm text-destructive">
                {t(`form.errors.${hoursError}`)}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="h-open">{t('onb.opens')}</Label>
                <Input
                  id="h-open"
                  type="time"
                  dir="ltr"
                  className="text-start"
                  value={hours.open}
                  onChange={(e) => setHours({ ...hours, open: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-close">{t('onb.closes')}</Label>
                <Input
                  id="h-close"
                  type="time"
                  dir="ltr"
                  className="text-start"
                  value={hours.close}
                  onChange={(e) => setHours({ ...hours, close: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('onb.teamHint')}</p>
            <div className="flex gap-2">
              <Input
                aria-label={t('onb.memberName')}
                placeholder={t('onb.memberName')}
                value={member}
                onChange={(e) => setMember(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addMember();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t('onb.addMember')}
                onClick={addMember}
              >
                <Plus aria-hidden className="size-4" />
              </Button>
            </div>
            {team.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t('onb.teamEmpty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {team.map((m) => (
                  <li
                    key={m}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    {m}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('onb.removeMember', { name: m })}
                      onClick={() => setTeam(team.filter((x) => x !== m))}
                    >
                      <X aria-hidden className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {saveError && (
          <p
            role="alert"
            className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
          >
            {saveError}
          </p>
        )}
        <div className="flex justify-between gap-3 pt-2">
          <Button
            variant="outline"
            disabled={step === 0 || saving}
            onClick={() => setStep(step - 1)}
          >
            {t('common.back')}
          </Button>
          {step < 3 ? (
            <Button onClick={next}>{t('common.next')}</Button>
          ) : (
            <Button onClick={finish} disabled={saving}>
              {saving && <Spinner />}
              {t('onb.finish')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
