/**
 * Sentry browser-side init. Imported at the very top of main.tsx before
 * any application code, so init runs before React mounts.
 *
 * Rationale and ecosystem fit: ecosystem-standards CD-002 / CD-010 Layer 3
 * (unhandled-exception capture). The API uses @sentry/node initialised in
 * deejaytools-api src/instrument.ts, loaded via `node --import` before app.ts;
 * the React app uses @sentry/react initialised here.
 *
 * No-op when VITE_SENTRY_DSN is unset — local development does not send
 * events. The `enabled` flag mirrors the API-side pattern.
 */
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: Boolean(import.meta.env.VITE_SENTRY_DSN),
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
