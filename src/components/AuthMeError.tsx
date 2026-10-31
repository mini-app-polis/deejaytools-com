import { Button } from "@/components/ui/button";

/** Shown in place of a page when the caller's account record could not be loaded. */
export default function AuthMeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="p-6 space-y-3">
      <p className="text-sm text-destructive">Couldn&apos;t load your account: {message}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
