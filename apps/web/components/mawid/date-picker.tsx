'use client';

import { CalendarDays } from 'lucide-react';
import { useLocale } from 'next-intl';
import { ar, enUS, fr } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const dayPickerLocales = { ar, fr, en: enUS };

export function DatePicker({
  value,
  onChange,
  placeholder,
  label,
}: {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder: string;
  label: string;
}) {
  const locale = useLocale() as Locale;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={`${label}: ${value ? formatDate(value, locale) : placeholder}`}
          className={cn(
            'w-full justify-start gap-2 font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarDays aria-hidden className="size-4" />
          {value ? formatDate(value, locale) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          locale={dayPickerLocales[locale]}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          disabled={{ before: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}
