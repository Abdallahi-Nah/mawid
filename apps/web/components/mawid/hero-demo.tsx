'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ChatBubble } from '@/components/mawid/chat-bubble';
import { SlotPicker } from '@/components/mawid/slot-picker';
import { Card } from '@/components/ui/card';

const SLOTS = [
  { time: '17:00' },
  { time: '17:30' },
  { time: '18:00', disabled: true },
  { time: '18:30' },
];

export function HeroDemo() {
  const t = useTranslations();
  const [slot, setSlot] = useState<string | undefined>('17:30');
  return (
    <Card className="flex flex-col gap-3 p-5 shadow-lifted">
      <ChatBubble role="user">{t('mock.chat.user')}</ChatBubble>
      <ChatBubble role="assistant">{t('mock.chat.assistant')}</ChatBubble>
      <SlotPicker slots={SLOTS} value={slot} onChange={setSlot} label={t('booking.slotsLabel')} />
    </Card>
  );
}
