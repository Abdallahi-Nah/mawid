import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ErrorState({
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
    <div role="alert" className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <TriangleAlert aria-hidden className="size-7" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
