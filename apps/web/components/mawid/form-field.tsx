import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/** Label + control + error message. The control must use the same id. */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
