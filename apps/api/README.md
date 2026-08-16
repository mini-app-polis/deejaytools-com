# deejaytools-com-api

Hono API on Node for [deejaytools.com](https://deejaytools.com): a
West Coast Swing routine and floor-trial management platform. Part
of the `deejaytools-com` monorepo at `apps/api/`.

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node 22 |
| Framework | Hono |
| Database | PostgreSQL via Drizzle ORM |
| Auth | Clerk session JWTs (verified against JWKS) |
| Observability | Sentry (errors), common-typescript-utils logger (structured logs) |
| Deployment | Railway (NIXPACKS, `railway.toml`; `startCommand` runs `pnpm --filter api db:migrate && pnpm --filter api start`) |

Auth verifies Clerk session JWTs only. Machine-to-machine (M2M)
opaque-token verification is deferred — see [ADR-003](./docs/decisions/ADR-003-jwt-only-clerk-verification.md)
for rationale and revisit triggers.

## Data inputs

- **Clerk JWTs** on `Authorization: Bearer <token>` for all
  authenticated routes under `/v1/`. Public routes (`GET /v1/events`,
  `GET /v1/sessions`, `GET /v1/sessions/:id`, the queue read endpoints,
  `POST /v1/feedback`) accept unauthenticated callers.
- **Song files** (MP3, WAV, FLAC, m4a) via the chunked upload endpoint
  `POST /v1/songs/upload/chunk`. Each request carries a chunk plus
  metadata (`upload_id`, `chunk_index`, `total_chunks`, `division`,
  `partner_id`, `routine_name`, `personal_descriptor`). The song row is
  only created when the final chunk is processed and Drive confirms the
  upload — there is no broken intermediate state. Files are persisted
  to Google Drive via the service account env vars (`GOOGLE_SERVICE_ACCOUNT_EMAIL`,
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_DRIVE_PARENT_FOLDER_ID`).
- **Session/check-in events** posted by the floor-trial UI to
  `/v1/sessions`, `/v1/checkins`, `/v1/queue`, `/v1/events`.
- **Admin test injections** via `POST /v1/admin/checkins` create
  synthetic user/partner/pair rows and a queue entry without going
  through the normal user flow. Used for testing only.
- **In-process scheduler** (`startScheduler()` in `index.ts`) drives
  session status transitions and active-queue auto-fill on a repeating
  timer (default 30 s). `GET /internal/tick` is an optional manual
  override for operators, not the primary driver.

## Data outputs

- **JSON response envelopes** — `{ data: ..., meta: ... }` for
  successful responses, `{ error: { code, message } }` for errors.
  Envelope helpers come from `common-typescript-utils`.
- **PostgreSQL writes** via Drizzle to the `deejaytools` database:
  users, partners, songs, sessions, check-ins, queue entries, events.
- **Google Drive writes** for song files — the upload service tags
  files with partnership/division metadata before uploading.
- **Sentry error reports** for any unhandled exception in request
  handlers.
- **Structured logs** via `createLogger('deejaytools-api')` to stdout
  (Railway captures and ships to its log aggregation).

## Routes

| Prefix | Purpose |
|--------|---------|
| `/health` | Liveness + readiness probe (public). Runs `SELECT 1` on each call — returns 200 `{ status: "ok" }` when the DB is reachable, 503 `{ status: "degraded" }` when it is not. |
| `/internal/tick` | Manual operator override: runs `tickSessionStatuses()` then `fillRunningSessions()` (same as the in-process scheduler). Gated by `x-tick-secret` when `TICK_SECRET` is set; completely open when unset. |
| `/v1/auth` | Clerk session sync / whoami. |
| `/v1/events` | Event CRUD for event organizers. |
| `/v1/sessions` | Session lifecycle for a single event. Reads include `event_name`, divisions, queue depth, and a derived status computed from the wall clock so display is correct even if the scheduler lags. |
| `/v1/checkins` | Dancer check-in (append-only history + live queue seed). |
| `/v1/queue` | Floor trial queue: reads (active / waiting / priority / non-priority) plus admin promote / complete / incomplete / withdraw. Read endpoints include a server-rendered `entityLabel` so the UI doesn't need to resolve names client-side. |
| `/v1/runs` | Admin-only run history. Joins runs with sessions, events, songs, the entity, and the completing admin to produce structured display labels. |
| `/v1/admin/checkins` | Admin-only test injection: POST creates synthetic user + partner + pair + check-in; GET lists current test data; DELETE wipes everything tied to synthetic-emailed users. |
| `/v1/admin/songs` | Admin-only searchable directory of all songs (optional `include_deleted`). |
| `/v1/admin/users` | Admin-only user directory (search, role patch, per-user partners and event submissions). |
| `/v1/admin/event-song-submissions` | Admin-only list of every song submission for one event (`?event_id=`), with partnership and submitter labels. |
| `/v1/partners` | Partner records (name, role, history). |
| `/v1/pairs` | Find-or-create the current user's pair with a chosen partner. |
| `/v1/teams` | Team CRUD scoped to the current user (Teams division uploads). |
| `/v1/managed-partnerships` | Managed partnership CRUD scoped to the current user. |
| `/v1/event-song-submissions` | Submit a song to an event; list and delete the caller's submissions. |
| `/v1/songs` | Song uploads (chunked + atomic) and CRUD. |
| `/v1/feedback` | Public feedback form submission (optional Brevo transactional email). |

**Legacy data:** the `legacy_songs` table exists from migration `0002`, is not represented in `schema.ts`, and is unused by any route. Legacy song rows in the live `songs` table are identified by a `processed_filename` starting with `"[Legacy] "` and render read-only in the UI.

## Environment variables

See `apps/api/.env.example` for the complete list. Required at
runtime:

- `DATABASE_URL` — Postgres connection string.
- `CLERK_JWKS_URL` — Clerk public key endpoint for JWT verification.
- `CORS_ORIGINS` — comma-separated allowed origins.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — service account email for Drive uploads.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — PEM private key (escape newlines as `\n` in env).
- `GOOGLE_DRIVE_PARENT_FOLDER_ID` — Drive folder ID shared with the service account.
- `PORT` — optional; HTTP listen port (default: `3001`).
- `DB_POOL_MAX` — optional; maximum Postgres connections in the pool (default: `20`). Set below your Railway plan's connection limit to leave headroom for other services.
- `DB_CONNECT_TIMEOUT` — optional; seconds to wait when opening a new connection before giving up (default: `10`).
- `DB_IDLE_TIMEOUT` — optional; seconds an idle connection is kept open before being released (default: `30`).
- `SENTRY_DSN` — optional; Sentry is enabled when set.
- `TICK_SECRET` — optional; when **defined** (including as an empty string),
  `GET /internal/tick` requires header `x-tick-secret` to match. When **unset**,
  the endpoint is completely open — a deployment warning.
- `TICK_INTERVAL_MS` — optional; in-process scheduler interval in ms
  (default: `30000`). Worst-case delay before the active queue first fills
  when a floor trial starts.
- `DISABLE_SCHEDULER` — optional; disables the in-process scheduler only when
  set to exactly `"1"`. Other truthy strings (including `"true"`) do **not**
  disable it.
- `BREVO_API_KEY` — optional; Brevo transactional email for feedback
  submissions (`routes/feedback.ts`). When unset the API logs
  `[feedback] BREVO_API_KEY not set; skipping transactional email` and still
  returns 201 success, so a missing key is invisible to the user.
- `RAILWAY_DEPLOYMENT_ID`, `npm_package_version` — read by `instrument.ts` for
  the Sentry release tag; platform-injected on Railway, not set locally.
- `NODE_ENV` — defaults to `development`.

## Running locally

Prerequisites:
- **Node 22** (see the Stack table). Use `nvm use` or your version manager to match.
- **pnpm 9+** — `npm install -g pnpm` if not already installed.
- **PostgreSQL** running locally, or a connection string to a hosted instance.

From the monorepo root:

```bash
pnpm install              # install all workspace dependencies
pnpm --filter api dev     # start the API in watch mode
pnpm --filter api test    # run the vitest suite
pnpm --filter api build   # produce the production build
```

At the monorepo root, `pnpm dev:api` and `pnpm dev:app` start each app; `pnpm test` runs `pnpm -r test` across all packages. Use the filtered forms above when you want to target the API only.

Copy `apps/api/.env.example` to `apps/api/.env` and fill in the required variables listed under Environment variables.

## Migrations

Managed by Drizzle ORM. Migration files live under `apps/api/drizzle/`.

- `pnpm --filter api db:generate` — author a new migration from schema
  changes.
- `pnpm --filter api db:migrate` — apply pending migrations.
- `pnpm --filter api db:studio` — browse the live database.

Migrations run at deploy time via Railway's `startCommand` in `railway.toml`
(`db:migrate` before `start`), not in CI.

## Tests

```bash
pnpm --filter api test          # run vitest suite
pnpm --filter api test:coverage # with coverage report
```

The suite covers every route prefix, the queue admission/compaction/run-count helpers, the song-label utility, the auth middleware, and the structured-error logging paths. Tests use a chained Drizzle mock from `src/test/mocks.ts` (queue results enqueued via `enqueueSelectResult`) and middleware mocks from the same file (`mockRequireAuth`, `mockRequireAdmin`).

When adding a new route, mirror the pattern from the closest existing route test:

- `routes/checkins.test.ts` for an authenticated mutation route.
- `routes/admin-checkins.test.ts` for an admin-only mutation that needs both a happy path and the 403 / 401 / 400 / 404 sad paths.
- `routes/runs.test.ts` for a complex JOIN-heavy read endpoint.
- `lib/queue/*.test.ts` for pure / lightly-mocked helper logic.

## Error reporting

Every route handler that maps an exception to an HTTP error response logs the underlying error with a route-specific event name (`queue_withdraw_failed`, `checkin_create_failed`, `auth_sync_failed`, `admin_checkin_inject_failed`, `song_atomic_upload_failed`, etc.) before returning the user-facing 4xx/5xx. The global `app.onError` catches anything else, sends to Sentry, and logs `unhandled_error`.

Best-effort silent fallbacks (audio metadata tagging, temp-dir cleanup, `optional-user` resolution, IANA timezone validation) intentionally do not log — those paths return sensible defaults and adding logs would just produce noise.
