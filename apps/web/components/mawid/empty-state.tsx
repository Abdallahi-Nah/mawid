import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <svg aria-hidden viewBox="0 0 120 96" className="h-24 w-28 text-primary">
        <rect x="14" y="18" width="92" height="66" rx="14" fill="currentColor" opacity="0.10" />
        <rect x="14" y="18" width="92" height="20" rx="10" fill="currentColor" opacity="0.18" />
        <circle cx="38" cy="14" r="4" fill="currentColor" />
        <circle cx="82" cy="14" r="4" fill="currentColor" />
        <rect x="28" y="50" width="18" height="12" rx="4" fill="currentColor" opacity="0.35" />
        <rect x="51" y="50" width="18" height="12" rx="4" fill="currentColor" opacity="0.2" />
        <rect x="74" y="50" width="18" height="12" rx="4" fill="currentColor" opacity="0.2" />
        <rect x="28" y="67" width="18" height="10" rx="4" fill="currentColor" opacity="0.2" />
      </svg>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
