# ADR-0001: Browser observability stack

**Date:** 2026-04-24
**Status:** Accepted
**Repo:** deejaytools-com

---

> **Note (2026-10):** `common-typescript-utils` has since been retired, so
> the browser-compatible shared logger anticipated under Consequences will
> not arrive: `src/lib/logger.ts` is the logger. The API is now
> api-deejaytools (Python, Sentry's Python SDK), not the `@sentry/node`
> service this record compares against.

## Context

ecosystem-standards CD-002 / CD-010 require all production services to
implement Layer 3 observability (unhandled-exception capture via
Sentry) and Layer 2 (structured logging via the shared library). The
React app had neither: it used `console.warn` / `console.error` and
had no Sentry SDK installed. An earlier `evaluator.yaml` exemption
claimed `@sentry/react` was wired, but it wasn't — drift between
claimed and actual state.

The shared `common-typescript-utils` logger ships as a Node-only
module; importing it directly in a browser bundle would either fail
or pull in unused Node primitives.

## Decision

Three pieces:

1. **Sentry SDK.** Use `@sentry/react` for browser error capture.
   Initialised in `src/lib/instrument.ts`, imported first in
   `main.tsx` before React mounts. React 19's `createRoot` error hooks
   (`onUncaughtError`, `onCaughtError`, `onRecoverableError`) wire to
   `Sentry.reactErrorHandler()`. DSN read from `VITE_SENTRY_DSN`;
   no-op when unset (matches API-side `@sentry/node` init pattern).

2. **Structured logger.** A thin browser wrapper at
   `src/lib/logger.ts` exports `createLogger(service)` with
   the same shape (`info`/`warn`/`error` taking
   `{ event, category, context?, error? }`) as the Node shared logger.
   Writes to `console.*` under the hood. Single place to upgrade later
   if a real browser-shipping shared logger exists.

3. **Bridge between them.** `logger.error(...)` additionally forwards
   to Sentry — `captureException` when `error` is an `Error` instance,
   `captureMessage` otherwise. This gives explicit error captures the
   same destination as React render-time errors without requiring
   callers to remember two APIs.

No `Sentry.ErrorBoundary` mounted around the routed app yet. That is
a UX decision (what to render when something throws) and belongs in a
separate iteration.

## Consequences

**Easier:**
- Browser-side errors land in Sentry alongside API errors. CD-002
  and CD-010 Layer 3 satisfied.
- One log API across the codebase. CD-003 satisfied without importing
  a Node module into the browser bundle.
- Local development is silent — DSN unset, Sentry no-ops.

**How the DSN reaches each build:**
- The DSN lives in Doppler as `SENTRY_DSN_DEEJAYTOOLS`, named for its
  Sentry project (CD-002), and is set in the Cloudflare Pages build
  environment under the same name, for production and preview builds.
  Pages builds the site itself, so the DSN is read at build time only.
- `vite.config.ts` maps that one variable, by name, into the bundle as
  `import.meta.env.VITE_SENTRY_DSN`; `envPrefix` is not widened, which
  would bundle every `SENTRY_DSN_*` in the build environment.
- A build without it still succeeds and Sentry silently no-ops, so a
  missing DSN would otherwise go unnoticed. The `site` workflow
  (`.github/workflows/site.yml`) fails a deployed build whose app bundle
  carries no DSN, alongside its check of the Clerk key. It checks the
  DSN's shape only (`https://<key>@o<org>.ingest….sentry.io/<project>`),
  never printing it, so it cannot tell a DSN for the wrong project:
  that is caught by a test error on the deployed site landing in the
  right project.

**Environment and traces:**
- Events are tagged with the environment the API uses for the same
  deploy: `production` for builds of `main`, `development` for every
  other Pages build, `local` otherwise. `vite.config.ts` decides it
  from the branch; Vite's mode cannot, being `production` for every
  build.
- Requests to the site's API carry `sentry-trace` and `baggage`
  (`browserTracingIntegration`, with `tracePropagationTargets` set to
  the API origin only, since other hosts would refuse the headers in
  their CORS preflight). The API allows both headers. An API error then
  shares a trace id with the page that caused it.
- `tracesSampleRate` is unset, so the browser sends no performance
  spans and spends no quota; the API makes the sampling decision.

**Harder:**
- When `common-typescript-utils` ships a browser-compatible logger,
  this wrapper has to be deleted and call sites have to switch.
  That's a deliberate future migration, not an obstacle.
- Sentry quota tracking is now part of the project. Free tier
  covers expected volume.

## References

- ecosystem-standards CD-002 (Sentry for error tracking)
- ecosystem-standards CD-003 (Structured logging via shared library)
- ecosystem-standards CD-010 (Three-layer observability stack)
- src/lib/instrument.ts — init module
- src/lib/logger.ts — browser logger wrapper
