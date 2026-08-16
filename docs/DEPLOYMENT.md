# Deployment

How deejaytools.com is built, released, and run in production. This doc covers **Railway (API)** and **Cloudflare Pages (web app)** only — there is no single “deploy button” in this repository.

---

## Topology

Two separate services, two separate Git integrations:

| Surface | Host | What deploys it |
|---------|------|-----------------|
| **API** (`apps/api`) | Railway | Railway’s GitHub integration watches the repo and builds/deploys the API service |
| **Web app** (`apps/app`) | Cloudflare Pages | Cloudflare’s GitHub integration watches the repo and builds/deploys the frontend |

**GitHub Actions does not deploy anything.** The `ci.yml` workflow runs verify (typecheck, lint, tests, builds) and semantic-release on `main`. It never pushes to Railway, never triggers Cloudflare, and never runs database migrations against production.

If you are looking for a deploy workflow in `.github/workflows/`, you will not find one — that is intentional.

```
  git push ──┬──► GitHub Actions (CI)     typecheck / lint / test / build / release
             │
             ├──► Railway (API)          NIXPACKS build → migrate → start
             │
             └──► Cloudflare Pages (app)  dashboard-configured build → static assets
```

---

## Railway (API)

Configuration lives at the **monorepo root** in `railway.toml` (not under `apps/api/`).

### `railway.toml` (full file)

