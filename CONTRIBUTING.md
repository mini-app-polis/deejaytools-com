# Contributing

How to work in this repo. Details live in the README and docs linked below — this file is the map, not a second copy of them.

## Prerequisites and first-time setup

- **Node.js 22+**, **pnpm 9** (`packageManager` in `package.json`).
- Clone, then:

```bash
pnpm install
cp .env.example .env.local
# Fill VITE_CLERK_PUBLISHABLE_KEY at minimum
```

- **Run:** `pnpm dev` (port 5173). The Vite dev server proxies `/v1` to `VITE_API_URL` (default `http://localhost:3001`) — run the API from [`deejaytools-api`](https://github.com/mini-app-polis/deejaytools-api/blob/main/) or point `VITE_API_URL` at a deployed one.

Structure and conventions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
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
| footer `BREAKING CHANGE:` | **Major** | see [Forcing a major](#forcing-a-major) |
| `revert:` | **Patch** | `revert: feat: …` |

These **do not** cut a release by themselves: `docs:`, `chore:`, `style:`, `refactor:`, `test:`, `build:`, `ci:`.

Use imperative mood and a short scope when helpful: `fix(upload): …`, `feat(manager): …`.

### Forcing a major

A **`BREAKING CHANGE:` footer is the only way** to cut a major in this repo:

```
feat: replace the event submission contract

BREAKING CHANGE: GET /v1/event-song-submissions now returns division groups
instead of a flat list.
```

Blank line before the footer, uppercase, and a **space** — not a hyphen. The
header type does not matter: `fix:` with that footer still cuts a major.

**`feat!:` does not work here, and it fails silently.** The pinned parser
(`conventional-changelog-angular@8.3.0`) uses

```js
headerPattern: /^(\w*)(?:\((.*)\))?: (.*)$/,
noteKeywords: ['BREAKING CHANGE'],
```

which has no slot for `!`. A `feat!:` header does not match at all, so the
commit is not even recognised as a `feat` — it produces **no release**, not a
minor. `BREAKING-CHANGE:` (hyphen) likewise misses `noteKeywords` and falls
back to whatever the header alone earns.

Behaviour of the installed analyzer, not the spec:

| Commit | Result |
|--------|--------|
| `feat!: …` | **no release** |
| `feat(app)!: …` | **no release** |
| `feat: …` + `BREAKING CHANGE:` footer | **major** |
| `fix: …` + `BREAKING CHANGE:` footer | **major** |
| `feat: …` + `BREAKING-CHANGE:` footer | minor |

If the pinned preset is ever upgraded to one with a `breakingHeaderPattern`,
re-check this table — `!` support is what changes between preset versions.

### What the release job writes

Automatically on release:

- Root **`CHANGELOG.md`** (via `@semantic-release/changelog`)
- Root **`package.json` `version`** (via `@semantic-release/npm`, publish disabled)
- Git commit `chore(release): X.Y.Z` with those files
- GitHub Release

**Do not hand-edit `CHANGELOG.md` or bump `package.json` version in feature PRs** — the release bot will conflict. The app’s Sentry release tag and nav version string come from that root version at build time (`vite.config.ts`).

---

## CI verify pipeline

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and PR. Reproduce a failure locally in **the same order**:

| CI step | Local equivalent |
|---------|------------------|
| 1. Install | `pnpm install` |
| 2. Typecheck | `pnpm typecheck` |
| 3. Lint | `pnpm lint` |
| 4. Tests + coverage | `pnpm test:coverage` |
| 5. Build | `pnpm build` |

CI does **not** deploy ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

---

## Where new code goes

| Change | Location | Also update |
|--------|----------|-------------|
| **New page** | `src/pages/<Name>Page.tsx` → route + guard in `src/pages/App.tsx` | Colocated `*.test.tsx` if UI behaviour matters |
| **Helper** | `src/lib/` or `src/components/` | Pure libs: `*.test.ts` without jsdom |
| **API contract shape / domain enum** | `src/schemas/index.ts` (import as `@/schemas`) | This is a copy — the API keeps its own in `deejaytools-api/src/schemas`. Change both when the contract changes |
| **Cross-project generic util** | **[`common-typescript-utils`](https://www.npmjs.com/package/common-typescript-utils)** (external npm), **not** this repo | |

---

## Testing

Follow existing patterns; do not introduce a new test stack.

- Global setup: **`src/test/setup.ts`** — loads Testing Library only when `window` exists (jsdom).
- Component/page tests: **`// @vitest-environment jsdom`** at top of file; mock `@/api/client`, Clerk, and `sonner` like `SessionDetailPage.test.tsx`.
- Pure `lib/` tests: default **node** env (no jsdom directive).
- Run: `pnpm test` or `pnpm test:coverage`.

---

## Architecture Decision Records (ADRs)

Format and index: [`docs/decisions/README.md`](docs/decisions/README.md). Template: **Context → Decision → Consequences**, status line, date.

**Naming:** `ADR-NNN-short-kebab-title.md` — **NNN** is a zero-padded three-digit sequence starting at `001`.

**Write an ADR when:**

- The decision has **lasting architectural tradeoffs** (routing, auth flow, state management, observability stack).
- You are **exempting** the repo from an ecosystem standard and need rationale on record .
- A future contributor would reasonably ask **“why not the obvious alternative?”**

**Skip an ADR for:** bug fixes, routine endpoints, refactors that follow established patterns, dependency bumps, copy changes — a good Conventional Commit and PR description is enough.

Add the new file to the **Index** section of `docs/decisions/README.md`.

---

## Documentation expectations

| Kind of change | Update |
|----------------|--------|
| New **env var** | **`.env.example`** and the env table in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Frontend structure / conventions | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **User-visible behaviour** (check-in flow, uploads, queue rules) | In-app copy on [`/how-it-works`](src/pages/HowItWorksPage.tsx) — users read this, not the API doc |
| Significant architecture call | ADR in `docs/decisions/` |

---

## Pull requests

- Target **`main`**. Ensure the verify pipeline passes locally before pushing.
- One logical change per PR when possible; link related issues if any.
- For release-visible work, use `feat:` / `fix:` prefixes so semantic-release can version correctly.

Questions about deployment or production errors: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).
