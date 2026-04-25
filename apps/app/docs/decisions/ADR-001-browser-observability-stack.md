# ADR-001. Browser observability stack

Date: 2026-04-24

## Status

Accepted

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
   Initialised in `apps/app/src/lib/instrument.ts`, imported first in
   `main.tsx` before React mounts. React 19's `createRoot` error hooks
   (`onUncaughtError`, `onCaughtError`, `onRecoverableError`) wire to
   `Sentry.reactErrorHandler()`. DSN read from `VITE_SENTRY_DSN`;
   no-op when unset (matches API-side `@sentry/node` init pattern).

2. **Structured logger.** A thin browser wrapper at
   `apps/app/src/lib/logger.ts` exports `createLogger(service)` with
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
- apps/app/src/lib/instrument.ts — init module
- apps/app/src/lib/logger.ts — browser logger wrapper
