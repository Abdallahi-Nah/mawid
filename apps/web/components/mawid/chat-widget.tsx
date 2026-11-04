'use client';

import { CalendarCheck, Clock, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatBubble } from '@/components/mawid/chat-bubble';
import { ErrorState } from '@/components/mawid/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CHAT_SLOTS } from '@/lib/mock-chat';

type Extra = 'slots' | 'confirm' | 'done';
type Msg = { id: number; role: 'user' | 'assistant'; text: string; extra?: Extra; time?: string };

const WORD_MS = 45;

// Mock AI chat: scripted replies streamed word by word. Real Groq streaming comes in a later phase.
export function ChatWidget({ forceError }: { forceError?: boolean }) {
  const t = useTranslations('chat');
  const [messages, setMessages] = useState<Msg[]>([{ id: 0, role: 'assistant', text: t('greeting') }]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const failRef = useRef(!!forceError);
  const idRef = useRef(1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const lastAction = useRef<(() => void) | null>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => endRef.current?.scrollIntoView?.({ block: 'end' }), [messages, typing, failed]);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  // Show the typing dots, then stream the words of the reply.
  const assistantSay = useCallback((reply: string, extra?: Extra, time?: string) => {
    setBusy(true);
    setTyping(true);
    later(() => {
      if (failRef.current) {
        setTyping(false);
        setBusy(false);
        setFailed(true);
        return;
      }
      setTyping(false);
      const id = idRef.current++;
      const words = reply.split(' ');
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setMessages((m) => [...m, { id, role: 'assistant', text: reduce ? reply : '', extra: reduce ? extra : undefined, time }]);
      if (reduce) return setBusy(false);
      words.forEach((_, i) =>
        later(() => {
          const last = i === words.length - 1;
          setMessages((m) =>
            m.map((x) => (x.id === id ? { ...x, text: words.slice(0, i + 1).join(' '), extra: last ? extra : undefined } : x)),
          );
          if (last) setBusy(false);
        }, (i + 1) * WORD_MS),
      );
    }, 700);
  }, []);

  const userSay = (value: string) => setMessages((m) => [...m, { id: idRef.current++, role: 'user', text: value }]);

  const ask = (kind: 'book' | 'hours', label: string) => {
    if (busy) return;
    userSay(label);
    lastAction.current = () => assistantSay(kind === 'book' ? t('replyBook') : t('replyHours'), kind === 'book' ? 'slots' : undefined);
    lastAction.current();
  };

  const pickSlot = (time: string) => {
    if (busy) return;
    userSay(t('pickedSlot', { time }));
    lastAction.current = () => assistantSay(t('replyConfirm', { time }), 'confirm', time);
    lastAction.current();
  };

  const confirm = (time: string) => {
    if (busy) return;
    userSay(t('confirmSlot'));
    lastAction.current = () => assistantSay(t('replyDone', { time }), 'done', time);
    lastAction.current();
  };

  const retry = () => {
    failRef.current = false;
    setFailed(false);
    lastAction.current?.();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    ask('book', value); // the mock understands only booking requests
  };

  const lastId = messages[messages.length - 1]?.id;
  const empty = messages.length === 1 && !typing && !failed;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div role="log" aria-live="polite" aria-label={t('assistant')} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pe-1">
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-2">
            <ChatBubble role={m.role}>{m.text}</ChatBubble>
            {m.extra === 'slots' && (
              <ul className="grid grid-cols-3 gap-2" aria-label={t('slotsLabel')}>
                {CHAT_SLOTS.map((s) => (
                  <li key={s}>
                    <Button
                      variant="outline"
                      className="w-full gap-1.5"
                      disabled={busy || m.id !== lastId}
                      onClick={() => pickSlot(s)}
                    >
                      <Clock aria-hidden className="size-4" />
                      {s}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {m.extra === 'confirm' && m.time && (
              <Button className="self-start gap-2" disabled={busy || m.id !== lastId} onClick={() => confirm(m.time!)}>
                <CalendarCheck aria-hidden className="size-4" />
                {t('confirmSlot')}
              </Button>
            )}
            {m.extra === 'done' && (
              <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
                <CalendarCheck aria-hidden className="size-4" />
                {t('booked')}
              </p>
            )}
          </div>
        ))}
        {typing && <ChatBubble role="assistant" typingLabel={t('typing')} />}
        {failed && (
          <ErrorState
            className="py-6"
            title={t('errorTitle')}
            description={t('errorDesc')}
            action={<Button variant="outline" onClick={retry}>{t('retry')}</Button>}
          />
        )}
        {empty && (
          <div className="flex flex-wrap gap-2" aria-label={t('suggestions')}>
            <Button variant="secondary" size="sm" onClick={() => ask('book', t('chipBook'))}>{t('chipBook')}</Button>
            <Button variant="secondary" size="sm" onClick={() => ask('hours', t('chipHours'))}>{t('chipHours')}</Button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t pt-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          disabled={busy}
        />
        <Button type="submit" size="icon" aria-label={t('send')} disabled={busy || !text.trim()}>
          <Send aria-hidden className="size-4 rtl:-scale-x-100" />
        </Button>
      </form>
    </div>
  );
}
