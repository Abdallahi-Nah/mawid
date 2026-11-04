'use client';

import { CalendarCheck, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ChatBubble } from '@/components/mawid/chat-bubble';
import { DataTable, type Column } from '@/components/mawid/data-table';
import { DatePicker } from '@/components/mawid/date-picker';
import { EmptyState } from '@/components/mawid/empty-state';
import { LanguageSwitcher } from '@/components/mawid/language-switcher';
import { ReviewCard } from '@/components/mawid/review-card';
import { ServiceCard } from '@/components/mawid/service-card';
import { SlotPicker, type Slot } from '@/components/mawid/slot-picker';
import { Spinner } from '@/components/mawid/spinner';
import { StaffCard } from '@/components/mawid/staff-card';
import { StatCard } from '@/components/mawid/stat-card';
import { StatusBadge, type BookingStatus } from '@/components/mawid/status-badge';
import { Stepper } from '@/components/mawid/stepper';
import { ThemeToggle } from '@/components/mawid/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

const SLOTS: Slot[] = [
  { time: '09:00' }, { time: '09:30', disabled: true }, { time: '10:00' }, { time: '10:30' },
  { time: '11:00', disabled: true }, { time: '11:30' }, { time: '14:00' }, { time: '14:30' },
];

interface Row { id: string; client: string; service: string; time: string; status: BookingStatus }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Frame({ label, dark, dir, children }: { label: string; dark?: boolean; dir: 'ltr' | 'rtl'; children: ReactNode }) {
  return (
    <div className={cn(dark && 'dark')} dir={dir}>
      <div className="space-y-3 rounded-xl border bg-background p-4 text-foreground">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  );
}