```toml
# Railway deployment config for the deejaytools-com monorepo.
# The api app (apps/api) is the service deployed to Railway.
# The web app (apps/app) deploys separately to Cloudflare Pages.
#
# Build and migration tooling (typescript, drizzle-kit) lives in
# apps/api `dependencies` rather than devDependencies so that it
# installs unconditionally under Railway's default NODE_ENV=production,
# which causes pnpm to skip devDependencies. tsx/vitest/xlsx/@types/*
# remain devDependencies — they are only needed for local dev and
# tests, neither of which run on Railway.

[build]
builder = "NIXPACKS"
buildCommand = "pnpm --filter api build"

[deploy]
# Run pending Drizzle migrations before the service starts (ADR-001).
startCommand = "pnpm --filter api db:migrate && pnpm --filter api start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### Key-by-key

| Key | Meaning |
|-----|---------|
| `[build].builder = "NIXPACKS"` | Railway auto-detects Node/pnpm and runs the build in a Nixpacks container. |
| `[build].buildCommand` | Compiles `@deejaytools/schemas`, then `tsc` for the API (`apps/api`’s `build` script). Does **not** run migrations. |
| `[deploy].startCommand` | **Two steps chained with `&&`:** (1) apply pending Drizzle migrations, (2) start the Node server. See below. |
| `[deploy].healthcheckPath` | Railway polls `GET /health` after start. |
| `[deploy].healthcheckTimeout` | Seconds to wait for a healthy response before marking the deploy failed (30 s). |
| `[deploy].restartPolicyType` | Restart the container if the process exits non-zero. |
| `[deploy].restartPolicyMaxRetries` | Cap automatic restarts at 3. |

There is **no Railway cron** defined in this file. Session ticks are driven by an **in-process scheduler** in the API container (see `TICK_INTERVAL_MS` below). `GET /internal/tick` is a manual override, not a scheduled job.

### Migrations before start (ADR-001)

`startCommand` runs `pnpm --filter api db:migrate && pnpm --filter api start`.

**Why:** Production `DATABASE_URL` lives on Railway, not in CI. Running migrations from the deploy container keeps credentials off the GitHub Actions runner and applies schema changes in the same network/runtime as the service that needs them. Documented in [`apps/api/docs/decisions/ADR-001-drizzle-migrations-at-deploy.md`](../apps/api/docs/decisions/ADR-001-drizzle-migrations-at-deploy.md).

**Consequence:** If `db:migrate` fails, the `&&` chain stops and **`start` never runs**. Railway marks the deploy failed and **the previous healthy image keeps serving traffic**. You fix the migration (or roll back the commit) and redeploy — you do not get a half-started API on a broken schema.

CI deliberately does **not** run `db:migrate` against production.

### Packaging quirk: `typescript` and `drizzle-kit` in `dependencies`

In `apps/api/package.json`, `typescript`, `drizzle-kit`, and `@types/node` are listed under **`dependencies`**, not `devDependencies`.

**Why:** Railway sets `NODE_ENV=production`. Under pnpm, that **skips `devDependencies`**. The build step needs `tsc`; the start hook needs `drizzle-kit migrate`. If you “tidy” them into `devDependencies`, the Railway build or migrate step will fail with “command not found” or missing compiler errors.

`tsx`, `vitest`, and test-only tools correctly remain in `devDependencies` — they never run on Railway.

### Start command and Sentry bootstrap

From `apps/api/package.json`:

```json
"start": "node --import ./dist/instrument.js dist/index.js"
```

**Why `--import ./dist/instrument.js` first:** Sentry’s Node SDK registers OpenTelemetry instrumentation that must load **before** any other application module (DB pool, Hono, route handlers). If `instrument.js` is imported after those modules, `captureException` can silently drop events. See the comment block in `apps/api/src/instrument.ts` and [Sentry’s ESM install guide](https://docs.sentry.io/platforms/javascript/guides/node/install/esm/).

### Custom HTTP server: Fastly body drain

`apps/api/src/index.ts` wraps `@hono/node-server` with a custom `createServer` hook. **This is load-bearing — do not remove it when refactoring.**

Railway routes inbound traffic through **Fastly**, which applies an **idle write-timeout** on request bodies. If the server does async work (e.g. Clerk JWKS verification in `requireAuth`) before consuming the body, backpressure builds in Fastly’s buffer, the connection is closed, and the client sees **`TypeError: Failed to fetch`** with no HTTP status.

The fix: on every incoming TCP connection, **drain the full body into memory immediately**, stash it on `req.rawBody`, then hand off to Hono. `@hono/node-server` detects `rawBody` and uses it instead of re-reading the exhausted stream, so `c.req.parseBody()`, `c.req.json()`, etc. keep working.

This matters most for **multipart song uploads** and any authenticated POST with a body.

### SIGTERM graceful shutdown

On `SIGTERM` (Railway scale-down / redeploy):

1. Stop the in-process scheduler (`scheduler?.stop()`).
2. Log `sigterm_received`.
3. Call `server.close()` — stop accepting new connections, drain in-flight requests.
4. Start a **10 s hard-kill timer** (`sigterm_hard_kill` → `process.exit(1)`).
5. On clean drain: log `server_closed`, clear timer, `process.exit(0)`.

If requests hang past 10 s, the process exits anyway so Railway is not stuck waiting forever.

### Health checks

`GET /health` (`apps/api/src/app.ts`):

- Runs `SELECT 1` against Postgres.
- **200** `{ "status": "ok" }` when the DB is reachable.
- **503** `{ "status": "degraded", "detail": "db_unreachable" }` when the query throws.

Railway uses `healthcheckPath = "/health"` and `healthcheckTimeout = 30` from `railway.toml`. A deploy that starts but cannot reach the database will fail the health check and roll back to the previous image.

The server binds **`0.0.0.0`** (not `127.0.0.1`) so Railway’s proxy can reach it. Port comes from `PORT` (Railway-injected) or defaults to `3001` locally.

---

## Cloudflare Pages (web app)

**Honest state of this repo:** there is **no** Cloudflare Pages configuration checked in.

Not present:

- `wrangler.toml`
- `public/_redirects` or `dist/_redirects`
- `public/_headers` or `_routes.json`
- A GitHub Actions workflow that deploys to Cloudflare

Build command, output directory, root directory, environment variables, and branch filters are configured in the **Cloudflare Pages dashboard** (and/or an external secrets manager such as Doppler that syncs into Pages).

### TODO — copy from Cloudflare dashboard into this doc

When you have dashboard access, fill in this block so the repo is the source of truth:

```markdown
<!-- TODO: Cloudflare Pages settings (from dashboard → project → Settings → Builds & deployments) -->

