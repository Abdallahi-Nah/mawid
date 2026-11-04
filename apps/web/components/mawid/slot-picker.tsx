'use client';

import { cn } from '@/lib/utils';

export interface Slot {
  time: string; // "HH:mm"
  disabled?: boolean;
}

export function SlotPicker({
  slots,
  value,
  onChange,
  label,
  className,
}: {
  slots: Slot[];
  value?: string;
  onChange: (time: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4', className)}>
      {slots.map((slot) => {
        const selected = value === slot.time;
        return (
          <button
            key={slot.time}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={slot.disabled}
            onClick={() => onChange(slot.time)}
            className={cn(
              'h-11 rounded-lg border text-sm font-medium tabular-nums transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected
                ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                : 'border-input bg-card hover:border-primary hover:bg-secondary',
              slot.disabled && 'cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60 hover:border-input hover:bg-muted',
            )}
          >
            <span dir="ltr">{slot.time}</span>
          </button>
        );
      })}
    </div>
  );
}