export function DesignClient() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [slot, setSlot] = useState<string | undefined>('10:00');
  const [date, setDate] = useState<Date | undefined>();
  const [staff, setStaff] = useState<'one' | 'two' | 'any'>('one');
  const [step, setStep] = useState(1);
  const [service, setService] = useState<string | undefined>('cut');

  const steps = ['service', 'staff', 'datetime', 'details'].map((k) => t(`steps.${k}`));
  const statuses: BookingStatus[] = ['pending', 'confirmed', 'completed', 'cancelled', 'noShow'];

  const rows: Row[] = [
    { id: '1', client: t('mock.clients.one'), service: t('mock.services.cut'), time: '09:00', status: 'confirmed' },
    { id: '2', client: t('mock.clients.two'), service: t('mock.services.beard'), time: '10:30', status: 'pending' },
    { id: '3', client: t('mock.clients.three'), service: t('mock.services.cut'), time: '14:00', status: 'completed' },
  ];
  const columns: Column<Row>[] = [
    { key: 'client', header: t('table.client'), cell: (r) => <span className="font-medium">{r.client}</span> },
    { key: 'service', header: t('table.service'), cell: (r) => r.service },
    { key: 'time', header: t('table.time'), cell: (r) => <span dir="ltr">{r.time}</span> },
    { key: 'status', header: t('table.status'), cell: (r) => <StatusBadge status={r.status} label={t(`status.${r.status}`)} /> },
  ];
  const emptyState = (
    <EmptyState
      title={t('empty.title')}
      description={t('empty.description')}
      action={<Button variant="outline">{t('empty.action')}</Button>}
    />
  );
  const initials = (name: string) => name.split(' ').slice(0, 2).map((w) => w[0]).join('');

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-6 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link href="/" className="text-sm font-medium text-primary">{t('common.appName')}</Link>
          <h1 className="text-3xl font-bold tracking-tight">{t('design.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('design.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <Section title={t('design.sections.buttons')}>
        <Card className="space-y-6 p-5 shadow-soft">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <State label={t('design.states.default')}>
              <div className="flex flex-wrap gap-2">
                <Button>{t('design.buttons.primary')}</Button>
                <Button variant="secondary">{t('design.buttons.secondary')}</Button>
                <Button variant="outline">{t('design.buttons.outline')}</Button>
                <Button variant="ghost">{t('design.buttons.ghost')}</Button>
                <Button variant="destructive">{t('design.buttons.destructive')}</Button>
              </div>
            </State>
            <State label={t('design.states.hover')}>
              <Button className="bg-primary/90 shadow-lifted">{t('design.buttons.primary')}</Button>
            </State>
            <State label={t('design.states.focus')}>
              <Button className="ring-2 ring-ring ring-offset-2 ring-offset-background">{t('design.buttons.primary')}</Button>
            </State>
            <State label={t('design.states.disabled')}>
              <div className="flex flex-wrap gap-2">
                <Button disabled>{t('design.buttons.primary')}</Button>
                <Button variant="outline" disabled>{t('design.buttons.outline')}</Button>
              </div>
            </State>
            <State label={t('design.states.loading')}>
              <Button disabled><Spinner />{t('common.loading')}</Button>
            </State>
          </div>
        </Card>
      </Section>

      <Section title={t('design.sections.forms')}>
        <Card className="grid gap-6 p-5 shadow-soft md:grid-cols-2">
          <State label={t('design.states.default')}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="f-name">{t('form.name')}</Label>
                <Input id="f-name" placeholder={t('form.namePlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-service">{t('form.service')}</Label>
                <Select>
                  <SelectTrigger id="f-service"><SelectValue placeholder={t('form.servicePlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cut">{t('mock.services.cut')}</SelectItem>
                    <SelectItem value="beard">{t('mock.services.beard')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-msg">{t('form.message')}</Label>
                <Textarea id="f-msg" rows={3} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="f-terms" />
                <Label htmlFor="f-terms">{t('form.terms')}</Label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="f-notif">{t('form.notifications')}</Label>
                <Switch id="f-notif" defaultChecked />
              </div>
            </div>
          </State>
          <div className="space-y-4">
            <State label={t('design.states.focus')}>
              <Input aria-label={t('form.name')} className="ring-2 ring-ring ring-offset-2 ring-offset-background" defaultValue={t('mock.clients.one')} />
            </State>
            <State label={t('design.states.error')}>
              <div className="space-y-1.5">
                <Input aria-label={t('form.email')} aria-invalid defaultValue="omar@" className="border-destructive focus-visible:ring-destructive" />
                <p role="alert" className="text-sm text-destructive">{t('form.emailError')}</p>
              </div>
            </State>
            <State label={t('design.states.disabled')}>
              <Input aria-label={t('form.disabledField')} disabled placeholder={t('form.disabledField')} />
            </State>
            <State label={t('design.states.loading')}>
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </State>
          </div>
        </Card>
      </Section>

      <Section title={t('design.sections.display')}>
        <Card className="space-y-6 p-5 shadow-soft">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>{t('design.buttons.primary')}</Badge>
            <Badge variant="secondary">{t('design.buttons.secondary')}</Badge>
            <Badge variant="outline">{t('design.buttons.outline')}</Badge>
            <Avatar><AvatarFallback className="bg-secondary font-semibold text-primary">{initials(t('mock.staff.one'))}</AvatarFallback></Avatar>
          </div>
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => <StatusBadge key={s} status={s} label={t(`status.${s}`)} />)}
          </div>
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">{t('design.sections.booking')}</TabsTrigger>
              <TabsTrigger value="b">{t('design.sections.data')}</TabsTrigger>
            </TabsList>
            <TabsContent value="a" className="text-sm text-muted-foreground">{t('booking.slotsHint')}</TabsContent>
            <TabsContent value="b" className="text-sm text-muted-foreground">{t('empty.description')}</TabsContent>
          </Tabs>
        </Card>
      </Section>

      <Section title={t('design.sections.feedback')}>
        <Card className="flex flex-wrap gap-3 p-5 shadow-soft">
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">{t('design.dialog.open')}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('design.dialog.title')}</DialogTitle>
                <DialogDescription>{t('design.dialog.description')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline">{t('common.cancel')}</Button>
                <Button>{t('common.confirm')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild><Button variant="outline">{t('design.sheet.open')}</Button></SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{t('design.dialog.title')}</SheetTitle>
                <SheetDescription>{t('design.dialog.description')}</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
          <Button variant="outline" onClick={() => toast.success(t('design.toast.saved'))}>{t('design.toast.show')}</Button>
        </Card>
        <Card className="shadow-soft">{emptyState}</Card>
      </Section>

      <Section title={t('design.sections.booking')}>
        <div className="space-y-6">
          <Card className="space-y-4 p-5 shadow-soft">
            <Stepper steps={steps} current={step} progressLabel={t('steps.progress', { current: step + 1, total: steps.length })} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t('common.back')}</Button>
              <Button size="sm" disabled={step === steps.length - 1} onClick={() => setStep((s) => s + 1)}>{t('common.next')}</Button>
            </div>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            <ServiceCard
              name={t('mock.services.cut')} description={t('mock.services.cutDesc')}
              duration={t('service.duration', { minutes: 45 })} price={formatPrice(300, locale)}
              bookLabel={service === 'cut' ? t('service.selected') : t('service.book')}
              selected={service === 'cut'} onBook={() => setService('cut')}
            />
            <ServiceCard
              name={t('mock.services.beard')} description={t('mock.services.beardDesc')}
              duration={t('service.duration', { minutes: 20 })} price={formatPrice(150, locale)}
              bookLabel={service === 'beard' ? t('service.selected') : t('service.book')}
              selected={service === 'beard'} onBook={() => setService('beard')}
            />
          </div>
          <div role="radiogroup" aria-label={t('steps.staff')} className="grid gap-3 md:grid-cols-2">
            <StaffCard name={t('mock.staff.one')} role={t('mock.staff.roleSenior')} initials={initials(t('mock.staff.one'))}
              rating="4.9" ratingLabel={t('staff.rating', { rating: '4.9' })} selected={staff === 'one'} onSelect={() => setStaff('one')} />
            <StaffCard name={t('mock.staff.two')} role={t('mock.staff.roleStylist')} initials={initials(t('mock.staff.two'))}
              rating="4.8" ratingLabel={t('staff.rating', { rating: '4.8' })} selected={staff === 'two'} onSelect={() => setStaff('two')} />
          </div>
          <Card className="grid gap-5 p-5 shadow-soft md:grid-cols-[18rem_1fr]">
            <div className="space-y-1.5">
              <Label>{t('booking.dateLabel')}</Label>
              <DatePicker value={date} onChange={setDate} placeholder={t('booking.datePlaceholder')} label={t('booking.dateLabel')} />
            </div>
            <div className="space-y-2">
              <Label>{t('booking.slotsLabel')}</Label>
              <SlotPicker slots={SLOTS} value={slot} onChange={setSlot} label={t('booking.slotsLabel')} />
              <p className="text-xs text-muted-foreground">{t('booking.slotsHint')}</p>
            </div>
          </Card>
        </div>
      </Section>

      <Section title={t('design.sections.data')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label={t('stat.bookings')} value="128" icon={<CalendarCheck aria-hidden className="size-4" />} delta={12} deltaLabel={t('stat.vsLastWeek')} />
          <StatCard label={t('stat.revenue')} value={formatPrice(42500, locale)} icon={<Wallet aria-hidden className="size-4" />} delta={-3} deltaLabel={t('stat.vsLastWeek')} />
          <StatCard label={t('stat.bookings')} value="" loading />
        </div>
        <Card className="shadow-soft"><DataTable columns={columns} rows={rows} /></Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="shadow-soft"><DataTable columns={columns} rows={[]} loading /></Card>
          <Card className="shadow-soft"><DataTable columns={columns} rows={[]} empty={emptyState} /></Card>
          <Card className="shadow-soft"><DataTable columns={columns} rows={[]} error={t('table.error')} /></Card>
        </div>
        <ReviewCard name={t('mock.reviewer')} initials={initials(t('mock.reviewer'))} rating={5}
          ratingLabel={t('review.rating', { rating: 5 })} text={t('mock.review')} date={t('mock.reviewDate')} />
      </Section>

      <Section title={t('design.sections.chat')}>
        <Card className="flex flex-col gap-3 p-5 shadow-soft">
          <ChatBubble role="user">{t('mock.chat.user')}</ChatBubble>
          <ChatBubble role="assistant">{t('mock.chat.assistant')}</ChatBubble>
          <SlotPicker slots={SLOTS.slice(0, 4)} value={slot} onChange={setSlot} label={t('booking.slotsLabel')} className="max-w-sm" />
          <Button className="self-start">{t('chat.confirmSlot')}</Button>
          <ChatBubble role="assistant" typingLabel={t('chat.typing')} />
        </Card>
      </Section>

      <Section title={t('design.sections.matrix')}>
        <div className="grid gap-3 md:grid-cols-2">
          {([
            ['lightLtr', false, 'ltr'], ['lightRtl', false, 'rtl'],
            ['darkLtr', true, 'ltr'], ['darkRtl', true, 'rtl'],
          ] as const).map(([key, dark, dir]) => (
            <Frame key={key} label={t(`design.frames.${key}`)} dark={dark} dir={dir}>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">{t('design.buttons.primary')}</Button>
                <Button size="sm" variant="outline">{t('design.buttons.outline')}</Button>
                <StatusBadge status="confirmed" label={t('status.confirmed')} />
              </div>
              <Input aria-label={t('form.name')} placeholder={t('form.namePlaceholder')} />
              <SlotPicker slots={SLOTS.slice(0, 4)} value="10:00" onChange={() => undefined} label={t('booking.slotsLabel')} />
            </Frame>
          ))}
        </div>
      </Section>
    </div>
  );
}
