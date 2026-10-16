import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  const statKeys = ['stat-1', 'stat-2'];
  const listItemKeys = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {statKeys.map((key) => (
          <div key={key} className="rounded-lg border p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="h-[500px] w-full rounded-lg" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-32" />
          {listItemKeys.map((key) => (
            <div key={key} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
