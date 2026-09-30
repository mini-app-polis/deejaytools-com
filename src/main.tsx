// Sentry init must run before any other application code.
import { Sentry } from "@/lib/instrument";

import { ClerkProvider } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MaintenancePage from "./components/MaintenancePage";
import App from "./pages/App";
import "./index.css";

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!key) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required");
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element missing from index.html");
}

createRoot(container, {
  // React 19 error hooks → Sentry. Captures errors that would otherwise
  // be lost between unhandled exceptions (Sentry's global handlers) and
  // an explicit ErrorBoundary (none mounted yet).
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    {/* Maintenance mode: only the literal "1" (matching the API's
        DISABLE_SCHEDULER). Compared inline so the build folds it to a
        constant and drops the branch it doesn't take — a normal build carries
        no maintenance page, and scripts/check-live.sh in deejaytools-api
        relies on that. Build-time: set in Cloudflare Pages, then redeploy. */}
    {import.meta.env.VITE_MAINTENANCE === "1" ? (
      <MaintenancePage />
    ) : (
      <ClerkProvider publishableKey={key}>
        <App />
      </ClerkProvider>
    )}
  </StrictMode>
);
