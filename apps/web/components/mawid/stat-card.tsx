import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  loading,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  delta?: number; // percent
  deltaLabel?: string;
  loading?: boolean;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="flex flex-col gap-3 p-5 shadow-soft">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {icon && (
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
      )}
      {delta !== undefined && !loading && (
        <p className={cn('flex items-center gap-1 text-xs', up ? 'text-success' : 'text-destructive')}>
          {up ? <TrendingUp aria-hidden className="size-3.5" /> : <TrendingDown aria-hidden className="size-3.5" />}
          <span dir="ltr">
            {up ? '+' : ''}
            {delta}%
          </span>
          <span className="text-muted-foreground">{deltaLabel}</span>
        </p>
      )}
    </Card>
  );
}
