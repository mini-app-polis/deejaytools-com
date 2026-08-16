# Contributing

How to work in this monorepo. Details live in the READMEs and docs linked below — this file is the map, not a second copy of them.

## Prerequisites and first-time setup

- **Node.js 22+**, **pnpm 9** (`packageManager` in root `package.json`).
- Clone, then from the repo root:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/app/.env.example apps/app/.env.local
# Fill DATABASE_URL, CLERK_JWKS_URL, VITE_CLERK_PUBLISHABLE_KEY at minimum
pnpm --filter api db:migrate
```

- **Run:** `pnpm dev:api` (port 3001), `pnpm dev:app` (port 5173).

Full stack notes, route inventory, and env var semantics:

- [`README.md`](README.md)
- [`apps/api/README.md`](apps/api/README.md)
- [`apps/app/docs/ARCHITECTURE.md`](apps/app/docs/ARCHITECTURE.md)

Deploy and ops: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).

---

## Commits and releases

We use [Conventional Commits](https://www.conventionalcommits.org/). On push to **`main`**, CI runs **`semantic-release`** (`.releaserc.json`) after verify succeeds.

### Prefixes that trigger a version bump

Default `@semantic-release/commit-analyzer` (Angular preset) — no custom overrides in this repo:

| Commit prefix | Version bump | Example |
|---------------|--------------|---------|
| `feat:` | **Minor** (`1.2.0` → `1.3.0`) | `feat: add manager event-songs export` |
| `fix:` | **Patch** | `fix: reject empty partner last name` |
| `perf:` | **Patch** | `perf: batch queue depth queries` |
| `feat!:` or footer `BREAKING CHANGE:` | **Major** | `feat!: remove legacy /music-history route` |
| `revert:` | **Patch** | `revert: feat: …` |

These **do not** cut a release by themselves: `docs:`, `chore:`, `style:`, `refactor:`, `test:`, `build:`, `ci:`.

Use imperative mood and a short scope when helpful: `fix(api): …`, `feat(app): …`.

### What the release job writes

Automatically on release:

- Root **`CHANGELOG.md`** (via `@semantic-release/changelog`)
- Root **`package.json` `version`** (via `@semantic-release/npm`, publish disabled)
- Git commit `chore(release): X.Y.Z` with those files
- GitHub Release

**Do not hand-edit `CHANGELOG.md` or bump `package.json` version in feature PRs** — the release bot will conflict. The app’s Sentry release tag and nav version string come from that root version at build time (`apps/app/vite.config.ts`).

---

## CI verify pipeline

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and PR. Reproduce a failure locally in **the same order**:

| CI step | Local equivalent |
|---------|------------------|
| 1. Install | `pnpm install` |
| 2. Typecheck | `pnpm typecheck` |
| 3. Lint | `pnpm lint` |
| 4. Tests + coverage | `pnpm -r test:coverage` |
| 5. API build | `pnpm --filter api build` |
| 6. App build | `pnpm --filter app build` |

**Why typecheck builds `@deejaytools/schemas` first:** root `typecheck` runs `pnpm --filter @deejaytools/schemas build` then typechecks other packages. Schemas compile to `packages/schemas/dist/`; API and app import **built** `.d.ts` / `.js` via the workspace export. Skipping the build leaves stale or missing types and CI fails even when source edits look fine.

CI does **not** deploy and does **not** run production migrations ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

---

## Where new code goes

| Change | Location | Also update |
|--------|----------|-------------|
| **New API route** | `apps/api/src/routes/<name>.ts` → mount in `apps/api/src/app.ts` | Route test alongside (`*.test.ts`); see [Testing](#testing) |
| **New frontend page** | `apps/app/src/pages/<Name>Page.tsx` → route + guard in `apps/app/src/pages/App.tsx` | Colocated `*.test.tsx` if UI behaviour matters |
| **Shared API/app type or Zod enum** | `packages/schemas/src/` → export from `index.ts` | Rebuild is picked up by `pnpm typecheck`; both apps depend on workspace package |
| **API-only helper** | `apps/api/src/lib/` or `apps/api/src/services/` | Unit test under same tree |
| **App-only helper** | `apps/app/src/lib/` or `apps/app/src/components/` | Pure libs: `*.test.ts` without jsdom |
| **Cross-project generic util** | **[`common-typescript-utils`](https://www.npmjs.com/package/common-typescript-utils)** (external npm), **not** this repo | Logger, `{ data, error }` envelopes, `verifyClerkToken`, generic Zod helpers — publish a new version there and bump the dependency in API/app |
| **Deejaytools domain enum/shape used by both tiers** | **`packages/schemas`** | Keeps API and frontend aligned without coupling domain to the generic npm package |

---

## Testing

Follow existing patterns; do not introduce a new test stack.

### API (`apps/api`)

- **Drizzle mock:** `apps/api/src/test/mocks.ts` — chained `createMockDb()`, queue SELECT results with **`enqueueSelectResult`**, auth stubs **`mockRequireAuth`** / **`mockRequireAdmin`**.
- **Route test templates** (from [`apps/api/README.md`](apps/api/README.md)):
  - `routes/checkins.test.ts` — authenticated mutation
  - `routes/admin-checkins.test.ts` — admin-only; cover 403 / 401 / 400 / 404
  - `routes/runs.test.ts` — complex JOIN read
  - `lib/queue/*.test.ts` — pure / lightly mocked helpers
- Run: `pnpm --filter api test` or `pnpm --filter api test:coverage`.

Add tests for new routes and non-trivial lib changes. Handlers that map errors to HTTP should log a route-specific `*_failed` event (see existing routes).

### App (`apps/app`)

- Global setup: **`apps/app/src/test/setup.ts`** — loads Testing Library only when `window` exists (jsdom).
- Component/page tests: **`// @vitest-environment jsdom`** at top of file; mock `@/api/client`, Clerk, and `sonner` like `SessionDetailPage.test.tsx`.
- Pure `lib/` tests: default **node** env (no jsdom directive).
- Run: `pnpm --filter app test` or `pnpm -r test:coverage` from root.

---

## Architecture Decision Records (ADRs)

Format and index: [`apps/api/docs/decisions/README.md`](apps/api/docs/decisions/README.md) (API) and [`apps/app/docs/decisions/README.md`](apps/app/docs/decisions/README.md) (frontend). Same template: **Context → Decision → Consequences**, status line, date.

**Naming:** `ADR-NNN-short-kebab-title.md` — **NNN** is a zero-padded three-digit sequence **per directory**, starting at `001` (API and app each have their own counter).

**Write an ADR when:**

- The decision has **lasting architectural tradeoffs** (deploy model, auth model, queue semantics, observability stack).
- You are **exempting** the repo from an ecosystem standard and need rationale on record (see existing ADR-001 migration-at-deploy, ADR-003 JWT-only).
- A future contributor would reasonably ask **“why not the obvious alternative?”**

**Skip an ADR for:** bug fixes, routine endpoints, refactors that follow established patterns, dependency bumps, copy changes — a good Conventional Commit and PR description is enough.

Add the new file to the **Index** section of the relevant `decisions/README.md`.

---

## Documentation expectations

Keep docs in sync with behaviour — reviewers should block merges that change contracts without doc updates.

| Kind of change | Update |
|----------------|--------|
| New or changed API endpoint | [`apps/api/docs/API.md`](apps/api/docs/API.md) |
| DB table/column/convention | [`apps/api/docs/SCHEMA.md`](apps/api/docs/SCHEMA.md) + Drizzle migration (`pnpm --filter api db:generate`) |
| Auth / roles / guards | [`apps/api/docs/AUTHENTICATION.md`](apps/api/docs/AUTHENTICATION.md) |
| New **env var** | Matching **`apps/api/.env.example`** and/or **`apps/app/.env.example`**, plus env tables in **`apps/api/README.md`** (and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) if production-facing) |
| Frontend structure / conventions | [`apps/app/docs/ARCHITECTURE.md`](apps/app/docs/ARCHITECTURE.md) |
| **User-visible behaviour** (check-in flow, uploads, queue rules) | In-app copy on [`/how-it-works`](apps/app/src/pages/HowItWorksPage.tsx) — users read this, not the API doc |
| Significant architecture call | ADR in `apps/api/docs/decisions/` or `apps/app/docs/decisions/` |

---

## Pull requests

- Target **`main`**. Ensure the verify pipeline passes locally before pushing.
- One logical change per PR when possible; link related issues if any.
- For release-visible work, use `feat:` / `fix:` prefixes so semantic-release can version correctly.

Questions about deployment or production errors: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).
