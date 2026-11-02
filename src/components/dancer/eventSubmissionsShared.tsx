import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// What the event submission pages share: the header, the loading and the
// failed-load states.

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <Button variant="ghost" size="sm" className="px-0 mb-2" asChild>
        <Link to="/my-content">← Back to My Content</Link>
      </Button>
      <h1 className="page-title text-2xl">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** A failed load, said plainly, with a way to try it again. */
export function LoadError({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-destructive/50 px-4 py-3">
      <p className="text-sm text-destructive">
        Couldn&apos;t load {what}: {message}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
