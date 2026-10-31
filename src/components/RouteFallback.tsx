import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder shown while a lazily loaded route's chunk downloads. */
export default function RouteFallback() {
  return (
    <div className="p-6 space-y-2" role="status" aria-label="Loading page">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full max-w-lg" />
    </div>
  );
}
