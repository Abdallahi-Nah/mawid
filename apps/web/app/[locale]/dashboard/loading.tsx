import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
