import { Button } from "@/components/ui/button";

/**
 * Shown where a query's data would be when it could not be loaded, so a
 * failed load never reads as an empty list (ADR-0003).
 */
export default function QueryError({
  what,
  error,
  onRetry,
}: {
  /** What failed to load, e.g. "sessions". */
  what: string;
  error: Error;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="space-y-3 py-4">
      <p className="text-sm text-destructive">
        Couldn&apos;t load {what}: {error.message}
      </p>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
