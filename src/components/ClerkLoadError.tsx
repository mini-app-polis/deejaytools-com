import { ClerkFailed } from "@clerk/clerk-react";

/**
 * Banner shown when Clerk's script fails to load or times out
 * (failed_to_load_clerk_js / failed_to_load_clerk_js_timeout), which Clerk
 * reports as its "error" status. The rest of the app keeps rendering, so
 * public pages work; only sign-in is unavailable until a retry succeeds.
 */
export default function ClerkLoadError() {
  return (
    <ClerkFailed>
      <div
        role="alert"
        className="flex flex-wrap items-center justify-center gap-3 bg-destructive/10 px-4 py-2 text-sm text-destructive"
      >
        <span>Couldn&apos;t load sign-in, check your connection.</span>
        <button
          type="button"
          className="font-medium underline"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    </ClerkFailed>
  );
}
