import { ErrorBoundary } from "@sentry/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { goHome, reloadPage } from "@/lib/pageNavigation";
import { isStaleBuildError, reloadForNewBuild } from "@/lib/staleBuild";

/**
 * Shown in place of the whole app when rendering throws. Rendered outside
 * ClerkProvider and the router, so it uses full-page navigations and depends
 * on nothing that may have failed.
 */
export function ErrorRecoveryScreen() {
  return (
    <main role="alert" className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground">
          This page hit an unexpected error and couldn&apos;t be shown. It has been reported.
          Reloading usually fixes it; if not, start again from the home page.
        </p>
        <div className="flex justify-center gap-3">
          <Button type="button" onClick={reloadPage}>
            Reload
          </Button>
          <Button type="button" variant="outline" onClick={goHome}>
            Go home
          </Button>
        </div>
      </div>
    </main>
  );
}

/** A page chunk from an older build failed to load: reload into the new one (once). */
function onError(error: unknown) {
  if (isStaleBuildError(error)) reloadForNewBuild();
}

/**
 * Top-level error boundary. Sentry's ErrorBoundary reports the exception
 * (with the React component stack) and then renders the recovery screen. A
 * page chunk missing after a deploy that `vite:preloadError` did not catch
 * reloads the page once here as well (see lib/staleBuild).
 */
export default function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={<ErrorRecoveryScreen />} onError={onError}>
      {children}
    </ErrorBoundary>
  );
}
