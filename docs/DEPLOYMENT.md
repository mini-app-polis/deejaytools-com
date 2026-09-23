# Deployment

How the deejaytools.com web app is built, released, and served from **Cloudflare Pages**. The API lives in [`deejaytools-api`](https://github.com/mini-app-polis/deejaytools-api/blob/main/docs/DEPLOYMENT.md) and deploys separately to Railway.

---

## Topology

| Surface | Host | What deploys it |
|---------|------|-----------------|
| **Web app** (this repo) | Cloudflare Pages | Cloudflare's GitHub integration watches this repo and builds/deploys the frontend |
| **API** ([`deejaytools-api`](https://github.com/mini-app-polis/deejaytools-api/blob/main/)) | Railway | Railway's GitHub integration watches that repo |

**GitHub Actions does not deploy anything.** `ci.yml` runs verify (typecheck, lint, tests, build) and semantic-release on `main`.

---

## Cloudflare Pages (web app)

**Honest state of this repo:** there is **no** Cloudflare Pages configuration checked in.

Not present:

- `wrangler.toml`
- `public/_redirects` or `dist/_redirects`
- `public/_headers` or `_routes.json`
- A GitHub Actions workflow that deploys to Cloudflare

Build command, output directory, root directory, environment variables, and branch filters are configured in the **Cloudflare Pages dashboard** (and/or an external secrets manager such as Doppler that syncs into Pages).

### Dashboard settings

These live in the Pages dashboard (Settings → Builds & deployments), so this table is the repo's record of them — update it when the dashboard changes.

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Root directory | repo root (`/`) |
| Build command | `pnpm install && pnpm build` |
| Build output directory | `dist` |
| Node.js version | 22 (`.nvmrc`) |
| Environment variables | `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN` (Doppler → Pages) |
| Preview deployments | enabled — `dev` publishes to the preview URL |
| Custom domain | `deejaytools.com` |

### SPA routing / deep links

With **no `_redirects` file** in the repo, deep links such as `/sessions/:id` or `/admin/events` rely on **Cloudflare Pages’ default SPA behaviour** (serving `index.html` for unknown paths so React Router can handle routing client-side). Historical commits show `_redirects` / `404.html` were tried and removed in favour of this default — do not re-add redirect files without verifying current Pages behaviour.

---

## Build-time version injection (frontend)

`vite.config.ts` reads the repo-root `package.json` `version` field (bumped by semantic-release) and defines:

```ts
"import.meta.env.VITE_APP_VERSION": JSON.stringify(rootPkg.version)
```

That value:

- Appears in the nav bar (`NavBar.tsx` reads root `package.json` at build time).
- Is passed to Sentry as the browser **release** tag in `src/lib/instrument.ts`.

Without it, frontend errors group under an unknown release in Sentry.

---

## CI and release (GitHub Actions)

File: `.github/workflows/ci.yml`

### `test` job (every push, and PRs to `main`/`dev`)

1. checkout (`fetch-depth: 0`) → pnpm setup → Node **22** (pnpm cache)
2. `pnpm install`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm test:coverage`
6. `pnpm build`

A parallel `security` job delegates to the fleet's shared workflow (`mini-app-polis/.github`).

### `release` job (push to `main` only)

Runs after `test` and `security` succeed: `pnpm exec semantic-release` with `GITHUB_TOKEN`. `.releaserc.json` updates `CHANGELOG.md`, bumps `package.json` `version` (no npm publish), commits them, and creates a GitHub release. Releasing does not by itself deploy — Pages reacts to the git push.

### `evaluate` job (after `release`)

Calls the fleet's shared `mini-app-polis/.github/.github/workflows/evaluate.yml@v3`, which asks api-kaianolevine-com to run evaluator-cog's conformance check against the released tree (ecosystem-standards CD-031). It needs the `CI_VALIDATOR_API_KEY` secret. It does not wait for findings — it only fails if the request does not land.

---

## Environment variables

### Cloudflare Pages — set in Pages dashboard (or Doppler → Pages sync)

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_URL` | **Yes** | Public API base URL (e.g. `https://api.deejaytools.com` or Railway public URL). |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Yes** | Clerk publishable key for the production Clerk instance. |
| `VITE_SENTRY_DSN` | Optional | Browser Sentry; no-op when unset. |

### Platform-injected (do not set manually unless debugging)

| Variable | Where | Purpose |
|----------|-------|---------|
| `MODE` | Vite build | `"production"` or `"development"` — Sentry environment in the browser. |
| `VITE_APP_VERSION` | Vite `define` in `vite.config.ts` | Root `package.json` version at build time; Sentry browser release tag only (`instrument.ts`). Not an env var you set in `.env` — injected at compile time. |

---

## First deploy to a new environment (runbook)

Deploy the API first (see the [`deejaytools-api` runbook](https://github.com/mini-app-polis/deejaytools-api/blob/main/docs/DEPLOYMENT.md)) and note its public URL. Then:

1. **Cloudflare Pages project** — Connect this repo; root directory `/`, build command `pnpm install && pnpm build`, output `dist`; set `VITE_API_URL` to the API URL, `VITE_CLERK_PUBLISHABLE_KEY`, optional `VITE_SENTRY_DSN`.
2. **CORS** — Add the Pages URL (and custom domain) to the API's `CORS_ORIGINS` on Railway.
3. **Clerk** — Add the production frontend URL to Clerk allowed origins / redirect URLs.
4. **Smoke test** — Open the Pages URL, sign in, confirm `AuthSync` (`POST /v1/auth/sync`) succeeds, load an authenticated page, upload a small test song if Drive is configured.

---

## Related docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — frontend structure
- [`deejaytools-api` DEPLOYMENT.md](https://github.com/mini-app-polis/deejaytools-api/blob/main/docs/DEPLOYMENT.md) — Railway side, migrations, API env vars
