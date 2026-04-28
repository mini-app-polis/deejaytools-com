# Backlog

Deferred features and known gaps. Not bugs — things that were intentionally
left out of the initial build and need to come back.

---

## Recently completed

- **ADR-004 floor-trial queue model.** Schema, helpers, routes, and
  frontend updated. Replaces the original `floor_slots` design with
  three queues, audit trail, and run-history tables. See
  `apps/api/docs/decisions/ADR-004-floor-trial-queue-model.md`.
- **Two-step queue compaction.** `compactAfterRemoval` now moves rows
  to sentinel positions before settling them at their final values, to
  avoid unique-index conflicts during concurrent withdraw/promote/
  complete operations. Covered by `lib/queue/compaction.test.ts`.
- **Comprehensive error logging.** Every route handler that maps an
  exception to a 4xx/5xx response now logs the underlying error via
  `createLogger("deejaytools-api")` with a route-specific event name
  (`queue_withdraw_failed`, `checkin_create_failed`, `auth_sync_failed`,
  `admin_checkin_inject_failed`, etc.) so production failures are
  debuggable without losing the user-facing status.
- **Frontend test suite.** `apps/app` now has Vitest set up with
  pure-function tests (Node env) and component tests (jsdom env)
  covering the api client, auth hooks, route guards, NavBar, and the
  critical pages (FloorTrials, SessionDetail, Songs/AddSong, Landing,
  Partners). Integrated into CI via `pnpm -r test:coverage`.
- **Public-readable session detail.** Visitors can browse Floor Trials
  and individual session pages without signing in; the check-in form
  is replaced with a "Sign in to check in" CTA when unauthenticated.

---

## Floor trial UX — full revisit

The events, sessions, and queue flows were migrated from the old platform
but not redesigned. The whole floor trial experience needs a UX pass once
there is real usage to react to. This includes:

- Session creation and management UI
- Check-in flow from the user's perspective
- Queue display and slot management for admins
- Railway cron for automatic session status transitions
  (`GET /internal/tick` — `TICK_SECRET` is already configured)

Priority: when floor trial work resumes.

---

## Admin-configurable divisions list

Song upload uses a hardcoded list of 15 WCS divisions in the frontend.
The right solution is an admin-managed divisions table with a CRUD UI.

Defer until floor trial UX revisit — session divisions and song divisions
should be managed from the same place.

---

## Contract test coverage

The previously-listed gaps (queue mutation edge cases, check-in
admission branches, middleware JWT verification path) are now closed.
The auth middleware has its own test file; queue endpoints
(`/promote`, `/complete`, `/incomplete`, `/withdraw`) cover auth +
sad paths; admin endpoints (`/v1/admin/checkins`, `/v1/runs`) and the
song claim-legacy flow each have dedicated tests; queue helpers
(`admission`, `compaction`, `runCounts`, `singleEntry`, `songLabel`)
have unit-level coverage.

Remaining intentional gaps:

- `optional-user.ts` — fail-soft contract; nothing meaningful to
  assert beyond "returns undefined for invalid input".
- `apps/app/src/pages/AdminPage.tsx` — large, tab-heavy admin surface
  whose API endpoints are all tested. Manual QA covers the UI side.
- `apps/app/src/components/ui/*` — shadcn primitives (third-party).

---

## common-typescript-utils versioning

Generic utilities are consumed from the published `common-typescript-utils`
npm package. When adding or changing shared helpers, coordinate releases there
and bump the dependency in this repo.

---

## Song upload — Spotify URL field

Store a Spotify playlist/track URL directly on the `Song` model.
Add a `spotify_url` column and a `PATCH /v1/songs/:id` field for it.
Display in the songs table as a link.

Deferred from initial build.

---

## Standards deferrals

Items the conformance review surfaced as gaps that we've consciously
chosen to defer rather than fix immediately. Each has a documented
rationale and a revisit trigger.