| Setting | Value |
|---------|-------|
| Production branch | ??? |
| Root directory | ??? (likely repo root or `apps/app`) |
| Build command | ??? (likely `pnpm install && pnpm --filter app build`) |
| Build output directory | ??? (likely `apps/app/dist`) |
| Node.js version | ??? |
| Environment variables (production) | VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY, VITE_SENTRY_DSN |
| Preview deployments | enabled/disabled ??? |
| Custom domain | deejaytools.com / www ??? |
```

### SPA routing / deep links

With **no `_redirects` file** in the repo, deep links such as `/sessions/:id` or `/admin/events` rely on **Cloudflare Pages’ default SPA behaviour** (serving `index.html` for unknown paths so React Router can handle routing client-side). Historical commits show `_redirects` / `404.html` were tried and removed in favour of this default — do not re-add redirect files without verifying current Pages behaviour.

---

## Build-time version injection (frontend)

`apps/app/vite.config.ts` reads the **monorepo root** `package.json` `version` field (bumped by semantic-release) and defines:

```ts
"import.meta.env.VITE_APP_VERSION": JSON.stringify(rootPkg.version)
```

That value:

- Appears in the nav bar (`NavBar.tsx` reads root `package.json` at build time).
- Is passed to Sentry as the browser **release** tag in `apps/app/src/lib/instrument.ts`.

Without it, frontend errors group under an unknown release in Sentry.

---

## CI and release (GitHub Actions)

File: `.github/workflows/ci.yml`

### `verify` job (every push and PR to `main`)

Step order:

1. `actions/checkout@v6` (`fetch-depth: 0`)
2. `pnpm/action-setup@v5`
3. `actions/setup-node@v6` (Node **22**, pnpm cache)
4. `pnpm install`
5. `pnpm typecheck`
6. `pnpm lint`
7. `pnpm -r test:coverage`
8. `pnpm --filter api build`
9. `pnpm --filter app build`

**CI does not deploy. CI does not run migrations.**

### `release` job (push to `main` only)

Runs only when: `github.ref == refs/heads/main && github.event_name == push`, after `verify` succeeds.

Steps: checkout → pnpm setup → Node 22 → `pnpm install` → `pnpm exec semantic-release` with `GITHUB_TOKEN`.

`.releaserc.json` plugins: commit analyzer → release notes → `CHANGELOG.md` → bump root `package.json` version (no npm publish) → git commit assets → GitHub release.

Releasing a version **does not** by itself deploy Railway or Cloudflare — those platforms react to the **git push** (including the release bot commit) through their own integrations.

---

## Environment variables

### Railway (API) — set in Railway dashboard / linked secrets

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | **Yes** | Postgres connection string (Railway Postgres plugin or external). |
| `CLERK_JWKS_URL` | **Yes** | Clerk JWKS URL for JWT verification. |
| `CORS_ORIGINS` | **Yes** | Comma-separated browser origins (e.g. `https://deejaytools.com,https://www.deejaytools.com`). |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | **Yes** (for uploads) | Drive service account client email. |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | **Yes** (for uploads) | PEM private key; use `\n` escapes in the env var — code unescapes with `.replace(/\\n/g, "\n")`. |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | **Yes** (for uploads) | Root Drive folder ID; folder must be **shared with the service account**. |
| `PORT` | Auto | Injected by Railway; do not hardcode in production. |
| `NODE_ENV` | Auto / set | Typically `production` on Railway. |
| `SENTRY_DSN` | Optional | Enables API Sentry when set. |
| `BREVO_API_KEY` | Optional | Feedback email via Brevo; when unset, feedback still returns 201. |
| `TICK_SECRET` | Optional | When **defined** (even `""`), `GET /internal/tick` requires matching `x-tick-secret`. When **unset**, endpoint is **completely open**. |
| `TICK_INTERVAL_MS` | Optional | Scheduler interval ms (default `30000`). |
| `DISABLE_SCHEDULER` | Optional | Only the literal string `"1"` disables the in-process scheduler. |
| `DB_POOL_MAX` | Optional | Default `20`. Stay under Railway Postgres connection limits. |
| `DB_CONNECT_TIMEOUT` | Optional | Default `10` (seconds). |
| `DB_IDLE_TIMEOUT` | Optional | Default `30` (seconds). |

