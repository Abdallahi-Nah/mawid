import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ChatBubble({
  role,
  children,
  typingLabel,
}: {
  role: 'user' | 'assistant';
  children?: ReactNode;
  typingLabel?: string; // when set, shows the typing indicator
}) {
  const user = role === 'user';
  return (
    <div
      className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
        user
          ? 'self-end rounded-ee-sm bg-primary text-primary-foreground'
          : 'self-start rounded-es-sm bg-muted text-foreground',
      )}
    >
      {typingLabel ? (
        <span role="status" aria-label={typingLabel} className="flex items-center gap-1 py-1">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              aria-hidden
              className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
      ) : (
        children
      )}
    </div>
  );
}
