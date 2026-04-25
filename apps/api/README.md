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
| Deployment | Railway (Procfile + `pnpm --filter api start`) |

Auth verifies Clerk session JWTs only. Machine-to-machine (M2M)
opaque-token verification is deferred — see [ADR-003](./docs/decisions/ADR-003-jwt-only-clerk-verification.md)
for rationale and revisit triggers.

## Data inputs

- **Clerk JWTs** on `Authorization: Bearer <token>` for all
  authenticated routes under `/v1/`.
- **Song files** (MP3, WAV, FLAC, m4a) — metadata via `POST /v1/songs` (JSON), then the file via `POST /v1/songs/:id/upload` as multipart form data. Files are persisted to Google Drive via the service account configured in `GOOGLE_SERVICE_ACCOUNT_*` env vars.
- **Session/check-in events** posted by the floor-trial UI to
  `/v1/sessions`, `/v1/checkins`, `/v1/queue`, `/v1/events`.
- **Railway cron ticks** via `GET /internal/tick` (secret-gated),
  which advances session statuses on a schedule.

## Data outputs

- **JSON response envelopes** — `{ data: ..., meta: ... }` for
  successful responses, `{ error: { code, message } }` for errors.
  Envelope helpers come from `common-typescript-utils`.
- **PostgreSQL writes** via Drizzle to the `deejaytools` database:
  users, partners, songs, sessions, check-ins, queue entries, events,
  legacy_songs.
- **Google Drive writes** for song files — the upload service tags
  files with partnership/division metadata before uploading.
- **Sentry error reports** for any unhandled exception in request
  handlers.
- **Structured logs** via `createLogger('deejaytools-api')` to stdout
  (Railway captures and ships to its log aggregation).

## Routes

| Prefix | Purpose |
|--------|---------|
| `/health` | Liveness probe (public). |
| `/internal/tick` | Railway cron hook, gated by `TICK_SECRET` header. |
| `/v1/auth` | Clerk session sync / whoami. |
| `/v1/events` | Event CRUD for event organizers. |
| `/v1/sessions` | Session lifecycle for a single event. |
| `/v1/checkins` | Dancer check-in (append-only history + live queue seed). |
| `/v1/queue` | Floor trial queue: reads and admin promote/complete/withdraw. |
| `/v1/partners` | Partner records (name, division, history). |
| `/v1/songs` | Song uploads and metadata. |
| `/v1/legacy-songs` | Read-only view of historical song catalog (public). |

## Environment variables

See `apps/api/.env.example` for the complete list. Required at
runtime:

- `DATABASE_URL` — Postgres connection string.
- `CLERK_JWKS_URL` — Clerk public key endpoint for JWT verification.
- `CORS_ORIGINS` — comma-separated allowed origins.
- `GOOGLE_SERVICE_ACCOUNT_*` — service account for Drive uploads.
- `SENTRY_DSN` — optional; Sentry is enabled when set.
- `TICK_SECRET` — optional; required to call `/internal/tick`.
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

Plain `pnpm dev` and `pnpm test` at the monorepo root fan out via the root-level scripts (`dev:api`, `dev:app`, and `test` which runs `pnpm -r test`). Use the filtered forms when you want to target the api app specifically.

Copy `apps/api/.env.example` to `apps/api/.env.local` and fill in the required variables listed under Environment variables.

## Migrations

Managed by Drizzle ORM. Migration files live under `apps/api/drizzle/`.

- `pnpm --filter api db:generate` — author a new migration from schema
  changes.
- `pnpm --filter api db:migrate` — apply pending migrations.
- `pnpm --filter api db:studio` — browse the live database.

Migrations run at deploy time via the Railway deploy hook, not in CI.

## Tests

```bash
pnpm --filter api test          # run vitest suite
pnpm --filter api test:coverage # with coverage report
```
