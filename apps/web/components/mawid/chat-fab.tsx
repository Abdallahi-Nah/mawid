'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ChatWidget } from '@/components/mawid/chat-widget';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

// Floating AI chat button that opens the chat widget (mock conversation, no backend).
export function ChatFab({ forceError }: { forceError?: boolean }) {
  const t = useTranslations();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="icon"
          aria-label={t('b.chatOpen')}
          className="fixed bottom-20 end-4 z-30 size-14 rounded-full shadow-lifted lg:bottom-6"
        >
          <Sparkles aria-hidden className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-3 p-4 sm:max-w-md">
        <SheetHeader className="text-start">
          <SheetTitle>{t('chat.assistant')}</SheetTitle>
          <SheetDescription>{t('chat.subtitle')}</SheetDescription>
        </SheetHeader>
        <ChatWidget forceError={forceError} />
      </SheetContent>
    </Sheet>
  );
}
