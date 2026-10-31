# deejaytools-com

Web app for [deejaytools.com](https://deejaytools.com): a West Coast Swing routine and floor-trial management platform.

The API it talks to lives in [`api-deejaytools`](https://github.com/mini-app-polis/api-deejaytools/blob/main/). Domain/contract schemas live in [`src/schemas`](src/schemas/index.ts) (imported as `@/schemas`); the live contract suite checks every API response against them.

## Stack

| Layer | Technology |
|-------|------------|
| Package manager | pnpm 9 |
| Language | TypeScript (strict), ES modules |
| App | Vite, React 19, Tailwind 4, React Router 7, Clerk, shadcn/ui, react-hook-form |
| Tests | Vitest, React Testing Library + jsdom; Playwright + axe-core (e2e) |
| Observability | Sentry (browser) |
| Hosting | Cloudflare Pages |
| CI | GitHub Actions: typecheck → lint → test:coverage → build, plus the fleet security workflow; the live contract suite and a post-deploy smoke test and e2e run (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)) |
| Release | semantic-release on `main` (Conventional Commits), through the fleet's shared release workflow |

## Developer setup

**Prerequisites:** Node.js 20 or later (`engines`; CI and Cloudflare Pages build on 22, the version in `.nvmrc`), pnpm 9 (`npm install -g pnpm`).

```bash
pnpm install
cp .env.example .env.local   # fill in DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY; DEEJAYTOOLS_API_DEV unset means the local API at http://localhost:3001
pnpm dev                     # http://localhost:5173 — proxies /v1 to DEEJAYTOOLS_API_DEV (default http://localhost:3001)
```

Run the API locally from [`api-deejaytools`](https://github.com/mini-app-polis/api-deejaytools/blob/main/), or point `DEEJAYTOOLS_API_DEV` at a deployed instance.

```bash
pnpm build          # production build to dist/
pnpm preview        # serve the production build locally
pnpm typecheck      # strict tsc
pnpm lint           # eslint
pnpm test           # vitest once
pnpm test:coverage  # with coverage (fails below the floor in vitest.config.ts)
pnpm test:contract  # live contract suite against a development API (see Testing)
pnpm test:e2e       # Playwright end-to-end suite against a deployed dev site (see Testing)
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
| `/event-submissions` | Pick an event to submit songs to | RequireAuth |
| `/event-submissions/:eventId` | Submit/remove songs for one event | RequireAuth |
| `/open-submissions` | Redirects to The Open's event page | RequireAuth |
| `/sessions` | Session list | RequireAuth |
| `/events` | Event list | public |
| `/events/:id` | Event detail | public read; entity roster signed-in only |
| `/my-events` | The events the caller is on the staff of, each linking to its portal | RequireAuth |
| `/events/:eventId/coordinator` | Coordinator portal: the event's submissions, read-only | EventRoleGuard (coordinator or richer) |
| `/events/:eventId/dj`, `/events/:eventId/dj/:section` | DJ portal: live queue, sessions, run history, check in and upload for a dancer, submissions, Drive folder | EventRoleGuard (DJ or richer) |
| `/events/:eventId/manage`, `/events/:eventId/manage/:section` | Event manager portal: the DJ sections plus the event's details and staff | EventRoleGuard (event manager) |
| `/admin` | Redirects to `/admin/events` | — |
| `/admin/:section` | Admin dashboard (events, sessions, run history, songs, users, test checkin, …) | AdminGuard |
| `/manager` | Redirects to `/manager/active-sessions` | — |
| `/manager/:section` | Manager tools (active sessions, event songs, upload-for, checkin-for, guide) | ManagerGuard |

There is no top-level `/partners` route — partner records are managed on My Profile (`/my-profile`). Help content about partners lives at `/how-it-works/partners`. `/songs` and `/sessions` are reachable but absent from the nav bar (deep links); `/events` is in the public nav. `ManagerGuard` admits admins only — the API has no global manager role; per-event staff roles open the portals under `/events/:eventId/…`.

## Environment

`DEEJAYTOOLS_API` / `DEEJAYTOOLS_API_DEV` (production-branch builds / everything else; unset locally means the dev proxy to `http://localhost:3001`), `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY`, `SENTRY_DSN_DEEJAYTOOLS` (optional). See `.env.example`.

## Testing

Pure-function tests run in Node; component tests opt into jsdom per file via `// @vitest-environment jsdom`. See `src/test/setup.ts` for the jsdom-conditional Testing Library setup.

`pnpm test` runs the unit and component tests; `pnpm test:coverage` runs them with coverage and fails below the thresholds in `vitest.config.ts`.

`pnpm test:contract` runs the live contract suite against a development API — every endpoint in `src/api/endpoints.ts`, validated against its schema. It needs `CONTRACT_API_URL`, `CONTRACT_CLERK_SECRET_KEY` (a dev-instance `sk_test_` key) and `CONTRACT_USER_ID` (an admin in that environment), and refuses production. See [ADR-0002](docs/decisions/ADR-0002-api-contract.md).

`pnpm test:e2e` runs the Playwright suite (`e2e/`, `playwright.config.ts`) in a real browser against a deployed dev site, signed in as the contract test user, including an axe-core accessibility scan of the main pages. It writes to the dev API and needs `E2E_BASE_URL`, `CLERK_PUBLISHABLE_KEY` (`pk_test_…`), `CLERK_SECRET_KEY` (`sk_test_…`), `CONTRACT_API_URL` and `CONTRACT_USER_ID`; run `pnpm exec playwright install chromium` once first. CI runs it after each deploy of `dev`.

## Observability

Browser Sentry is live in production (`SENTRY_DSN_DEEJAYTOOLS`, managed in Doppler and synced to Cloudflare Pages); the SDK no-ops locally without a DSN. See [`docs/decisions/ADR-0001-browser-observability-stack.md`](docs/decisions/ADR-0001-browser-observability-stack.md).

## Docs

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — workflow, commits, where code goes
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — frontend structure
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)

## Versioning

`main` uses [semantic-release](https://semantic-release.gitbook.io/) with Conventional Commits; `CHANGELOG.md` and `package.json` `version` are updated automatically on release. The version is read from `package.json` at build time: the nav bar shows it (and the short commit sha on non-production hosts), and Sentry tags browser events with it as the release.

## License

Private — All rights reserved.
