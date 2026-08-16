# deejaytools-com

Monorepo for [deejaytools.com](https://deejaytools.com): a West Coast Swing routine and floor-trial management platform.

## Structure

| Path | Role |
|------|------|
| `packages/schemas` | Shared Zod domain schemas (session/checkin/event/partner enums, etc.) |
| `apps/api` | Hono API on Node, Drizzle + PostgreSQL, Clerk auth, Google Drive song storage |
| `apps/app` | Vite + React + Tailwind frontend, Clerk auth, shadcn/ui |

Each app has its own README with stack details, environment variables, and run instructions:

- [`apps/api/README.md`](apps/api/README.md)
- [`apps/app/README.md`](apps/app/README.md)

Shared logger, API response envelopes, Clerk JWT verification, and generic Zod helpers (`UserRoleSchema`, `PaginationSchema`, …) come from the [`common-typescript-utils`](https://www.npmjs.com/package/common-typescript-utils) package on npm.

## Stack

| Layer | Technology |
|-------|------------|
| Package manager | pnpm 9 workspaces |
| Language | TypeScript (strict), ES modules |
| API | Hono, Drizzle ORM, postgres.js, Railway |
| App | Vite 6, React 19, Tailwind 3, React Router 7, Clerk, shadcn/ui, react-hook-form |
| Tests | Vitest on both packages; React Testing Library + jsdom on the frontend |
| Observability | Sentry (errors), `common-typescript-utils` structured logger |
| CI | GitHub Actions: typecheck → lint → test:coverage → builds |
| Release | semantic-release on `main` (Conventional Commits) |

## Developer setup

**Prerequisites**
- Node.js 22+
- pnpm 9 (`npm install -g pnpm`)

**Install**

```bash
pnpm install
```

**Environment**

```bash
cp apps/api/.env.example apps/api/.env
cp apps/app/.env.example apps/app/.env.local
# Fill in DATABASE_URL, CLERK_JWKS_URL, VITE_CLERK_PUBLISHABLE_KEY at minimum
```

**Database**

```bash
pnpm --filter api db:generate   # generate migration files (first time only)
pnpm --filter api db:migrate    # apply schema to database
pnpm --filter api db:studio     # browse data
```

**Run**

```bash
pnpm dev:api   # http://localhost:3001
pnpm dev:app   # http://localhost:5173
```

**Test, typecheck, lint**

```bash
pnpm test           # run all tests in both packages
pnpm typecheck      # strict tsc across workspace
pnpm lint           # eslint across workspace
```

CI runs `pnpm -r test:coverage` (the `-r` traverses every workspace package). Both `apps/api` and `apps/app` have a `test:coverage` script that produces coverage output via `@vitest/coverage-v8`.

## Application surface

The API exposes the following route prefixes (all under `/v1` unless noted). Authenticated routes require a Clerk session JWT in `Authorization: Bearer <token>`.

| Prefix | Purpose | Auth |
|--------|---------|------|
| `/health` | Liveness probe (runs `SELECT 1`; 503 when DB unreachable) | public |
| `/internal/tick` | Manual operator override: runs the same tick pass as the in-process scheduler | `x-tick-secret` header when `TICK_SECRET` is set (see apps/api README) |
| `/v1/auth` | Sync the current Clerk user to the DB / whoami | required |
| `/v1/events` | Event CRUD | list public; `GET /:id` required; mutations admin |
| `/v1/sessions` | Session lifecycle, divisions, queue depth (derived status from wall clock) | mixed (reads public; mutations admin) |
| `/v1/checkins` | Dancer check-in (creates queue entry) | required |
| `/v1/queue` | Active / priority / non-priority queue reads + admin actions (promote, complete, withdraw) | mixed |
| `/v1/runs` | Admin run history with structured labels | admin |
| `/v1/admin/checkins` | Admin test-injection (create/list/delete synthetic queue entries) | admin |
| `/v1/admin/songs` | Admin directory of all songs (search, soft-delete filter) | admin |
| `/v1/admin/users` | Admin user directory (search, role patch, per-user partners/submissions) | admin |
| `/v1/admin/event-song-submissions` | All song submissions for one event (Manager Event Songs tab) | admin |
| `/v1/partners` | Partner CRUD scoped to current user | required |
| `/v1/pairs` | Find-or-create the current user's pair with a chosen partner | required |
| `/v1/teams` | Team CRUD scoped to current user (Teams / Cabaret uploads) | required |
| `/v1/managed-partnerships` | Managed partnership CRUD scoped to current user | required |
| `/v1/event-song-submissions` | Submit a song to an event; list/delete own submissions | required |
| `/v1/songs` | Song upload (chunked + atomic), CRUD | required |
| `/v1/feedback` | Public feedback form submission (optional Brevo email) | public |

**Legacy data:** the `legacy_songs` table exists from migration `0002`, is not represented in `schema.ts`, and is unused by any route. Legacy song rows in the live `songs` table are identified by a `processed_filename` starting with `"[Legacy] "` and render read-only in the UI.

The session-detail and queue-read endpoints accept unauthenticated callers — public visitors can browse Floor Trials and individual sessions without signing in. Submitting a check-in still requires auth.

The frontend pages map to these routes:

| Route | Page | Guard |
|-------|------|-------|
| `/` | LandingPage (card grid entry points) | public |
| `/floor-trials` | Active and upcoming sessions | public |
| `/check-in` | Alias → FloorTrialsPage | public |
| `/how-it-works` | Floor-trial help hub | public |
| `/how-it-works/floor-trials` | Help — floor trials | public |
| `/how-it-works/submitting-music` | Help — submitting music | public |
| `/how-it-works/checking-in` | Help — checking in | public |
| `/how-it-works/the-queue` | Help — watching the queue | public |
| `/how-it-works/partners` | Help — partners & teams (guide content) | public |
| `/how-it-works/on-the-floor` | Help — on the floor | public |
| `/how-it-works/troubleshooting` | Help — error message lookup | public |
| `/feedback` | Feedback form | public |
| `/sessions/:id` | Session detail with queue and check-in | public read; signed-in to check in |
| `/my-content` | Events, songs, check-ins hub | RequireAuth |
| `/my-profile` | Profile, partners, teams, managed partnerships | RequireAuth |
| `/songs` | Legacy "My Songs" page | RequireAuth |
| `/songs/add` | Upload song (standard + special) | RequireAuth |
| `/event-submissions` | Submit songs to events | RequireAuth |
| `/sessions` | Session list | RequireAuth |
| `/events` | Event list | RequireAuth |
| `/events/:id` | Event detail | RequireAuth |
| `/admin` | Redirects to `/admin/events` | AdminGuard |
| `/admin/:section` | Admin dashboard (events, sessions, songs, users, test checkin, …) | AdminGuard |
| `/manager` | Redirects to `/manager/active-sessions` | ManagerGuard |
| `/manager/:section` | Manager tools (active sessions, event songs, upload-for, checkin-for, guide) | ManagerGuard |

There is no top-level `/partners` route — partner records are managed on My Profile (`/my-profile`). Help content about partners lives at `/how-it-works/partners`. `/songs`, `/sessions`, `/events`, and `/events/:id` are reachable but absent from all navigation (legacy/deep links).

## Environment

- **API**: `DATABASE_URL`, `CLERK_JWKS_URL`, `CORS_ORIGINS`, `PORT`, `TICK_SECRET`, `SENTRY_DSN`, `DB_POOL_MAX` (optional, defaults to 20), `DB_CONNECT_TIMEOUT` (optional, defaults to 10 s), `DB_IDLE_TIMEOUT` (optional, defaults to 30 s). Google Drive vars required for song upload: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_DRIVE_PARENT_FOLDER_ID`.
- **App**: `VITE_API_URL` (defaults to dev proxy), `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN` (optional).

See `.env.example` in each app for the complete list.

## Testing

Both packages use Vitest. The API runs Node-environment unit and route tests against a chained mock of the Drizzle client. The app runs pure-function tests in Node and component tests in jsdom (opt-in per file via `// @vitest-environment jsdom`).

Coverage is broad on the API surface (route handlers, queue logic, admission rules, song upload, run history, admin endpoints, middleware) and on the most critical frontend paths (NavBar visibility, FloorTrialsPage filtering, SessionDetailPage queue + check-in block, SongsPage, the api client, useAuthMe, RequireAuth/AdminGuard/ManagerGuard, LandingPage, MyProfilePage partners section).

To add new tests, follow the patterns already in place — see `apps/api/src/test/mocks.ts` for the chained-mock helper and `apps/app/src/test/setup.ts` for the jsdom-conditional Testing Library setup.

## Observability

Both services initialize Sentry SDKs and are live in production: `SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (app) are managed in Doppler and synced to Railway / Cloudflare Pages. Locally the SDKs no-op when no DSN is configured. The API additionally writes structured logs via `common-typescript-utils`'s `createLogger`. Every route handler that maps an exception to an HTTP error response logs the underlying cause with a route-specific event name (e.g. `queue_withdraw_failed`, `checkin_create_failed`, `auth_sync_failed`) so production failures are debuggable without losing the user-facing 4xx/5xx status. Unhandled errors are caught by `app.onError` and forwarded to both Sentry and the structured logger.

Operational notes (rate limits, spike protection, release tagging) are tracked in [`BACKLOG.md`](BACKLOG.md#sentry--operational-notes).

## Versioning

`main` uses [semantic-release](https://semantic-release.gitbook.io/) with Conventional Commits; the changelog and root `package.json` version are updated automatically on release.

## License

Private — All rights reserved.
