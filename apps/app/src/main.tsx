// Sentry init must run before any other application code.
import { Sentry } from "@/lib/instrument";

import { ClerkProvider } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
    <ClerkProvider publishableKey={key}>
      <App />
    </ClerkProvider>
  </StrictMode>
);
