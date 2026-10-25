# Backlog

Deferred features and known gaps. Not bugs — things that were intentionally
left out of the initial build and need to come back.

---

## Recently completed

- **api-deejaytools ADR-0005 floor-trial queue model.** Schema, helpers, routes, and
  frontend updated. Replaces the original `floor_slots` design with
  three queues, audit trail, and run-history tables. See
  `api-deejaytools/docs/decisions/ADR-0005-floor-trial-queue-model.md`
  (made in deejaytools-api, since ported).
- **Two-step queue compaction.** Queue compaction moves rows to
  sentinel positions before settling them at their final values, to
  avoid unique-index conflicts during concurrent withdraw/promote/
  complete operations. Now in api-deejaytools `queue/compaction.py`.
- **Comprehensive error logging.** Every API route handler that maps an
  exception to a 4xx/5xx response logs the underlying error with a
  route-specific event name (`queue_withdraw_failed`,
  `checkin_create_failed`, `admin_checkin_inject_failed`, etc.) so
  production failures are debuggable without losing the user-facing
  status. The current list is in
  [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md#useful-log-events).
- **Frontend test suite.** This repo now has Vitest set up with
  pure-function tests (Node env) and component tests (jsdom env)
  covering the api client, auth hooks, route guards, NavBar, and the
  critical pages (FloorTrials, SessionDetail, Songs/AddSong, Landing,
  Partners). Integrated into CI via `pnpm test:coverage`.
- **Public-readable session detail.** Visitors can browse Floor Trials
  and individual session pages without signing in; the check-in form
  is replaced with a "Sign in to check in" CTA when unauthenticated.
- **In-process session scheduler.** api-deejaytools'
  `services/scheduler.py` advances session statuses, auto-fills the
  active queue, and runs song builds and Drive jobs on a repeating timer
  (default 30 s via `TICK_INTERVAL_MS`). `GET /internal/tick`
  (`routers/internal.py`) is a manual operator override, not a Railway
  cron job.
- **Sentry release tagging (frontend).** The app injects
  `VITE_APP_VERSION` via `vite.config.ts` and passes it to
  `Sentry.init` in `src/lib/instrument.ts`.

---

## Floor trial UX — full revisit

The events, sessions, and queue flows were migrated from the old platform
but not redesigned. The whole floor trial experience needs a UX pass once
there is real usage to react to. This includes:

- Session creation and management UI
- Check-in flow from the user's perspective
- Queue display and slot management for admins

Priority: when floor trial work resumes.

---

## Admin-configurable divisions list

Song upload uses a hardcoded list of 15 WCS divisions in the frontend.
The right solution is an admin-managed divisions table with a CRUD UI.

Defer until floor trial UX revisit — session divisions and song divisions
should be managed from the same place.

---

## Contract test coverage

API-side coverage lives in api-deejaytools (its `tests/` and the
`conformance/` suite). This repo's live contract suite
(`pnpm test:contract`) checks every endpoint the app calls against
`src/schemas`.

Remaining intentional gaps in this repo:

- `src/pages/AdminPage.tsx` — large, tab-heavy admin surface
  whose API endpoints are all tested. Manual QA covers the UI side.
- `src/components/ui/*` — shadcn primitives (third-party).

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
rationale and a revisit trigger. The API's deferrals and exemptions live
in api-deejaytools' `evaluator.yaml`.

| Rule | Scope | Rationale | Revisit when |
|------|-------|-----------|--------------|
| TEST-013 | this repo | UI timing `setTimeout` calls flagged as production timeouts. | Evaluator-cog scopes the check to retry/HTTP/Prefect contexts. |

---

## Sentry — operational notes

Both services are live and shipping errors to Sentry. This section is
preserved as an operational reference for anyone tuning the setup.

### Current state

- **API: api-deejaytools.** Sentry's Python SDK (`sentry_sdk` with the
  FastAPI integration), configured by `SENTRY_DSN_APIS` in Doppler `prd`
  (syncs to Railway). That DSN is the shared `apis` project, also used by
  api-kaianolevine-com; events carry the tag `service=api-deejaytools`.
  Unhandled exceptions are captured by its `UnhandledErrorMiddleware`.
- **Frontend: live.** `SENTRY_DSN_DEEJAYTOOLS` is set in Doppler `prd`
  (syncs to Cloudflare Pages). `src/lib/instrument.ts`
  initializes `@sentry/react`, and `src/main.tsx` wires React 19
  error hooks (`onUncaughtError`, `onCaughtError`, `onRecoverableError`)
  through `Sentry.reactErrorHandler()`. `lib/logger.ts` also forwards
  `logger.error` calls.
- **Topology:** API events go to the shared `apis` project (filter by
  the `service` tag); browser events go to the project behind
  `SENTRY_DSN_DEEJAYTOOLS`.

### Configuration to confirm in the dashboard

- **Rate limits.** `Project → Settings → Client Keys (DSN) → Configure
  → Rate Limits`. ~150–200 events/day per DSN keeps a single bad deploy
  from burning the 5,000-events/month free-tier quota.
- **Spike Protection.** Org-level toggle. Auto-throttles abnormal
  traffic spikes. Worth keeping on.
- **What the frontend deliberately does NOT enable:** `tracesSampleRate`
  (performance monitoring) and `replaysSessionSampleRate` (session
  replay). Both share the 5,000-event quota with errors. Add only when
  there's a specific reason to. (The API's init does set
  `traces_sample_rate=1.0`; see api-deejaytools `main.py`.)

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
