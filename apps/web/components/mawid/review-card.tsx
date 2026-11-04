import { Star } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function ReviewCard({
  name,
  initials,
  rating,
  ratingLabel,
  text,
  date,
}: {
  name: string;
  initials: string;
  rating: number;
  ratingLabel: string;
  text: string;
  date: string;
}) {
  return (
    <Card className="space-y-3 p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback className="bg-secondary font-semibold text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
        <div role="img" aria-label={ratingLabel} className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              aria-hidden
              className={cn('size-4', n <= rating ? 'fill-warning text-warning' : 'text-input')}
            />
          ))}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
    </Card>
  );
}
