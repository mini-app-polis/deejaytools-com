# Backlog

Deferred features and known gaps. Not bugs — things that were intentionally
left out of the initial build and need to come back.

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

Current coverage: ~68% statements, 70% functions.
Remaining gaps: slots happy paths, checkins business logic branches,
optional-user helper, middleware JWT verification path.

Target: 75% statements.

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

## Sentry setup (deferred — code is wired, projects pending)

Both services are instrumented with Sentry SDKs that no-op until a DSN is
set. When ready to enable error tracking:

**1. Create two Sentry projects** under one Sentry org:
   - `deejaytools-com-api` — Node platform
   - `deejaytools-com-app` — Browser/React platform

**2. Add DSNs to Doppler** under the deejaytools-com Doppler project:
   - `SENTRY_DSN` — for the API service (syncs to Railway)
   - `VITE_SENTRY_DSN` — for the React app (syncs to Cloudflare Pages)

**3. Configure rate limits** in each Sentry project:
   `Project → Settings → Client Keys (DSN) → Configure → Rate Limits`
   Set ~150–200 events/day per project. The Developer plan ceiling is
   5,000 errors/month total across the org; per-day limits prevent a
   single bad deploy from burning the whole month's quota.

**4. Enable Spike Protection** at the org level. Auto-throttles on
   abnormal traffic spikes. Free-tier-friendly. Worth turning on day one.

**5. Do not enable** performance monitoring (`tracesSampleRate`) or
   session replay (`replaysSessionSampleRate`) yet. Both share the same
   5,000-event quota with errors. The current `instrument.ts` and the
   API-side `Sentry.init()` deliberately omit these — keep it that way
   until there's a clear reason to add them.

**Expected cost:** $0/month indefinitely on the Developer plan
(5K errors/month, 1 dashboard user). Upgrade triggers: more than one
person needing dashboard access, sustained >5K errors/month, or wanting
retention beyond 30 days. Team plan is $26/mo (50K errors,
unlimited seats).

**Failure mode if quota is exhausted:** Sentry silently drops new
events for the rest of the billing cycle. No surprise bill. Rate limits
above are designed to make this granular (lose visibility for a day,
not the month).

---

## Doppler development config

The `development` config in Doppler is not populated. Local dev currently
requires manually maintaining `apps/api/.env`. Populate the development
config and document the `doppler run` local dev workflow in the README.
