# deejaytools-com

Web app for [deejaytools.com](https://deejaytools.com): a West Coast Swing routine and floor-trial management platform.

The API it talks to lives in [`deejaytools-api`](https://github.com/mini-app-polis/deejaytools-api/blob/main/). Domain/contract schemas are kept as a copy in [`src/schemas`](src/schemas/index.ts) (imported as `@/schemas`); the API keeps its own copy, and both must change together when the contract does.

Shared generic helpers come from the [`common-typescript-utils`](https://www.npmjs.com/package/common-typescript-utils) package on npm.

## Stack

| Layer | Technology |
|-------|------------|
| Package manager | pnpm 9 |
| Language | TypeScript (strict), ES modules |
| App | Vite, React 19, Tailwind 4, React Router 7, Clerk, shadcn/ui, react-hook-form |
| Tests | Vitest, React Testing Library + jsdom |
| Observability | Sentry (browser) |
| Hosting | Cloudflare Pages |
| CI | GitHub Actions: typecheck → lint → test:coverage → build |
| Release | semantic-release on `main` (Conventional Commits) |

## Developer setup

**Prerequisites:** Node.js 22+, pnpm 9 (`npm install -g pnpm`).

```bash
pnpm install
cp .env.example .env.local   # fill in VITE_CLERK_PUBLISHABLE_KEY; VITE_API_URL defaults to http://localhost:3001
pnpm dev                     # http://localhost:5173 — proxies /v1 to VITE_API_URL
```

Run the API locally from [`deejaytools-api`](https://github.com/mini-app-polis/deejaytools-api/blob/main/), or point `VITE_API_URL` at a deployed instance.

```bash
pnpm build          # production build to dist/
pnpm preview        # serve the production build locally
pnpm typecheck      # strict tsc
pnpm lint           # eslint
pnpm test           # vitest once
pnpm test:coverage  # with coverage
```

## Pages

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
| `/admin/:section` | Admin dashboard (events, sessions, run history, songs, users, test checkin, …) | AdminGuard |
| `/manager` | Redirects to `/manager/active-sessions` | ManagerGuard |
| `/manager/:section` | Manager tools (active sessions, event songs, upload-for, checkin-for, guide) | ManagerGuard |

There is no top-level `/partners` route — partner records are managed on My Profile (`/my-profile`). Help content about partners lives at `/how-it-works/partners`. `/songs`, `/sessions`, `/events`, and `/events/:id` are reachable but absent from all navigation (legacy/deep links).

## Environment

`VITE_API_URL` (defaults to dev proxy target `http://localhost:3001`), `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN` (optional). See `.env.example`.

## Testing

Pure-function tests run in Node; component tests opt into jsdom per file via `// @vitest-environment jsdom`. See `src/test/setup.ts` for the jsdom-conditional Testing Library setup.

`pnpm test:contract` runs the live contract suite against a development API — every endpoint in `src/api/endpoints.ts`, validated against its schema. It needs `CONTRACT_API_URL`, `CONTRACT_CLERK_SECRET_KEY` (a dev-instance `sk_test_` key) and `CONTRACT_USER_ID` (an admin in that environment), and refuses production. See [ADR-002](docs/decisions/ADR-002-api-contract.md).

## Observability

Browser Sentry is live in production (`VITE_SENTRY_DSN`, managed in Doppler and synced to Cloudflare Pages); the SDK no-ops locally without a DSN. See [`docs/decisions/ADR-001-browser-observability-stack.md`](docs/decisions/ADR-001-browser-observability-stack.md).

## Docs

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — workflow, commits, where code goes
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — frontend structure
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

## Versioning

`main` uses [semantic-release](https://semantic-release.gitbook.io/) with Conventional Commits; `CHANGELOG.md` and `package.json` `version` are updated automatically on release. The version is stamped into the bundle at build time (nav bar + Sentry release).

## License

Private — All rights reserved.
