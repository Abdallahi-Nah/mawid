import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Stepper({
  steps,
  current,
  progressLabel,
  className,
}: {
  steps: string[];
  current: number; // 0-based
  progressLabel: string;
  className?: string;
}) {
  const pct = ((current + 1) / steps.length) * 100;
  return (
    <div className={cn('w-full', className)}>
      <p className="mb-2 text-sm font-medium text-muted-foreground sm:hidden">{progressLabel}</p>
      <ol className="flex items-center justify-between gap-2">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className="flex flex-1 items-center gap-2"
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary bg-secondary text-primary',
                  !done && !active && 'border-input text-muted-foreground',
                )}
              >
                {done ? <Check aria-hidden className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  'hidden text-sm sm:inline',
                  active ? 'font-semibold' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={progressLabel}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
