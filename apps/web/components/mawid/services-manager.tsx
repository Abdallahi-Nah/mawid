'use client';

import { serviceInputSchema } from '@mawid/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/mawid/confirm-dialog';
import { EmptyState } from '@/components/mawid/empty-state';
import { ErrorState } from '@/components/mawid/error-state';
import { Field } from '@/components/mawid/form-field';
import { Spinner } from '@/components/mawid/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/i18n/routing';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import { useCreateService, useDeleteService, useServices, useUpdateService } from '@/lib/queries';
import type { ServiceDto } from '@/lib/types';

const empty = {
  name: '',
  description: '',
  durationMin: '30',
  price: '',
  category: '',
  bufferMin: '0',
  active: true,
};

function ServiceDialog({
  service,
  open,
  onOpenChange,
}: {
  service?: ServiceDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations();
  const create = useCreateService();
  const update = useUpdateService();
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string>();
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setApiError(undefined);
    setV(
      service
        ? {
            name: service.name,
            description: service.description ?? '',
            durationMin: String(service.durationMin),
            price: String(service.price),
            category: service.category ?? '',
            bufferMin: String(service.bufferMin),
            active: service.active,
          }
        : empty,
    );
  }, [open, service]);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => (errors[k] ? t(`form.errors.${errors[k]}`) : undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = serviceInputSchema.safeParse({
      ...v,
      durationMin: Number(v.durationMin),
      price: v.price === '' ? NaN : Number(v.price),
      bufferMin: Number(v.bufferMin),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    const opts = {
      onSuccess: () => {
        toast.success(t('common.saved'));
        onOpenChange(false);
      },
      onError: (e2: unknown) => {
        setApiError(errorMessage(t, e2));
        setErrors(fieldErrors(e2));
      },
    };
    if (service) update.mutate({ id: service.id, data: parsed.data }, opts);
    else create.mutate(parsed.data, opts);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(service ? 'services.edit' : 'services.add')}</DialogTitle>
          <DialogDescription>{t('services.dialogDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field id="sv-name" label={t('form.name')} error={err('name')}>
            <Input
              id="sv-name"
              value={v.name}
              onChange={set('name')}
              aria-invalid={!!errors.name}
            />
          </Field>
          <Field id="sv-desc" label={t('settings.description')} error={err('description')}>
            <Textarea id="sv-desc" rows={2} value={v.description} onChange={set('description')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="sv-dur" label={t('services.duration')} error={err('durationMin')}>
              <Input
                id="sv-dur"
                type="number"
                min={5}
                step={5}
                dir="ltr"
                className="text-start"
                value={v.durationMin}
                onChange={set('durationMin')}
              />
            </Field>
            <Field id="sv-price" label={t('services.price')} error={err('price')}>
              <Input
                id="sv-price"
                type="number"
                min={0}
                dir="ltr"
                className="text-start"
                value={v.price}
                onChange={set('price')}
              />
            </Field>
            <Field id="sv-cat" label={t('services.category')} error={err('category')}>
              <Input id="sv-cat" value={v.category} onChange={set('category')} />
            </Field>
            <Field id="sv-buf" label={t('services.buffer')} error={err('bufferMin')}>
              <Input
                id="sv-buf"
                type="number"
                min={0}
                max={120}
                dir="ltr"
                className="text-start"
                value={v.bufferMin}
                onChange={set('bufferMin')}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="sv-active"
              checked={v.active}
              onCheckedChange={(c) => setV((x) => ({ ...x, active: c }))}
            />
            <label htmlFor="sv-active" className="text-sm font-medium">
              {t('services.active')}
            </label>
          </div>
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
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServicesManager() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const list = useServices();
  const remove = useDeleteService();
  const [editing, setEditing] = useState<ServiceDto | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<ServiceDto | undefined>();
  const [deleteError, setDeleteError] = useState<string>();

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{t('services.title')}</h1>
      <Button
        onClick={() => {
          setEditing(undefined);
          setFormOpen(true);
        }}
      >
        <Plus aria-hidden className="size-4" />
        {t('services.add')}
      </Button>
    </div>
  );

  let body;
  if (list.isPending) {
    body = (
      <div aria-busy="true" className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  } else if (list.isError) {
    body = (
      <ErrorState
        title={t('common.errorTitle')}
        description={t('common.errorDesc')}
        action={
          <Button variant="outline" onClick={() => list.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  } else if (list.data.items.length === 0) {
    body = (
      <Card>
        <EmptyState title={t('services.emptyTitle')} description={t('services.emptyDesc')} />
      </Card>
    );
  } else {
    body = (
      <ul className="space-y-3">
        {list.data.items.map((s) => (
          <li key={s.id}>
            <Card className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {s.name}
                  {!s.active && <Badge variant="secondary">{t('services.inactive')}</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('service.duration', { minutes: s.durationMin })} ·{' '}
                  {formatPrice(s.price, locale)}
                  {s.category ? ` · ${s.category}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('services.editAria', { name: s.name })}
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
                aria-label={t('services.deleteAria', { name: s.name })}
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
    <div className="max-w-3xl space-y-6">
      {header}
      {body}
      <ServiceDialog service={editing} open={formOpen} onOpenChange={setFormOpen} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={t('services.deleteTitle')}
        description={t('services.deleteDesc', { name: deleting?.name ?? '' })}
        error={deleteError}
        busy={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
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
