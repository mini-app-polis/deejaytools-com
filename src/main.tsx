// Sentry init must run before any other application code.
import { Sentry } from "@/lib/instrument";

import { ClerkProvider } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppErrorBoundary from "./components/AppErrorBoundary";
import MaintenancePage from "./components/MaintenancePage";
import App from "./pages/App";
import "./index.css";

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!key) {
  throw new Error("DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY is required");
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element missing from index.html");
}

createRoot(container, {
  // React 19 error hooks → Sentry, for errors no boundary catches and for
  // errors React recovers from. Errors AppErrorBoundary catches are reported
  // by the boundary itself, so there is no onCaughtError hook to report them
  // a second time.
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <AppErrorBoundary>
      {/* Maintenance mode: only the literal "1" (matching the API's
          DISABLE_SCHEDULER). Compared inline so the build folds it to a
          constant and drops the branch it doesn't take — a normal build
          carries no maintenance page. Build-time: set in Cloudflare Pages,
          then redeploy. */}
      {import.meta.env.VITE_MAINTENANCE === "1" ? (
        <MaintenancePage />
      ) : (
        <ClerkProvider publishableKey={key}>
          <App />
        </ClerkProvider>
      )}
    </AppErrorBoundary>
  </StrictMode>
);
