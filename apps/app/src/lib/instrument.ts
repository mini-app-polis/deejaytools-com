/**
 * Sentry browser-side init. Imported at the very top of main.tsx before
 * any application code, so init runs before React mounts.
 *
 * Rationale and ecosystem fit: ecosystem-standards CD-002 / CD-010 Layer 3
 * (unhandled-exception capture). The API uses @sentry/node initialised in
 * apps/api/src/app.ts; the React app uses @sentry/react initialised here.
 *
 * No-op when VITE_SENTRY_DSN is unset — local development does not send
 * events. The `enabled` flag mirrors the API-side pattern.
 */
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: Boolean(import.meta.env.VITE_SENTRY_DSN),
  sendDefaultPii: false,
});

export { Sentry };
