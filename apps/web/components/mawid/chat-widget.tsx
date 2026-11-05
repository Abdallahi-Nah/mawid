'use client';

import {
  bookingCustomerSchema,
  type AiDraft,
  type AiSlotsSuggestion,
  type PublicBookingView,
} from '@mawid/shared';
import { CalendarCheck, Clock, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChatBubble } from '@/components/mawid/chat-bubble';
import { ErrorState } from '@/components/mawid/error-state';
import { Spinner } from '@/components/mawid/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { api, ApiError } from '@/lib/api';
import { streamChat } from '@/lib/ai-stream';
import { errorMessage } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import { formatDateTz, timeTz } from '@/lib/tz';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  slots: AiSlotsSuggestion[];
  draft?: AiDraft;
  booked?: PublicBookingView;
}
const HISTORY = 12; // turns sent to the server (it keeps the last 10)

/** Server codes that mean "the assistant cannot help now": the normal booking form takes over (AC-06). */
const isUnavailable = (e: unknown): boolean =>
  e instanceof TypeError ||
  (e instanceof ApiError &&
    (e.code === 'AI_UNAVAILABLE' || e.code === 'AI_QUOTA_EXCEEDED' || e.status >= 500));

export function ChatWidget({
  slug,
  businessName,
  forceUnavailable,
}: {
  slug: string;
  businessName: string;
  forceUnavailable?: boolean;
}) {
  const t = useTranslations('chat');
  const tAll = useTranslations();
  const locale = useLocale() as Locale;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(!!forceUnavailable);
  const [problem, setProblem] = useState<string>();
  const [text, setText] = useState('');
  const idRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const lastText = useRef('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => endRef.current?.scrollIntoView?.({ block: 'end' }), [messages, typing]);

  const patch = (id: number, fn: (m: Msg) => Msg) =>
    setMessages((all) => all.map((m) => (m.id === id ? fn(m) : m)));

  async function send(value: string) {
    const content = value.trim();
    if (!content || busy) return;
    lastText.current = content;
    setProblem(undefined);
    const userMsg: Msg = { id: idRef.current++, role: 'user', text: content, slots: [] };
    const replyId = idRef.current++;
    const history = [...messages, userMsg]
      .filter((m) => m.text.trim())
      .slice(-HISTORY)
      .map((m) => ({ role: m.role, content: m.text }));
    setMessages((all) => [
      ...all,
      userMsg,
      { id: replyId, role: 'assistant', text: '', slots: [] },
    ]);
    setBusy(true);
    setTyping(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        { businessSlug: slug, messages: history, locale },
        (ev) => {
          setTyping(false);
          if (ev.type === 'text') patch(replyId, (m) => ({ ...m, text: m.text + ev.delta }));
          else if (ev.type === 'slots')
            patch(replyId, (m) => ({ ...m, slots: [...m.slots, ev.data] }));
          else if (ev.type === 'draft') patch(replyId, (m) => ({ ...m, draft: ev.data }));
          else if (ev.type === 'error') throw new ApiError(503, ev.code);
        },
        controller.signal,
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      if (isUnavailable(e)) setUnavailable(true);
      else setProblem(errorMessage(tAll, e));
    } finally {
      setTyping(false);
      setBusy(false);
      // Remove an empty reply (nothing was received).
      setMessages((all) => all.filter((m) => m.text || m.slots.length || m.draft || m.booked));
    }
  }

  /** The customer clicked a slot card: the server prepares a signed draft (no model call, nothing booked). */
  async function pickSlot(s: AiSlotsSuggestion, start: string) {
    if (busy) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const draft = await api<AiDraft>('/public/ai/chat/draft', {
        method: 'POST',
        body: { businessSlug: slug, serviceId: s.serviceId, staffId: s.staffId, startsAt: start },
      });
      setMessages((all) => [
        ...all,
        { id: idRef.current++, role: 'assistant', text: '', slots: [], draft },
      ]);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SLOT_TAKEN')
        toast.error(tAll('apiErrors.SLOT_TAKEN'));
      else setProblem(errorMessage(tAll, e));
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0 && !unavailable;
  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        role="log"
        aria-live="polite"
        aria-label={t('assistant')}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pe-1"
      >
        <ChatBubble role="assistant">{t('greeting', { business: businessName })}</ChatBubble>
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            {m.text && <ChatBubble role={m.role}>{m.text}</ChatBubble>}
            {m.slots.map((s, i) => (
              <ul
                key={i}
                className="grid grid-cols-3 gap-2"
                aria-label={`${t('slotsLabel')} - ${s.serviceName}`}
              >
                {s.slots.map((sl) => (
                  <li key={sl.start}>
                    <Button
                      variant="outline"
                      className="h-auto w-full flex-col gap-0.5 py-2"
                      disabled={busy || m.id !== lastId}
                      onClick={() => void pickSlot(s, sl.start)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Clock aria-hidden className="size-4" />
                        <span dir="ltr">{timeTz(sl.start, s.timezone)}</span>
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {formatDateTz(sl.start, s.timezone, locale, {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            ))}
            {m.draft && !m.booked && (
              <DraftCard
                draft={m.draft}
                locale={locale}
                onBooked={(view) => patch(m.id, (x) => ({ ...x, booked: view }))}
                onGone={() => setMessages((all) => all.filter((x) => x.id !== m.id))}
              />
            )}
            {m.booked && <BookedCard view={m.booked} />}
          </div>
        ))}
        {typing && <ChatBubble role="assistant" typingLabel={t('typing')} />}
        {problem && (
          <p
            role="alert"
            className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
          >
            {problem}{' '}
            <button className="underline" onClick={() => void send(lastText.current)}>
              {t('retry')}
            </button>
          </p>
        )}
        {unavailable && (
          <ErrorState
            className="py-6"
            title={t('unavailableTitle')}
            description={t('unavailableDesc')}
            action={
              <Button asChild>
                <Link href={`/b/${slug}/book`}>{t('openForm')}</Link>
              </Button>
            }
          />
        )}
        {empty && (
          <div className="flex flex-wrap gap-2" aria-label={t('suggestions')}>
            <Button variant="secondary" size="sm" onClick={() => void send(t('chipBook'))}>
              {t('chipBook')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void send(t('chipHours'))}>
              {t('chipHours')}
            </Button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = text;
          setText('');
          void send(v);
        }}
        className="flex items-center gap-2 border-t pt-3"
      >
        <Input
          value={text}
          maxLength={600}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          disabled={busy || unavailable}
        />
        <Button
          type="submit"
          size="icon"
          aria-label={t('send')}
          disabled={busy || unavailable || !text.trim()}
        >
          <Send aria-hidden className="size-4 rtl:-scale-x-100" />
        </Button>
      </form>
    </div>
  );
}

/** A proposal from the assistant. NOTHING is booked until the customer fills the form and presses Confirm. */
function DraftCard({
  draft,
  locale,
  onBooked,
  onGone,
}: {
  draft: AiDraft;
  locale: Locale;
  onBooked: (v: PublicBookingView) => void;
  onGone: () => void;
}) {
  const t = useTranslations();
  const [v, setV] = useState({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    const parsed = bookingCustomerSchema.safeParse(v);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setError(undefined);
    setBusy(true);
    try {
      onBooked(
        await api<PublicBookingView>('/public/ai/chat/confirm', {
          method: 'POST',
          body: { draftToken: draft.draftToken, customer: parsed.data, locale },
        }),
      );
    } catch (er) {
      if (er instanceof ApiError && (er.code === 'SLOT_TAKEN' || er.code === 'DRAFT_INVALID')) {
        toast.error(t(`apiErrors.${er.code}`));
        onGone();
      } else setError(errorMessage(t, er));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4 shadow-soft">
      <h3 className="font-semibold">{t('chat.draftTitle')}</h3>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('steps.service')}</dt>
          <dd className="font-medium">{draft.service.name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('book.with')}</dt>
          <dd className="font-medium">{draft.staff.displayName ?? t('book.anyone')}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('book.when')}</dt>
          <dd className="font-medium">
            {formatDateTz(draft.startsAt, draft.timezone, locale, { dateStyle: 'medium' })} ·{' '}
            <span dir="ltr">{timeTz(draft.startsAt, draft.timezone)}</span>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t('book.total')}</dt>
          <dd className="font-medium">{formatPrice(draft.service.price, locale)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{t('chat.draftNote')}</p>
      <form onSubmit={confirm} noValidate className="space-y-2">
        {(['name', 'phone', 'email'] as const).map((f) => (
          <div key={f} className="space-y-1">
            <Label htmlFor={`dc-${draft.draftToken.slice(0, 6)}-${f}`}>
              {f === 'email' ? t('form.emailOptional') : t(`form.${f}`)}
            </Label>
            <Input
              id={`dc-${draft.draftToken.slice(0, 6)}-${f}`}
              value={v[f]}
              dir={f === 'name' ? undefined : 'ltr'}
              inputMode={f === 'phone' ? 'tel' : f === 'email' ? 'email' : 'text'}
              autoComplete={f === 'name' ? 'name' : f === 'phone' ? 'tel' : 'email'}
              aria-invalid={!!errors[f]}
              onChange={(e) => setV((x) => ({ ...x, [f]: e.target.value }))}
            />
            {errors[f] && (
              <p role="alert" className="text-sm text-destructive">
                {t(`form.errors.${errors[f]}`)}
              </p>
            )}
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full gap-2" disabled={busy}>
          {busy ? <Spinner /> : <CalendarCheck aria-hidden className="size-4" />}
          {t('chat.confirmBooking')}
        </Button>
      </form>
    </Card>
  );
}

function BookedCard({ view }: { view: PublicBookingView }) {
  const t = useTranslations();
  return (
    <div className="space-y-2 rounded-xl bg-success-soft p-4 text-sm text-success">
      <p role="status" className="flex items-center gap-2 font-medium">
        <CalendarCheck aria-hidden className="size-4" />
        {view.status === 'PENDING' ? t('book.pendingDesc') : t('chat.booked')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={view.icsUrl}>{t('book.icsFile')}</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/booking/${view.cancelToken}`}>{t('book.manageLink')}</Link>
        </Button>
      </div>
    </div>
  );
}
