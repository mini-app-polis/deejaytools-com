# Deployment

How the deejaytools.com web app is built, released, and served from **Cloudflare Pages**. The API lives in [`api-deejaytools`](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md) and deploys separately to Railway.

---

## Topology

| Surface | Host | What deploys it |
|---------|------|-----------------|
| **Web app** (this repo) | Cloudflare Pages | Cloudflare's GitHub integration watches this repo and builds/deploys the frontend |
| **API** ([`api-deejaytools`](https://github.com/mini-app-polis/api-deejaytools/blob/main/)) | Railway | Railway's GitHub integration watches that repo |

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
| Environment variables | `DEEJAYTOOLS_API` (Production), `DEEJAYTOOLS_API_DEV` (Preview), `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY`, `SENTRY_DSN_DEEJAYTOOLS` (Doppler → Pages) |
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

### `test` job (pushes to `main`/`dev`, and PRs into them)

1. checkout (`fetch-depth: 0`) → pnpm setup → Node **22** (pnpm cache)
2. `pnpm install`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm test:coverage`
6. `pnpm build`

A parallel `security` job delegates to the fleet's shared workflow (`mini-app-polis/.github`).

### `release` job (push to `main` only)

Runs after `test` and `security` succeed: `npx` runs semantic-release and its plugins (installed for that step, not in `package.json`) with `GITHUB_TOKEN`. `.releaserc.json` updates `CHANGELOG.md`, bumps `package.json` `version` (no npm publish), commits them, and creates a GitHub release. Releasing does not by itself deploy — Pages reacts to the git push.

### `evaluate` job (after `release`)

Calls the fleet's shared `mini-app-polis/.github/.github/workflows/evaluate.yml@v3`, which asks api-kaianolevine-com to run evaluator-cog's conformance check against the released tree (ecosystem-standards CD-031). It needs the `CI_VALIDATOR_API_KEY` secret. It does not wait for findings — it only fails if the request does not land.

---

## Environment variables

Every variable this repository reads, for the app, the contract suite and
the end-to-end suite, is listed in [`.env.example`](../.env.example).

### Cloudflare Pages — set in Pages dashboard (or Doppler → Pages sync)

The app's variables are build-time: Vite maps them into the bundle, so a
change needs a redeploy. The production Pages environment needs
`DEEJAYTOOLS_API`; the preview environment `DEEJAYTOOLS_API_DEV`. Unsetting
`VITE_MAINTENANCE` also needs a redeploy.

### Platform-injected (do not set manually unless debugging)

| Variable | Where | Purpose |
|----------|-------|---------|
| `MODE` | Vite build | `"production"` or `"development"` — Sentry environment in the browser. |
| `VITE_APP_VERSION` | Vite `define` in `vite.config.ts` | Root `package.json` version at build time; Sentry browser release tag only (`instrument.ts`). Not an env var you set in `.env` — injected at compile time. |

---

## First deploy to a new environment (runbook)

Deploy the API first (see [`api-deejaytools`' README](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md#deployment)) and note its public URL. Then:

1. **Cloudflare Pages project** — Connect this repo; root directory `/`, build command `pnpm install && pnpm build`, output `dist`; set `DEEJAYTOOLS_API` (Production) and `DEEJAYTOOLS_API_DEV` (Preview) to the API URLs, `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY`, optional `SENTRY_DSN_DEEJAYTOOLS`.
2. **CORS** — Add the Pages URL (and custom domain) to the API's `DEEJAYTOOLS_CORS_ORIGINS` (shared Doppler config).
3. **Clerk** — Add the production frontend URL to Clerk allowed origins / redirect URLs.
4. **Smoke test** — Open the Pages URL, sign in, confirm `AuthSync` (`POST /v1/auth/sync`) succeeds, load an authenticated page, upload a small test song if Drive is configured.

---

## Related docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — frontend structure
- [`api-deejaytools` README](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md) — Railway side, migrations, API env vars
