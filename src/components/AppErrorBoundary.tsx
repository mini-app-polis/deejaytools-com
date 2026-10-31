import { ErrorBoundary } from "@sentry/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { goHome, reloadPage } from "@/lib/pageNavigation";

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

/**
 * Top-level error boundary. Sentry's ErrorBoundary reports the exception
 * (with the React component stack) and then renders the recovery screen.
 */
export default function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary fallback={<ErrorRecoveryScreen />}>{children}</ErrorBoundary>;
}
