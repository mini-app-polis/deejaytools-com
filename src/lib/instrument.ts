/**
 * Sentry browser-side init. Imported at the very top of main.tsx before
 * any application code, so init runs before React mounts.
 *
 * Rationale and ecosystem fit: ecosystem-standards CD-002 / CD-010 Layer 3
 * (unhandled-exception capture). The API (api-deejaytools) uses Sentry's
 * Python SDK; the React app uses @sentry/react initialised here.
 *
 * No-op when SENTRY_DSN_DEEJAYTOOLS is unset (vite.config.ts maps it into
 * the bundle as import.meta.env.VITE_SENTRY_DSN) — local development does not send
 * events. The `enabled` flag mirrors the API-side pattern.
 */
import * as Sentry from "@sentry/react";
import { sentryEnvironment, tracePropagationTargets } from "./sentryOptions";

const propagationTargets = tracePropagationTargets(import.meta.env.VITE_API_URL);

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  // From the branch Pages built (vite.config.ts), not import.meta.env.MODE,
  // which is "production" for every build, the dev site's included.
  environment: sentryEnvironment(import.meta.env.VITE_SENTRY_ENVIRONMENT),
  enabled: Boolean(import.meta.env.VITE_SENTRY_DSN),
  // Requests to the API carry sentry-trace and baggage, so an API error shares
  // a trace id with the page that made the request. tracesSampleRate is left
  // unset on purpose: the browser sends no performance spans (no quota spent)
  // and leaves the sampling decision to the API.
  integrations: [Sentry.browserTracingIntegration()],
  ...(propagationTargets ? { tracePropagationTargets: propagationTargets } : {}),
  // v11 removed `sendDefaultPii`, and an unset `dataCollection` now collects
  // everything. This is Sentry's documented equivalent of the old
  // `sendDefaultPii: false`, so no user data starts flowing on the upgrade.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
      response: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    },
    httpBodies: [],
    urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    graphQL: { document: false, variables: false },
  },
  // Tag every event with the deployed release. VITE_APP_VERSION is injected
  // at build time by vite.config.ts from the repo-root package.json.
  release: import.meta.env.VITE_APP_VERSION,
});

export { Sentry };
