import { Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function StaffCard({
  name,
  role,
  initials,
  rating,
  ratingLabel,
  photoUrl,
  selected,
  onSelect,
}: {
  name: string;
  role?: string;
  photoUrl?: string;
  initials: string;
  rating?: string;
  ratingLabel?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const Tag = onSelect ? 'button' : 'div';
  return (
    <Tag
      {...(onSelect
        ? { type: 'button' as const, role: 'radio', 'aria-checked': !!selected, onClick: onSelect }
        : {})}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-start shadow-soft transition-all',
        'hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <Avatar className="size-12">
        {photoUrl && <AvatarImage src={photoUrl} alt="" />}
        <AvatarFallback className="bg-secondary font-semibold text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name}</span>
        {role && <span className="block truncate text-sm text-muted-foreground">{role}</span>}
      </span>
      {rating && (
        <span aria-label={ratingLabel} className="flex items-center gap-1 text-sm font-medium">
          <Star aria-hidden className="size-4 fill-warning text-warning" />
          <span dir="ltr">{rating}</span>
        </span>
      )}
    </Tag>
  );
}