| Rule | Scope | Rationale | Revisit when |
|------|-------|-----------|--------------|
| API-011 | apps/api | Drizzle migrations run at Railway deploy time, not in CI. | See [apps/api ADR-001](./apps/api/docs/decisions/ADR-001-drizzle-migrations-at-deploy.md). |
| API-001 | apps/api | Railway config lives at the monorepo root rather than per-app. | Evaluator-cog API-001 check learns to look at the monorepo root. |
| XSTACK-002 | apps/api | Test fixture `src/test/mocks.ts` mirrors handler shape with raw `c.json`. | Evaluator-cog excludes `src/test/` from XSTACK-002. |
| API-004 | apps/api | `/internal/tick` is unversioned by design (Railway cron hook). | Never — intentional. Recorded inline in `src/app.ts`. |
| CD-010, PRIN-005 | apps/api | Python-pattern observability checker false-positives against TypeScript. | Evaluator-cog adds `@sentry/node` + `common-typescript-utils` patterns. |
| CD-012 | apps/api | JWT-only verification; no machine callers exist. | See [apps/api ADR-003](./apps/api/docs/decisions/ADR-003-jwt-only-clerk-verification.md). |
| TEST-013 | apps/app | UI timing `setTimeout` calls flagged as production timeouts. | Evaluator-cog scopes the check to retry/HTTP/Prefect contexts. |

---

## Sentry — operational notes

Both services are live and shipping errors to Sentry. This section is
preserved as an operational reference for anyone tuning the setup.

### Current state

- **API: live.** `SENTRY_DSN` is set in Doppler `prd` (syncs to
  Railway). `app.onError` calls `Sentry.captureException` on every
  unhandled exception.
- **Frontend: live.** `VITE_SENTRY_DSN` is set in Doppler `prd`
  (syncs to Cloudflare Pages). `apps/app/src/lib/instrument.ts`
  initializes `@sentry/react`, and `src/main.tsx` wires React 19
  error hooks (`onUncaughtError`, `onCaughtError`, `onRecoverableError`)
  through `Sentry.reactErrorHandler()`. `lib/logger.ts` also forwards
  `logger.error` calls.
- **Topology:** decided per the FE rollout (single shared
  `deejaytools-com` project, or split into a separate
  `deejaytools-com-app` browser project). Events are tagged with
  `platform:node` vs `platform:javascript` either way, so filtering by
  source always works.

### Configuration to confirm in the dashboard

- **Rate limits.** `Project → Settings → Client Keys (DSN) → Configure
  → Rate Limits`. ~150–200 events/day per DSN keeps a single bad deploy
  from burning the 5,000-events/month free-tier quota.
- **Spike Protection.** Org-level toggle. Auto-throttles abnormal
  traffic spikes. Worth keeping on.
- **What we deliberately do NOT enable:** `tracesSampleRate`
  (performance monitoring) and `replaysSessionSampleRate` (session
  replay). Both share the 5,000-event quota with errors. Add only when
  there's a specific reason to.

### Cost and failure-mode notes

**Expected cost:** $0/month indefinitely on the Developer plan
(5K errors/month, 1 dashboard user). Upgrade triggers: more than one
person needing dashboard access, sustained >5K errors/month, or wanting
retention beyond 30 days. Team plan is $26/mo (50K errors,
unlimited seats).

**Failure mode if quota is exhausted:** Sentry silently drops new
events for the rest of the billing cycle. No surprise bill. The
per-project rate limit above is designed to make a quota burn
granular (lose visibility for a day, not the month).

### Optional next polish

- **Release tagging.** Pass `release` to both `Sentry.init` calls so
  errors link to the deployed version. API: `release:
  process.env.RAILWAY_DEPLOYMENT_ID ?? process.env.npm_package_version`.
  App: inject the version at build time via `vite.config.ts` and read
  from `import.meta.env.VITE_APP_VERSION`. Without this, every error is
  associated with `unknown@*` and you can't tell which deploy
  introduced a bug — matters more once releases ship multiple times
  per week.

---

## Doppler development config

The `development` config in Doppler is not populated. Local dev currently
requires manually maintaining `apps/api/.env`. Populate the development
config and document the `doppler run` local dev workflow in the README.
