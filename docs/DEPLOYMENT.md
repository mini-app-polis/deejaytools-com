# Deployment

How the deejaytools.com web app is built, released, and served from **Cloudflare Pages**. The API lives in [`api-deejaytools`](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md) and deploys separately to Railway.

---

## Topology

| Surface | Host | What deploys it |
|---------|------|-----------------|
| **Web app** (this repo) | Cloudflare Pages | Cloudflare's GitHub integration watches this repo and builds/deploys the frontend |
| **API** ([`api-deejaytools`](https://github.com/mini-app-polis/api-deejaytools/blob/main/)) | Railway | Railway's GitHub integration watches that repo |

**GitHub Actions does not deploy anything.** The workflows verify, release, and test what Pages has deployed — see [Workflows](#workflows-github-actions).

---

## Cloudflare Pages (web app)

There is **no** Cloudflare Pages configuration checked in:

- no `wrangler.toml`
- no `public/_redirects`, `public/_headers` or `_routes.json`
- no GitHub Actions workflow that deploys to Cloudflare

Build command, output directory, root directory, environment variables, and branch filters are configured in the **Cloudflare Pages dashboard** (and Doppler, which syncs into Pages).

### Dashboard settings

These live in the Pages dashboard (Settings → Builds & deployments), so this table is the repo's record of them — update it when the dashboard changes.

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Root directory | repo root (`/`) |
| Build command | `pnpm install && pnpm build` |
| Build output directory | `dist` |
| Node.js version | 22 (`.nvmrc`) |
| Environment variables | `DEEJAYTOOLS_API` (Production), `DEEJAYTOOLS_API_DEV` (Preview), `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY`, `SENTRY_DSN_DEEJAYTOOLS` (Doppler → Pages) |
| Preview deployments | enabled — `dev` publishes to the preview URL |
| Custom domain | `deejaytools.com` |

### SPA routing / deep links

With **no `_redirects` file** in the repo, deep links such as `/sessions/:id` or `/admin/events` rely on **Cloudflare Pages' default SPA behaviour**: it serves `index.html` for unknown paths and React Router handles the route client-side. The `site` workflow checks this on every deploy by loading `/events` directly. Verify current Pages behaviour before adding a redirect file.

---

## Build-time values

`vite.config.ts` maps these into the bundle with `define`:

| Value | Source | Used by |
|-------|--------|---------|
| `VITE_APP_VERSION` | Root `package.json` `version` (bumped by semantic-release) | Sentry release tag (`src/lib/instrument.ts`). Without it, browser errors group under an unknown release. |
| `VITE_COMMIT_SHA` | `CF_PAGES_COMMIT_SHA` on Pages, `git rev-parse` locally | Nav bar, on non-production hosts |
| `VITE_API_URL` | `DEEJAYTOOLS_API` when `CF_PAGES_BRANCH` is `main`, otherwise `DEEJAYTOOLS_API_DEV`; empty means same-origin through the dev-server proxy | `src/api/client.ts` and the direct `fetch` callers (ARCHITECTURE §3) |
| `VITE_CLERK_PUBLISHABLE_KEY` | `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY` | `ClerkProvider` in `src/main.tsx` |
| `VITE_SENTRY_DSN` | `SENTRY_DSN_DEEJAYTOOLS` | `src/lib/instrument.ts` |

The nav bar's version text comes from `NavBar.tsx` importing `package.json` directly, not from `VITE_APP_VERSION`; both read the same file at build time.

---

## Workflows (GitHub Actions)

| File | Runs on | What it does |
|------|---------|--------------|
| `ci.yml` | Pushes to `main`/`dev`, pull requests into them | `test`, `security`; on a push to `main` also `release` and `evaluate` |
| `site.yml` | Pushes to `dev`/`main` | Waits for the Cloudflare Pages deploy, smoke-tests it; on `dev`, then runs the e2e suite |
| `contract.yml` | Pushes to `dev`, `dev-api-deployed` dispatch, manual | Live contract suite against the development API |
| `promote.yml` | Pushes to `dev` | Keeps a `dev` → `main` pull request open while `dev` has something to release |
| `automerge.yml` | A finished `CI` run on another branch | Merges a pull request into `dev` once every check on it has passed |
| `agent.yml` | Manual dispatch (from task-manager-cog) | Implements one board task and opens a draft pull request into `dev` |

`promote.yml`, `automerge.yml`, `agent.yml`, and `ci.yml`'s `security`, `release` and `evaluate` jobs call shared workflows in `mini-app-polis/.github` (`@v3`); their logic is documented there.

### `ci.yml`

**`test` job:**

1. checkout (`fetch-depth: 0`) → pnpm setup → Node **22** (pnpm cache)
2. `pnpm install`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm test:coverage`
6. `pnpm build`, with a placeholder `pk_test_` Clerk publishable key (for `clerk.example.com`). Without a key `src/main.tsx` throws before rendering, so the bundler drops the app as unreachable and the build output is not the real bundle; with one, CI builds — and reports chunk sizes for — the bundle Pages ships. The CI bundle is never deployed.

**`security` job** runs in parallel: the fleet's shared security workflow (gitleaks, `pnpm audit`, semgrep, CycloneDX SBOM).

**`release` job** (push to `main` only) runs after `test` and `security` succeed. It calls the shared `release.yml@v3`, which runs semantic-release and its plugins from the fleet's shared lockfile (they are not in this repo's `package.json`). This repo's `.releaserc.json` updates `CHANGELOG.md`, sets `package.json` `version` (no npm publish), commits both as `chore(release): … [skip actions]`, and creates a GitHub release. Releasing does not by itself deploy — Pages reacts to the git push.

**`evaluate` job** (after `release`) calls the shared `evaluate.yml@v3`, which requests a conformance evaluation of the released tree (ecosystem-standards CD-031). It needs the `CI_VALIDATOR_API_KEY` secret. It does not wait for findings — it only fails if the request does not land.

### `site.yml`

**`smoke` job:** waits (up to 15 minutes) for the "Cloudflare Pages" check on the commit, following the branch to a newer commit that contains it if Pages skipped this one, then tests the deploy's own preview URL. It checks that the site and a deep link (`/events`) load, that the bundle carries the right Clerk key for the environment (`pk_test_` on `dev`, `pk_live_` on `main`, never the other) and the right API URL, and that the API answers `/health`. All read-only, so it is safe against production.

**`e2e` job** (`dev` only): runs `pnpm test:e2e` (Playwright, Chromium) against `https://dev.deejaytools-com.pages.dev`, signed in as the contract test user, and uploads the Playwright report on failure. It shares the `contract-dev-api` concurrency group with `contract.yml`: both write to the dev API and never run at once.

### `contract.yml`

Runs `pnpm test:contract` against the development API whenever either side of the contract changes: a push to `dev` here, or the `dev-api-deployed` dispatch api-deejaytools sends after a successful dev deploy (that run checks out `dev`). Skips with a warning when its configuration is missing. Configuration: secret `CONTRACT_CLERK_SECRET_KEY` (`sk_test_…`), variables `CONTRACT_API_URL` and `CONTRACT_USER_ID`; the e2e job uses the same three. See [ADR-0002](decisions/ADR-0002-api-contract.md).

---

## Environment variables

Every variable this repository reads, for the app, the contract suite and
the end-to-end suite, is listed in [`.env.example`](../.env.example).

### Cloudflare Pages — set in Pages dashboard (or Doppler → Pages sync)

The app's variables are build-time: Vite maps them into the bundle, so a
change needs a redeploy. The production Pages environment needs
`DEEJAYTOOLS_API`; the preview environment `DEEJAYTOOLS_API_DEV`.
`VITE_MAINTENANCE=1` replaces the app with a maintenance page; setting or
unsetting it also needs a redeploy.

### Platform-injected (do not set manually unless debugging)

| Variable | Where | Purpose |
|----------|-------|---------|
| `MODE` | Vite build | `"production"` or `"development"` — Sentry environment in the browser. |
| `CF_PAGES_BRANCH` | Cloudflare Pages build | `main` selects `DEEJAYTOOLS_API`; any other branch `DEEJAYTOOLS_API_DEV`. |
| `CF_PAGES_COMMIT_SHA` | Cloudflare Pages build | Short sha for the nav bar on non-production hosts. |

---

## First deploy to a new environment (runbook)

Deploy the API first (see [`api-deejaytools`' README](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md#deployment)) and note its public URL. Then:

1. **Cloudflare Pages project** — Connect this repo; root directory `/`, build command `pnpm install && pnpm build`, output `dist`; set `DEEJAYTOOLS_API` (Production) and `DEEJAYTOOLS_API_DEV` (Preview) to the API URLs, `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY`, optional `SENTRY_DSN_DEEJAYTOOLS`.
2. **CORS** — Add the Pages URL (and custom domain) to the API's `DEEJAYTOOLS_CORS_ORIGINS` (shared Doppler config).
3. **Clerk** — Add the production frontend URL to Clerk allowed origins / redirect URLs.
4. **Smoke test** — Open the Pages URL, sign in, confirm `AuthSync` (`POST /v1/auth/sync`) succeeds, load an authenticated page, upload a small test song if Drive is configured. For the `dev` and `main` branches, `site.yml` repeats the automated checks on every push.

---

## Related docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — frontend structure
- [`api-deejaytools` README](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md) — Railway side, migrations, API env vars
