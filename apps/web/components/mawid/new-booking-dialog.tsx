'use client';

import { manualBookingSchema } from '@mawid/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/errors';
import { useCreateManualBooking, useServices, useStaff } from '@/lib/queries';
import { hhmmToMinutes, zonedToUtcISO } from '@/lib/tz';

const EMPTY = {
  serviceId: '',
  staffId: '',
  date: '',
  time: '09:00',
  name: '',
  phone: '',
  email: '',
  notes: '',
};

/** The owner books for a customer who phoned or walked in. */
export function NewBookingDialog({
  open,
  onOpenChange,
  tz,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tz: string;
  defaultDate: string;
}) {
  const t = useTranslations();
  const services = useServices();
  const staff = useStaff();
  const create = useCreateManualBooking();
  const [v, setV] = useState({ ...EMPTY, date: defaultDate });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string>();

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const team = (staff.data?.items ?? []).filter(
    (m) => m.active && (!v.serviceId || m.serviceIds.includes(v.serviceId)),
  );
  const err = (k: string) => (errors[k] ? t(`form.errors.${errors[k]}`) : undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(undefined);
    const parsed = manualBookingSchema.safeParse({
      serviceId: v.serviceId,
      staffId: v.staffId,
      startsAt: v.date && v.time ? zonedToUtcISO(v.date, hhmmToMinutes(v.time), tz) : '',
      customer: { name: v.name, phone: v.phone, email: v.email },
      notes: v.notes,
      status: 'CONFIRMED',
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [
            i.path[0] === 'customer' ? String(i.path[1]) : String(i.path[0]),
            i.path[0] === 'serviceId' || i.path[0] === 'staffId' || i.path[0] === 'startsAt'
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
        toast.success(t('cal.created'));
        setV({ ...EMPTY, date: defaultDate });
        onOpenChange(false);
      },
      onError: (e2) => setApiError(errorMessage(t, e2)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('cal.newTitle')}</DialogTitle>
          <DialogDescription>{t('cal.newDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nb-service">{t('steps.service')}</Label>
            <Select
              value={v.serviceId}
              onValueChange={(id) => setV((x) => ({ ...x, serviceId: id, staffId: '' }))}
            >
              <SelectTrigger id="nb-service">
                <SelectValue placeholder={t('cal.choose')} />
              </SelectTrigger>
              <SelectContent>
                {(services.data?.items ?? [])
                  .filter((s) => s.active)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {err('serviceId') && <p className="text-sm text-destructive">{err('serviceId')}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nb-staff">{t('book.with')}</Label>
            <Select value={v.staffId} onValueChange={(id) => setV((x) => ({ ...x, staffId: id }))}>
              <SelectTrigger id="nb-staff">
                <SelectValue placeholder={t('cal.choose')} />
              </SelectTrigger>
              <SelectContent>
                {team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err('staffId') && <p className="text-sm text-destructive">{err('staffId')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nb-date">{t('booking.dateLabel')}</Label>
              <Input id="nb-date" type="date" dir="ltr" value={v.date} onChange={set('date')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nb-time">{t('cal.time')}</Label>
              <Input id="nb-time" type="time" dir="ltr" value={v.time} onChange={set('time')} />
            </div>
          </div>
          {err('startsAt') && <p className="text-sm text-destructive">{err('startsAt')}</p>}
          {(['name', 'phone', 'email'] as const).map((f) => (
            <div key={f} className="space-y-1.5">
              <Label htmlFor={`nb-${f}`}>
                {f === 'email' ? t('form.emailOptional') : t(`form.${f}`)}
              </Label>
              <Input
                id={`nb-${f}`}
                value={v[f]}
                dir={f === 'name' ? undefined : 'ltr'}
                inputMode={f === 'phone' ? 'tel' : f === 'email' ? 'email' : 'text'}
                onChange={set(f)}
                aria-invalid={!!errors[f]}
              />
              {err(f) && (
                <p role="alert" className="text-sm text-destructive">
                  {err(f)}
                </p>
              )}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="nb-notes">{t('cal.notes')}</Label>
            <Textarea id="nb-notes" rows={2} value={v.notes} onChange={set('notes')} />
          </div>
          {apiError && (
            <p
              role="alert"
              className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {apiError}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner />}
              {t('cal.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