### Cloudflare Pages — set in Pages dashboard (or Doppler → Pages sync)

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_URL` | **Yes** | Public API base URL (e.g. `https://api.deejaytools.com` or Railway public URL). |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Yes** | Clerk publishable key for the production Clerk instance. |
| `VITE_SENTRY_DSN` | Optional | Browser Sentry; no-op when unset. |

### Platform-injected (do not set manually unless debugging)

| Variable | Where | Purpose |
|----------|-------|---------|
| `RAILWAY_DEPLOYMENT_ID` | Railway | Sentry release tag on API (`instrument.ts`), fallback after `npm_package_version`. |
| `npm_package_version` | Node / package context | Sentry release fallback on API. |
| `MODE` | Vite build | `"production"` or `"development"` — Sentry environment in the browser. |
| `VITE_APP_VERSION` | Vite `define` in `vite.config.ts` | Root `package.json` version at build time; Sentry release + nav display. Not an env var you set in `.env` — injected at compile time. |

---

## First deploy to a new environment (runbook)

Do these **in order**:

1. **Postgres** — Provision a database; note the connection string.
2. **Clerk** — Create/configure a Clerk application; note JWKS URL and publishable key.
3. **Google Drive** — Create a service account, enable Drive API, download key, create/share parent folder with the service account email.
4. **Railway service** — Connect the GitHub repo; ensure `railway.toml` is picked up; set API env vars (`DATABASE_URL`, `CLERK_JWKS_URL`, `CORS_ORIGINS`, Google vars, optional Sentry/Brevo/TICK_*).
5. **First Railway deploy** — Push to the connected branch. Build runs `pnpm --filter api build`; start runs **migrate then start**. Confirm deploy succeeds and `GET /health` returns `{ "status": "ok" }`.
6. **Note the public API URL** — Railway-generated hostname or custom domain.
7. **Cloudflare Pages project** — Connect the same repo; configure build command and output directory (see TODO block above); set `VITE_API_URL` to the Railway URL, `VITE_CLERK_PUBLISHABLE_KEY`, optional `VITE_SENTRY_DSN`.
8. **CORS** — Add the Pages URL (and custom domain) to Railway `CORS_ORIGINS`; redeploy API if needed.
9. **Clerk** — Add production frontend URL to Clerk allowed origins / redirect URLs.
10. **Smoke test** — Open the Pages URL, sign in, confirm `AuthSync` (`POST /v1/auth/sync`) succeeds, load a authenticated page, upload a small test song if Drive is configured.
11. **Scheduler** — In Railway logs, grep for `scheduler_started` after deploy. Optionally hit `GET /internal/tick` with `x-tick-secret` if `TICK_SECRET` is set.
12. **Sentry** — Confirm both projects receive a test error (optional) and releases are tagged.

---

## Related docs

- [`apps/api/README.md`](../apps/api/README.md) — API env vars and local run
- [`apps/app/docs/ARCHITECTURE.md`](../apps/app/docs/ARCHITECTURE.md) — frontend structure
- [`apps/api/docs/decisions/ADR-001-drizzle-migrations-at-deploy.md`](../apps/api/docs/decisions/ADR-001-drizzle-migrations-at-deploy.md) — migration-at-deploy decision
