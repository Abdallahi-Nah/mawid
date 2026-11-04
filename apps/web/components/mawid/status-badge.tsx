import { cn } from '@/lib/utils';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'noShow';

const styles: Record<BookingStatus, string> = {
  pending: 'bg-warning-soft text-warning',
  confirmed: 'bg-info-soft text-info',
  completed: 'bg-success-soft text-success',
  cancelled: 'bg-destructive-soft text-destructive',
  noShow: 'bg-muted text-muted-foreground',
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: BookingStatus;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        styles[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
