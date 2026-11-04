import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function ServiceCard({
  name,
  description,
  duration,
  price,
  bookLabel,
  selected,
  onBook,
}: {
  name: string;
  description?: string;
  duration: string;
  price: string;
  bookLabel: string;
  selected?: boolean;
  onBook?: () => void;
}) {
  return (
    <Card
      className={cn(
        'flex items-center justify-between gap-4 p-4 shadow-soft transition-shadow hover:shadow-lifted',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="min-w-0 space-y-1">
        <h3 className="truncate font-semibold">{name}</h3>
        {description && <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock aria-hidden className="size-3.5" />
          {duration}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="font-semibold">{price}</span>
        <Button size="sm" variant={selected ? 'secondary' : 'default'} onClick={onBook}>
          {bookLabel}
        </Button>
      </div>
    </Card>
  );
}
