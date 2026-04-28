# deejaytools-com-app

Vite + React frontend for [deejaytools.com](https://deejaytools.com): a
West Coast Swing routine and floor-trial management platform. Part
of the `deejaytools-com` monorepo at `apps/app/`.

## Stack

| Layer | Technology |
|-------|------------|
| Build | Vite 6 |
| Framework | React 19, React Router 7 |
| Styling | Tailwind 3, shadcn/ui (Radix primitives), `class-variance-authority` |
| Forms | react-hook-form + Zod resolvers |
| Auth | Clerk session JWTs (verified in browser, attached to API calls) |
| Observability | `@sentry/react` (browser-side errors), live via `VITE_SENTRY_DSN` from Doppler → Cloudflare Pages — see `apps/app/docs/decisions/ADR-001-browser-observability-stack.md` |
| Tests | Vitest (Node + jsdom), React Testing Library, user-event |
| Deployment | Cloudflare Pages |

## Routing

The router is defined in `src/pages/App.tsx`. Paths are gated as follows:

| Path | Page | Auth |
|------|------|------|
| `/` | `LandingPage` — hero, public legacy-music search, sign-in CTAs | public |
| `/floor-trials` | `FloorTrialsPage` — active and upcoming sessions, soonest first | public |
| `/check-in` | back-compat alias → `FloorTrialsPage` | public |
| `/sessions` | `SessionsPage` — full sessions list (chrono-bucketed) | signed in |
| `/sessions/:id` | `SessionDetailPage` — session header, queue (Active / Priority / Standard), check-in block at top + bottom | public read; signed-in to check in |
| `/events` | `EventsPage` | signed in |
| `/events/:id` | `EventDetailPage` | signed in |
| `/partners` | `PartnersPage` — "My Partners" CRUD | signed in |
| `/songs` | `AddSongPage` / `SongsPage` — upload + claim-from-history | signed in |
| `/admin` | `AdminPage` — events, sessions, live queue, run history, test inject tabs | admin only |

Auth gates:

- `RequireAuth` wraps signed-in-only routes; unauthenticated visitors get redirected to `/`.
- `AdminGuard` wraps `/admin`; non-admins get redirected to `/`. While `useAuthMe` is fetching, it shows a skeleton instead of redirecting prematurely.

## API client

`src/api/client.ts` exposes `useApiClient()`, a memoized hook with
`get`, `post`, `postForm`, `patch`, `del`. It:

- attaches `Authorization: Bearer <token>` from Clerk when available
  (no header for signed-out callers — needed for the public endpoints);
- unwraps `{ data, meta }` envelopes from successful responses;
- throws an `Error` with the server's `error.message` when the response
  is an error envelope, or `Request failed: <status>` if the body is
  malformed.

The `del` helper is intentionally void-returning; `del<T>` callers
should use one of the other methods if they need a body back.

## Environment variables

Copy `.env.example` to `.env` and fill in:

- `VITE_API_URL` — defaults to `""` (which uses the dev proxy in
  `vite.config.ts` to forward `/v1/*` to the API). Set this for
  production / preview deploys.
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk frontend publishable key.
- `VITE_SENTRY_DSN` — set in Doppler `prd` and synced to Cloudflare
  Pages. When set, browser errors flow to Sentry. Unset locally so dev
  errors don't pollute the production project.

## Running locally

Prerequisites:
- **Node 22** — match the API to keep tooling consistent.
- **pnpm 9+**.
- The API running on `http://localhost:3001` (the dev proxy points there).

```bash
pnpm install                # install all workspace dependencies
pnpm --filter app dev       # http://localhost:5173, watch mode
pnpm --filter app build     # production bundle
pnpm --filter app preview   # serve the production bundle locally
```

## Tests

```bash
pnpm --filter app test           # run the vitest suite once
pnpm --filter app test:coverage  # with coverage report
```

The default vitest environment is `node` so pure-function tests stay
fast and don't load the DOM. Component tests opt into jsdom with a
file-level pragma:

```ts
// @vitest-environment jsdom
```

`src/test/setup.ts` detects the environment at runtime and only loads
Testing Library matchers (`@testing-library/jest-dom`) plus the
`afterEach(cleanup)` hook when running under jsdom — keeping pure-fn
tests fast.

What's tested:

- **Pure helpers** (`lib/sessionFormat.ts`, `lib/chronoSort.ts`) — formatting, locale handling, bucket-sort ordering.
- **API client** (`api/client.ts`) — token attachment, envelope unwrap, error mapping, memoization.
- **Auth surface** — `useAuthMe` hook (all four auth states + failed-fetch toast), `RequireAuth` and `AdminGuard` redirect behavior.
- **NavBar** — auth-state-aware visibility (signed-out / user / admin) and logo rendering.
- **Pages** — `FloorTrialsPage` filtering and ordering, `SessionDetailPage` queue split + check-in block in every disabled-reason branch, `SongsPage` / `AddSongPage` claim-from-history flow, `LandingPage` debounced legacy-search, `PartnersPage` list rendering.

What's intentionally not tested:

- shadcn/ui primitives in `components/ui/*` (third-party).
- `Layout`, `AuthSync`, `main.tsx`, `App.tsx` — pure layout / router / effect glue.
- `lib/utils.ts` — `cn()` is a clsx + twMerge passthrough.
- The full `AdminPage` interaction surface — the page is large and tab-heavy; the API endpoints behind every tab are tested, and manual QA covers the UI side.

## Adding a new component test

1. Add the file at `src/components/Foo.test.tsx` or `src/pages/FooPage.test.tsx`.
2. Add `// @vitest-environment jsdom` as the first line.
3. Use `vi.mock("@clerk/clerk-react", ...)` for any Clerk wrappers — drive `<SignedIn>` / `<SignedOut>` with a mutable test flag.
4. Use `vi.hoisted(() => ...)` if your mock factory needs to reference fns you'll call from inside `it()` blocks (`vi.mock` factories are hoisted above imports).
5. For pages that use `useApiClient`, build the mock client object **once** at module scope and return the same reference from the hook — pages with `useEffect([api])` will re-fire forever otherwise.
