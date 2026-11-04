'use client';

import {
  staffInputSchema,
  timeOffInputSchema,
  workingHoursSchema,
  type WorkingHoursRow,
} from '@mawid/shared';
import { CalendarOff, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/mawid/confirm-dialog';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { Field } from '@/components/mawid/form-field';
import { Spinner } from '@/components/mawid/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { Locale } from '@/i18n/routing';
import { intlLocale, weekStartsOn } from '@/lib/calendar';
import { errorMessage, fieldErrors } from '@/lib/errors';
import {
  useCreateStaff,
  useCreateTimeOff,
  useDeleteStaff,
  useDeleteTimeOff,
  useServices,
  useSetWorkingHours,
  useStaff,
  useTimeOff,
  useUpdateStaff,
  useUploadStaffPhoto,
  useWorkingHours,
} from '@/lib/queries';
import type { StaffDto, TimeOffDto } from '@/lib/types';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
interface DayRow {
  on: boolean;
  start: string;
  end: string;
  breakOn: boolean;
  breakStart: string;
  breakEnd: string;
}
const defaultDay = (on: boolean): DayRow => ({
  on,
  start: '09:00',
  end: '18:00',
  breakOn: false,
  breakStart: '13:00',
  breakEnd: '14:00',
});
const defaultWeek = (): DayRow[] => DAY_KEYS.map((_, i) => defaultDay(i !== 5));

const initials = (n: string) =>
  n
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

function weekToRows(week: DayRow[]): WorkingHoursRow[] {
  return week.flatMap((d, weekday) =>
    d.on
      ? [
          {
            weekday,
            startTime: d.start,
            endTime: d.end,
            breakStart: d.breakOn ? d.breakStart : null,
            breakEnd: d.breakOn ? d.breakEnd : null,
          },
        ]
      : [],
  );
}

function StaffDialog({
  staff,
  open,
  onOpenChange,
}: {
  staff?: StaffDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const services = useServices();
  const hours = useWorkingHours(staff?.id);
  const create = useCreateStaff();
  const update = useUpdateStaff();
  const setHours = useSetWorkingHours();
  const photo = useUploadStaffPhoto();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [week, setWeek] = useState<DayRow[]>(defaultWeek());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hourErrors, setHourErrors] = useState<Record<number, string>>({});
  const [apiError, setApiError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setHourErrors({});
    setApiError(undefined);
    setName(staff?.displayName ?? '');
    setActive(staff?.active ?? true);
    setServiceIds(staff?.serviceIds ?? []);
    if (!staff) setWeek(defaultWeek());
  }, [open, staff]);

  // Load the saved schedule of an existing employee.
  useEffect(() => {
    if (!staff || !hours.data) return;
    const w = DAY_KEYS.map((): DayRow => ({ ...defaultDay(false) }));
    for (const r of hours.data) {
      if (w[r.weekday].on) continue; // the editor handles one range per day
      w[r.weekday] = {
        on: true,
        start: r.startTime,
        end: r.endTime,
        breakOn: !!r.breakStart,
        breakStart: r.breakStart ?? '13:00',
        breakEnd: r.breakEnd ?? '14:00',
      };
    }
    setWeek(w);
  }, [staff, hours.data]);

  const order = Array.from({ length: 7 }, (_, i) => (weekStartsOn(locale) + i) % 7);
  const patchDay = (i: number, p: Partial<DayRow>) =>
    setWeek((w) => w.map((d, k) => (k === i ? { ...d, ...p } : d)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setApiError(undefined);
    const parsed = staffInputSchema.safeParse({ displayName: name, active, serviceIds });
    const rows = weekToRows(week);
    const hoursParsed = workingHoursSchema.safeParse(rows);
    setErrors(
      parsed.success
        ? {}
        : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    );
    const he: Record<number, string> = {};
    if (!hoursParsed.success) {
      for (const i of hoursParsed.error.issues) {
        const weekday = typeof i.path[0] === 'number' ? rows[i.path[0]].weekday : -1;
        he[weekday] = i.message;
      }
    }
    setHourErrors(he);
    if (!parsed.success || !hoursParsed.success) return;
    setSaving(true);
    try {
      const saved = staff
        ? await update.mutateAsync({ id: staff.id, data: parsed.data })
        : await create.mutateAsync(parsed.data);
      await setHours.mutateAsync({ id: saved.id, rows });
      toast.success(t('common.saved'));
      onOpenChange(false);
    } catch (e2) {
      setApiError(errorMessage(t, e2));
      setErrors(fieldErrors(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(staff ? 'staffPage.edit' : 'staffPage.add')}</DialogTitle>
          <DialogDescription>{t('staffPage.dialogDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-5">
          {staff && (
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                {staff.photoUrl && <AvatarImage src={staff.photoUrl} alt="" />}
                <AvatarFallback className="bg-secondary font-semibold text-primary">
                  {initials(staff.displayName)}
                </AvatarFallback>
              </Avatar>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label={t('staffPage.photoUpload')}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    photo.mutate(
                      { id: staff.id, file: f },
                      {
                        onSuccess: () => toast.success(t('common.saved')),
                        onError: (x) => toast.error(errorMessage(t, x)),
                      },
                    );
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={photo.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {photo.isPending ? <Spinner /> : <Upload aria-hidden className="size-4" />}
                {t('staffPage.photoUpload')}
              </Button>
            </div>
          )}
          <Field
            id="st-name"
            label={t('form.name')}
            error={errors.displayName ? t(`form.errors.${errors.displayName}`) : undefined}
          >
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.displayName}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Switch id="st-active" checked={active} onCheckedChange={setActive} />
            <label htmlFor="st-active" className="text-sm font-medium">
              {t('staffPage.active')}
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('staffPage.services')}</legend>
            {services.data?.items.length ? (
              services.data.items.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`st-s-${s.id}`}
                    checked={serviceIds.includes(s.id)}
                    onCheckedChange={(c) =>
                      setServiceIds((x) =>
                        c === true ? [...x, s.id] : x.filter((i) => i !== s.id),
                      )
                    }
                  />
                  <label htmlFor={`st-s-${s.id}`} className="text-sm">
                    {s.name}
                  </label>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('staffPage.noServices')}</p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('staffPage.hours')}</legend>
            {staff && hours.isPending ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : (
              order.map((d) => {
                const row = week[d];
                return (
                  <div key={d} className="rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        id={`h-on-${d}`}
                        checked={row.on}
                        onCheckedChange={(c) => patchDay(d, { on: c })}
                      />
                      <label htmlFor={`h-on-${d}`} className="w-24 text-sm font-medium">
                        {t(`onb.days.${DAY_KEYS[d]}`)}
                      </label>
                      {row.on ? (
                        <div className="flex flex-1 items-center gap-2" dir="ltr">
                          <Input
                            type="time"
                            aria-label={t('onb.opens')}
                            className="h-9"
                            value={row.start}
                            onChange={(e) => patchDay(d, { start: e.target.value })}
                          />
                          <span aria-hidden>–</span>
                          <Input
                            type="time"
                            aria-label={t('onb.closes')}
                            className="h-9"
                            value={row.end}
                            onChange={(e) => patchDay(d, { end: e.target.value })}
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t('staffPage.closed')}
                        </span>
                      )}
                    </div>
                    {row.on && (
                      <div className="mt-2 flex items-center gap-3 ps-12">
                        <Checkbox
                          id={`h-b-${d}`}
                          checked={row.breakOn}
                          onCheckedChange={(c) => patchDay(d, { breakOn: c === true })}
                        />
                        <label htmlFor={`h-b-${d}`} className="text-sm">
                          {t('staffPage.break')}
                        </label>
                        {row.breakOn && (
                          <div className="flex items-center gap-2" dir="ltr">
                            <Input
                              type="time"
                              aria-label={t('staffPage.breakStart')}
                              className="h-9"
                              value={row.breakStart}
                              onChange={(e) => patchDay(d, { breakStart: e.target.value })}
                            />
                            <span aria-hidden>–</span>
                            <Input
                              type="time"
                              aria-label={t('staffPage.breakEnd')}
                              className="h-9"
                              value={row.breakEnd}
                              onChange={(e) => patchDay(d, { breakEnd: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {hourErrors[d] && (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        {t(`form.errors.${hourErrors[d]}`)}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </fieldset>

          {apiError && (
            <p
              role="alert"
              className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {apiError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TimeOffDialog({
  staff,
  open,
  onOpenChange,
}: {
  staff: StaffDto[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations();
  const create = useCreateTimeOff();
  const [who, setWho] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string>();

  useEffect(() => {
    if (open) {
      setWho('all');
      setFrom('');
      setTo('');
      setReason('');
      setErrors({});
      setApiError(undefined);
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Dates are whole days in the business time zone (UTC for Nouakchott). The end day is included.
    const end = to ? new Date(`${to}T00:00:00Z`) : null;
    end?.setUTCDate(end.getUTCDate() + 1);
    const parsed = timeOffInputSchema.safeParse({
      staffId: who === 'all' ? null : who,
      startsAt: from ? `${from}T00:00:00.000Z` : '',
      endsAt: end ? end.toISOString() : '',
      reason,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [
            String(i.path[0]),
            i.path[0] === 'endsAt' && i.message !== 'endBeforeStart'
              ? 'required'
              : i.path[0] === 'startsAt'
                ? 'required'
                : i.message,
          ]),
        ),
      );
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(t('common.saved'));
        onOpenChange(false);
      },
      onError: (e2) => {
        setApiError(errorMessage(t, e2));
        setErrors(fieldErrors(e2));
      },
    });
  }
  const err = (k: string) => (errors[k] ? t(`form.errors.${errors[k]}`) : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('timeOff.add')}</DialogTitle>
          <DialogDescription>{t('timeOff.dialogDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field id="to-who" label={t('timeOff.who')}>
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger id="to-who">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('timeOff.everyone')}</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="to-from" label={t('timeOff.from')} error={err('startsAt')}>
              <Input
                id="to-from"
                type="date"
                dir="ltr"
                className="text-start"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field id="to-to" label={t('timeOff.to')} error={err('endsAt')}>
              <Input
                id="to-to"
                type="date"
                dir="ltr"
                className="text-start"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
          <Field id="to-reason" label={t('timeOff.reason')} error={err('reason')}>
            <Input id="to-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {apiError && (
            <p
              role="alert"
              className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {apiError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StaffManager() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const staff = useStaff();
  const timeOff = useTimeOff();
  const removeStaff = useDeleteStaff();
  const removeOff = useDeleteTimeOff();
  const [editing, setEditing] = useState<StaffDto | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [offOpen, setOffOpen] = useState(false);
  const [deleting, setDeleting] = useState<StaffDto | undefined>();
  const [deleteError, setDeleteError] = useState<string>();

  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeZone: 'UTC' });
  const range = (o: TimeOffDto) => {
    const start = new Date(o.startsAt);
    const last = new Date(new Date(o.endsAt).getTime() - 1);
    return fmt.format(start) === fmt.format(last)
      ? fmt.format(start)
      : `${fmt.format(start)} – ${fmt.format(last)}`;
  };
  const names = new Map((staff.data?.items ?? []).map((s) => [s.id, s.displayName]));

  let body;
  if (staff.isPending) {
    body = (
      <div aria-busy="true" className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  } else if (staff.isError) {
    body = (
      <ErrorState
        title={t('common.errorTitle')}
        description={t('common.errorDesc')}
        action={
          <Button variant="outline" onClick={() => staff.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  } else if (staff.data.items.length === 0) {
    body = (
      <Card>
        <EmptyState title={t('staffPage.emptyTitle')} description={t('staffPage.emptyDesc')} />
      </Card>
    );
  } else {
    body = (
      <ul className="space-y-3">
        {staff.data.items.map((s) => (
          <li key={s.id}>
            <Card className="flex items-center gap-3 p-4">
              <Avatar className="size-12">
                {s.photoUrl && <AvatarImage src={s.photoUrl} alt="" />}
                <AvatarFallback className="bg-secondary font-semibold text-primary">
                  {initials(s.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {s.displayName}
                  {!s.active && <Badge variant="secondary">{t('services.inactive')}</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('staffPage.servicesCount', { count: s.serviceIds.length })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('services.editAria', { name: s.displayName })}
                onClick={() => {
                  setEditing(s);
                  setFormOpen(true);
                }}
              >
                <Pencil aria-hidden className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('services.deleteAria', { name: s.displayName })}
                onClick={() => {
                  setDeleteError(undefined);
                  setDeleting(s);
                }}
              >
                <Trash2 aria-hidden className="size-4 text-destructive" />
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="max-w-3xl space-y-10">
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t('staffPage.title')}</h1>
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden className="size-4" />
            {t('staffPage.add')}
          </Button>
        </div>
        {body}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t('timeOff.title')}</h2>
          <Button variant="outline" onClick={() => setOffOpen(true)}>
            <CalendarOff aria-hidden className="size-4" />
            {t('timeOff.add')}
          </Button>
        </div>
        {timeOff.isPending ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : timeOff.isError ? (
          <ErrorState
            title={t('common.errorTitle')}
            description={t('common.errorDesc')}
            action={
              <Button variant="outline" onClick={() => timeOff.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : timeOff.data.items.length === 0 ? (
          <Card>
            <EmptyState title={t('timeOff.emptyTitle')} description={t('timeOff.emptyDesc')} />
          </Card>
        ) : (
          <ul className="space-y-2">
            {timeOff.data.items.map((o) => (
              <li key={o.id}>
                <Card className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{range(o)}</p>
                    <p className="text-sm text-muted-foreground">
                      {o.staffId ? (names.get(o.staffId) ?? '') : t('timeOff.everyone')}
                      {o.reason ? ` · ${o.reason}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('timeOff.deleteAria', { range: range(o) })}
                    disabled={removeOff.isPending}
                    onClick={() =>
                      removeOff.mutate(o.id, {
                        onSuccess: () => toast.success(t('common.deleted')),
                        onError: (e) => toast.error(errorMessage(t, e)),
                      })
                    }
                  >
                    <Trash2 aria-hidden className="size-4 text-destructive" />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <StaffDialog staff={editing} open={formOpen} onOpenChange={setFormOpen} />
      <TimeOffDialog staff={staff.data?.items ?? []} open={offOpen} onOpenChange={setOffOpen} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={t('staffPage.deleteTitle')}
        description={t('staffPage.deleteDesc', { name: deleting?.displayName ?? '' })}
        error={deleteError}
        busy={removeStaff.isPending}
        onConfirm={() =>
          deleting &&
          removeStaff.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('common.deleted'));
              setDeleting(undefined);
            },
            onError: (e) => setDeleteError(errorMessage(t, e)),
          })
        }
      />
    </div>
  );
}
