/**
 * Sentry instrumentation bootstrap — must be the first module loaded.
 *
 * Loaded via `node --import ./dist/instrument.js` so that the OpenTelemetry
 * layer Sentry v8+ uses is registered before any other module (including the
 * DB pool, Hono, etc.).  When Sentry.init() runs after other modules have
 * already been imported, the OTel instrumentation is never set up and
 * captureException events may be silently dropped.
 *
 * See: https://docs.sentry.io/platforms/javascript/guides/node/install/esm/
 */
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  enabled: !!process.env.SENTRY_DSN,
  release:
    process.env.RAILWAY_DEPLOYMENT_ID ??
    process.env.npm_package_version,
});
