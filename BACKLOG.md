# Backlog

Deferred features and known gaps. Not bugs — things deliberately left out
that need to come back.

---

## Floor trial UX — full revisit

The events, sessions, and queue flows work but have not had a dedicated UX
pass. The whole floor trial experience needs one once there is real usage
to react to. This includes:

- Session creation and management UI
- Check-in flow from the user's perspective
- Queue display and slot management for admins

Priority: when floor trial work resumes.

---

## Contract test coverage

API-side coverage lives in api-deejaytools. This repo's live contract suite
(`pnpm test:contract`) checks every endpoint the app calls against
`src/schemas`.

Component and page tests cover the UI, with coverage held to the floor
in `vitest.config.ts`; the e2e suite (`e2e/`) covers the core journeys
in a real browser. The intentional gap in this repo:

- `src/components/ui/*` — shadcn primitives (third-party), which have no
  tests of their own; the custom `choice-group` does.

---

## Song upload — Spotify URL field

Store a Spotify playlist/track URL directly on the `Song` model.
Add a `spotify_url` column and a `PATCH /v1/songs/:id` field for it.
Display in the songs table as a link.

Not built.

---

## Standards deferrals

Items the conformance review surfaced as gaps that we've consciously
chosen to defer rather than fix immediately. Each has a documented
rationale and a revisit trigger. The API records its own deferrals and
exemptions in api-deejaytools.

| Rule | Scope | Rationale | Revisit when |
|------|-------|-----------|--------------|
| TEST-013 | this repo | UI timing `setTimeout` calls flagged as production timeouts. | Evaluator-cog scopes the check to retry/HTTP/Prefect contexts. |

---

## Sentry — operational notes

Both services ship errors to Sentry. This section is an operational
reference for anyone tuning the setup.

### Current state

- **API: api-deejaytools.** Sentry's Python SDK (`sentry_sdk` with the
  FastAPI integration), configured by `SENTRY_DSN_APIS` in Doppler `prd`
  (syncs to Railway). That DSN is the shared `apis` project, also used by
  api-kaianolevine-com; events carry the tag `service=api-deejaytools`.
- **Frontend.** `SENTRY_DSN_DEEJAYTOOLS` is set in Doppler `prd`
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
  there's a specific reason to. (The API does sample traces.)

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
