import { Skeleton } from '@/components/ui/skeleton';

export function BusinessSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto max-w-4xl">
      <Skeleton className="h-40 w-full rounded-none sm:h-56 sm:rounded-b-2xl" />
      <div className="space-y-6 px-4">
        <Skeleton className="-mt-10 size-20 rounded-2xl border-4 border-background" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
