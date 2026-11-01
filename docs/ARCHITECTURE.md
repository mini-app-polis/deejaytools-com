# Frontend architecture

Orientation for a developer who has never opened this codebase. The app is a Vite-powered React SPA for floor-trial check-in, song uploads, and admin/manager tooling against the DeejayTools API.

---

## 1. Stack — and deliberate absences

| Layer | Choice | Notes |
|-------|--------|-------|
| Bundler | **Vite 8** | Dev server on `:5173`; proxies `/v1` → API (`vite.config.ts`) |
| UI | **React 19** | StrictMode; Sentry error hooks on `createRoot` |
| Routing | **React Router 7** | `BrowserRouter` in `App.tsx` |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`) | CSS variables for theme tokens; `tw-animate-css` |
| Auth | **Clerk** (`@clerk/clerk-react`) | JWT via `getToken()`; `ClerkProvider` in `main.tsx` |
| Server state | **TanStack Query** (`@tanstack/react-query`) | One `QueryClient` (`api/queryClient.ts`), provided in `main.tsx`; see §3 |
| Components | **shadcn/ui** | Radix primitives + Tailwind; config in `components.json` |
| Toasts | **sonner** | `<Toaster />` in `App.tsx` — not a shadcn toast |
| Forms | **react-hook-form** + **@hookform/resolvers** | `useForm` with a zod schema through `zodResolver` holds a form's fields and validation; forms still keeping one `useState` per field are moving over to it |
| Types | **`@/schemas`** (`src/schemas`) | API contract shapes — the app's own view of api-deejaytools' contract |
| Envelopes | **`src/api/envelope.ts`** | `{ data, meta }` / `{ error }` response typing |
| Observability | **@sentry/react** | Init in `lib/instrument.ts` before React mounts |

**What is intentionally *not* here:**

- **No Redux, Zustand, Jotai, or similar** — no store file, no slices, no selectors.

**Data fetching is moving onto TanStack Query** ([ADR-0003](decisions/ADR-0003-shared-data-fetching-with-tanstack-query.md)). Server state is read with `useEndpointQuery` and changed with `useEndpointMutation` (`api/queries.ts`, §3), which share one cache, deduplicate requests, cancel stale responses and refetch what a mutation invalidates. `useState` stays for what the user is editing and for UI state. Every page and section reads through the query hooks, and `useAuthMe`, `useDivisions` and `useApiVersion` are queries on the same client (§5). New code uses the query hooks — `SessionsPage` is the reference.

---

## 2. Directory map

```
src/
├── api/           HTTP client hook, endpoint catalog, and the TanStack Query layer over them
├── components/    Shared UI, guards, layout, domain sections
│   ├── help/      HelpLayout, HelpSection, HelpStillStuck, helpTopics
│   ├── manager/   ManagerGuideSection (manager ops guide tab)
│   ├── staff/     Per-event staff portals and their sections
│   └── ui/        shadcn primitives (+ the custom choice-group)
├── hooks/         Cross-cutting React hooks (auth profile, divisions, staff events, API version)
├── lib/           Pure helpers — no React, safe to import anywhere
├── pages/         Route-level screens (+ colocated *.test.tsx)
│   └── help/      Seven /how-it-works/* topic pages
├── contract/      Live contract suite (`pnpm test:contract`), and the catalog check against the API's OpenAPI snapshot
├── schemas/       zod schemas for API responses (`@/schemas`)
├── test/          Vitest global setup, `fx.*` fixtures, `renderWithQueryClient`
├── main.tsx       Entry: Sentry → ClerkProvider → QueryClientProvider → App
├── index.css      Tailwind + shadcn CSS variables
└── vite-env.d.ts  Vite client types (`import.meta.env`, etc.)
```

### `pages/`

One default-export component per route. Pages orchestrate fetching, local state, and composition of shared components. Tests live beside them (`FooPage.test.tsx`).

| File | Route / role |
|------|----------------|
| `App.tsx` | Route table (not a visible page) |
| `LandingPage.tsx` | `/` — marketing home, outside `Layout` |
| `FloorTrialsPage.tsx` | `/floor-trials`, `/check-in` |
| `HowItWorksPage.tsx` | `/how-it-works` — hub; legacy `#anchor` links redirect to sub-pages |
| `help/HelpFloorTrialsPage.tsx` | `/how-it-works/floor-trials` |
| `help/HelpSubmittingMusicPage.tsx` | `/how-it-works/submitting-music` |
| `help/HelpCheckingInPage.tsx` | `/how-it-works/checking-in` |
| `help/HelpTheQueuePage.tsx` | `/how-it-works/the-queue` |
| `help/HelpPartnersPage.tsx` | `/how-it-works/partners` |
| `help/HelpOnTheFloorPage.tsx` | `/how-it-works/on-the-floor` |
| `help/TroubleshootingPage.tsx` | `/how-it-works/troubleshooting` |
| `FeedbackPage.tsx` | `/feedback` |
| `MyContentPage.tsx` | `/my-content` |
| `MyProfilePage.tsx` | `/my-profile` |
| `SongsPage.tsx` | `/songs` (legacy) |
| `AddSongPage.tsx` | `/songs/add` |
| `EventSubmissionsPage.tsx` | `/event-submissions`, `/event-submissions/:eventId`, `/open-submissions` (redirect) |
| `SessionsPage.tsx` | `/sessions` |
| `SessionDetailPage.tsx` | `/sessions/:id` |
| `EventsPage.tsx` | `/events` |
| `EventDetailPage.tsx` | `/events/:id` |
| `AdminPage.tsx` | `/admin/:section` |
| `ManagerPage.tsx` | `/manager/:section` |
| `MyEventsPage.tsx` | `/my-events` — the events the caller is on the staff of |
| `CoordinatorPortalPage.tsx` | `/events/:eventId/coordinator` |
| `DjPortalPage.tsx` | `/events/:eventId/dj/:section` |
| `EventManagerPortalPage.tsx` | `/events/:eventId/manage/:section` |

### `components/`

| Area | Purpose |
|------|---------|
| `Layout.tsx` | Shell: `NavBar`, `<Outlet />`, `AuthSync` (signed-in only) |
| `NavBar.tsx` | Primary nav + admin/manager sub-bars; "My events" and an Event staff sub-bar for event staff |
| `AuthSync.tsx` | One-shot POST `/v1/auth/sync` after sign-in |
| `RequireAuth.tsx` | Clerk signed-in gate |
| `AdminGuard.tsx` | Requires `role === "admin"`; guards `/admin` and `/manager` (the API has no global manager role) |
| `AuthMeError.tsx` | What the guards show, with a retry, when `GET /v1/auth/me` fails |
| `QueryError.tsx` | What a page shows, with a retry, where a query's data would be when it fails (§3) |
| `MaintenancePage.tsx` | Replaces the whole app when the build has `VITE_MAINTENANCE=1` |
| `EventRoleGuard.tsx` | Requires a staff role, or a richer one, on the event in `:eventId` |
| `admin/` | Admin dashboard sections that `AdminPage` renders, each owning its state, forms and queries (`AdminEventsSection`, `AdminSessionsSection` with its `AdminSessionDialog`), and `adminShared.tsx` for the status badges, time formatting and field classes the sections share |
| `staff/` | Per-event staff portals: `StaffPortal` (shell + section tabs), `portalSections.tsx` (which sections each portal has) and one component per section |
| `SongUploadForm.tsx` | Chunked upload form (self + managed variants) |
| `SpecialUploadForm.tsx` | Portal-specific upload (Teams/Cabaret/etc.) |
| `SessionInfoHeader.tsx` | Session title + metadata block |
| `PartnersSection.tsx`, `TeamsSection.tsx`, `ManagedPartnershipsSection.tsx` | Profile / partnership UI |
| `help/HelpLayout.tsx` | Shared shell for help sub-pages (hash scroll, prev/next) |
| `help/HelpSection.tsx` | Section + subheading primitives with `scroll-mt-24` anchors |
| `help/helpTopics.ts` | `HELP_TOPICS` (hub grid + nav order) and `LEGACY_HASH_REDIRECTS` (old `/how-it-works#…` → sub-page + hash) |
| `manager/ManagerGuideSection.tsx` | Manager ops guide at `/manager/guide` |
| `ui/` | shadcn primitives (see §7) |

### `hooks/`

| File | Purpose |
|------|---------|
| `useAuthMe.ts` | Reads the caller's `/v1/auth/me` record from the query cache, keyed by Clerk user id; exposes `me`, `loading`, `error`, `reload`, `isAdmin`, `eventRoles`. `useAuthMeQuery` is the raw query underneath (§5) |
| `useDivisions.ts` | Reads the competition divisions from the public `GET /v1/divisions` as a query, once per page load and shared by every caller; works before sign-in |
| `useStaffEvents.ts` | Joins `eventRoles` to the shared events list query: each staff event with its richest role; a failed list keeps the portals and returns `error` |
| `useLiveQueues.ts` | A session's three staff queues, polled every 8 s (§9), with `updatedAt`, `refreshFailed` and a manual `refresh` |
| `useDebouncedValue.ts` | A value once it has stopped changing for a delay — feeds search boxes into query params |
| `useApiVersion.ts` | Fetches the API's public `GET /version` once per page load as a query (shown in the nav) |

### `lib/` modules

| Module | One-line purpose |
|--------|------------------|
| `authSyncStatus.ts` | Whether this tab's `POST /v1/auth/sync` has settled; `useAuthMe` waits on it after `USER_NOT_SYNCED` |
| `chronoSort.ts` | Bucketed chronological sort for sessions/events (active → upcoming → past) |
| `chunkedSongUpload.ts` | 5 MB chunked POST to `/v1/songs/upload/chunk` with retries |
| `clickable.ts` | Shared Tailwind class strings for clickable cards, table rows and the link in a clickable row |
| `env.ts` | `isProdHost()` — true on `deejaytools.com` / `www.deejaytools.com` |
| `eventDates.ts` | Parses and formats an event's calendar dates as local dates |
| `eventRoles.ts` | Per-event staff role ranking, labels and portal paths |
| `floorTrials.ts` | Buckets sessions into active / upcoming / completed / cancelled and formats the counts |
| `instrument.ts` | Sentry browser init (no-op without `SENTRY_DSN_DEEJAYTOOLS`) |
| `logger.ts` | Structured console logger; `error` also forwards to Sentry |
| `personSearch.ts` | Minimum length, debounce and labels for the event people search |
| `seasonYear.ts` | Default season year from a date (seasons roll over on October 1) |
| `sessionFormat.ts` | Session title and time formatting with optional IANA timezone |
| `songLabel.ts` | A song's display label and version |
| `submittableSongs.ts` | Which of a user's songs may be submitted to an event |
| `utils.ts` | `cn()` — `twMerge(clsx(...))` for class merging |
| `zonedTime.ts` | Wall-clock ↔ epoch conversions in an IANA timezone (session editor) |

### Config files (repo root)

| File | Role |
|------|------|
| `components.json` | shadcn generator config + path aliases |
| `vite.config.ts` | `@/` alias, API proxy, `VITE_APP_VERSION` injection, bundle chunk groups (below) |
| `vitest.config.ts` | Test runner; default `node` env, jsdom opt-in per file |
| `vitest.contract.config.ts` | Live contract suite (`pnpm test:contract`) — see §3 |
| `playwright.config.ts` | End-to-end suite (`pnpm test:e2e`, `e2e/`) against a deployed dev site |

### Bundle chunks

`build.rolldownOptions.output.codeSplitting.groups` in `vite.config.ts` splits the libraries out of the main chunk: `react` (React, React DOM, React Router), `clerk` (Clerk and its `swr`), `sentry`, and `vendor` for every other `node_modules` package. The main `index` chunk is then the app's own code. The admin, manager and per-event staff pages are lazy routes in `App.tsx` with chunks of their own; every other page is in the main chunk. The goal is that no chunk the public pages load passes Vite's 500 kB warning — when one does, the build prints the warning; add a group or make a route lazy rather than raising `chunkSizeWarningLimit`.

Measure with a Clerk publishable key set (any `pk_test_…`, as CI does): without one `main.tsx` throws before rendering, the bundler drops the app as unreachable, and the reported sizes are not the real bundle's.

---

## 3. API client (`api/client.ts`)

### `useApiClient()`

A React hook that returns a stable object of HTTP helpers: `get`, `post`, `postForm`, `patch`, `put`, `del`. Must be called inside a component (it uses Clerk's `useAuth()`).

Pages never pass it a path directly; they go through the endpoint catalog (below):

```ts
const api = useApiClient();
const sessions = await call(api, endpoints.sessions.list, { params: { eventId } });
await call(api, endpoints.partners.create, { body: { first_name, last_name, partner_role } });
```

Base URL: `import.meta.env.VITE_API_URL`, injected at build from `DEEJAYTOOLS_API` (production branch) or `DEEJAYTOOLS_API_DEV` (empty string → same-origin via Vite proxy).

### `withAuth()`

Every request runs through an internal `withAuth()` that:

1. Calls Clerk `getToken()`
2. Sets `Accept: application/json`
3. Adds `Authorization: Bearer <token>` when a token exists

There is no refresh logic here — Clerk owns session lifetime.

### `parseEnvelope()`

Responses are JSON envelopes, typed in `src/api/envelope.ts`:

- Success: `{ data: T, meta: { version: "v1", count?, total? } }` → returns `data`. `SuccessMetaSchema` accepts `meta` with or without `count` and `total`; the live contract suite checks every success's `meta` against it
- Error: `{ error: { code, message, … } }` → throws an `ApiError` (status and code attached) whose message is the client's friendly text for that code, or the server's `message`
- 5xx without an error envelope → `ApiError` with a "server unavailable" message
- 2xx the client cannot read → `ApiError` saying so
- Any other non-JSON failure → `ApiError` `Request failed: <status>`

`del()` returns `undefined` for a `204`.

**Sentry:** before throwing, the client calls `Sentry.captureException` with URL and status for a 5xx or an unreadable 2xx. **4xx are not sent to Sentry** — validation, auth, and not-found are expected user-facing failures, often caught and shown as toasts.

### Queries and mutations (`api/queries.ts`, `api/queryKeys.ts`, `api/queryClient.ts`)

Server state goes through TanStack Query (ADR-0003), and every request still goes through `call()`:

```ts
const { data, error, isLoading, refetch } = useEndpointQuery(endpoints.sessions.list, { params: { eventId } });
const create = useEndpointMutation(endpoints.sessions.create, { invalidates: [endpoints.sessions.list] });
create.mutate({ body: { … } }, { onError: (e) => toast.error(e.message) });
```

- **`useEndpointQuery(ep, { params, ...options })`** reads a GET endpoint. Params are required exactly when `call()` requires them; any other `useQuery` option (`enabled`, `refetchInterval`, `staleTime`, …) passes through. Pages never write a `queryKey` or `queryFn`.
- **`useEndpointMutation(ep, { invalidates, ...options })`** sends `{ params, body }` through `call()`. On success it invalidates every query of each endpoint in `invalidates`, whatever its params, then runs the caller's `onSuccess`.
- **Keys** come only from `queryKey(ep, params?, scope?)`: `[ep.id]`, or `[ep.id, params]` (e.g. `["sessions.list", { eventId: "e1" }]`). `scope` names whose answer it is, for a read that differs per signed-in user, and goes right after the id: `["auth.me", userId]`. TanStack matches keys by prefix, so `queryKey(ep)` covers every variant and every scope.
- **The client** (`queryClient.ts`) is created once and provided in `main.tsx` inside `ClerkProvider`, so every route and guard shares it. Defaults: no retry for an `ApiError` with a 4xx status or a `ContractViolation` (both answer the same way again); a bounded retry for network errors and 5xx (`shouldRetry`); a short `staleTime` so screens reading the same list share one request.
- **Errors are shown, not swallowed.** Render a query's `error` where its data would be — `components/QueryError.tsx` gives the inline message and a "Try again" that calls `refetch` — so a failed load never reads as an empty list. Mutation failures keep using a toast. `isLoading` is true only with no data yet, so a background refetch never brings the skeleton back.

### Call sites that bypass the client

Four places use raw `fetch` instead of `useApiClient()`:

| Location | Why |
|----------|-----|
| **`AuthSync.tsx`** | Runs as a side-effect component; uses raw `fetch` with an explicit token from `getToken()` for its fire-and-forget sync POST. Failures are logged, not surfaced to UI, except an email already linked to another sign-in, which shows a toast. |
| **`lib/chunkedSongUpload.ts`** | Not a React hook — receives `getToken` as a callback. Builds `FormData` per chunk, implements its own retry/backoff, and must re-fetch a fresh token on each attempt. Cannot call `useApiClient()`. |
| **`FeedbackPage.tsx`** | **Unauthenticated** endpoint — no Clerk token. Submits JSON to `POST /v1/feedback` for anonymous bug reports. |
| **`hooks/useApiVersion.ts`** | `GET /version` is public, unversioned and not in the envelope. It is in the catalog as `meta.version`, declared `envelope: false`, and called through `call()` with `bareJsonTransport` (`api/bareTransport.ts`), which returns the body without unwrapping `{data}`. |

For any new authenticated JSON call, use `useApiClient()`. Only bypass it when you have one of the reasons above. `AuthSync`, the chunk uploader and `FeedbackPage` still take their path from the catalog and validate the response with `checkEndpoint()`; `useApiVersion` validates through `call()`.

### Endpoint catalog (`api/endpoints.ts`) and response validation (`api/contract.ts`)

Every API call the app makes is declared once in `endpoints.ts`: method, access (`public` / `user` / `admin` / `event-staff`), path builder, and the zod schema the response must satisfy. `call(api, endpoints.x.y, { params, body })` builds the path, sends the request and validates the response; no `/v1/` path appears anywhere else in `src/`. Endpoints declared `envelope: false` (the unversioned `GET /version`) answer with a bare body and are called through `bareJsonTransport` instead of the API client.

A response that fails its schema is a contract violation. In dev and tests it throws `ContractViolation`; in production it is reported to Sentry (tagged `contract_endpoint`) and the raw data is used, so harmless drift never breaks a page but never goes unnoticed. Unit-test API mocks are built with the `fx.*` factories in `src/test/fixtures.ts`, which parse through the same schemas.

The live contract suite (`src/contract`, `pnpm test:contract`, `.github/workflows/contract.yml`) walks the catalog against the development API with a real Clerk session and fails on any endpoint that is neither exercised nor explicitly skipped. See [ADR-0002](decisions/ADR-0002-api-contract.md). This repository owns the API's live contract suite.

Before anything is deployed, the catalog is also checked against api-deejaytools' committed OpenAPI document. `src/contract/api-deejaytools.openapi.json` is a copy of that repository's `docs/openapi.json`; `src/contract/apiSnapshot.test.ts` (run by `pnpm test`, so in every pull request, with no network) uses `openapiCheck.ts` to confirm that every endpoint's route and method exist, that every documented success response satisfies the endpoint's schema (required fields present, types the app accepts, null only where it allows null) with a `meta` that `SuccessMetaSchema` accepts, and that a declared request body fits the route's. It is lenient where the document cannot tell: a loosely typed API field, or a plain string the app narrows to an enum, is not reported.

The flow when the API changes:

1. api-deejaytools regenerates and commits `docs/openapi.json` with the change (its unit tests fail while the snapshot is stale).
2. Its CI runs this repository's `apiSnapshot.test.ts` from `dev` with the new document in place of the copy, so a change that would break this app fails in the API's pull request, before it merges.
3. Once it is on the API's `dev`, `pnpm openapi:sync` here refreshes the copy (from the API's `dev` branch by default; a branch, tag or commit, or a local file, may be named). Commit it with any change here that relies on it.

---

## 4. Routing and guards

Defined in `pages/App.tsx`. Pattern: public landing **outside** `Layout`; everything else **inside** `Layout` (nav + main column).

### Route table

| Path | Guard | Page | Notes |
|------|-------|------|-------|
| `/` | — | `LandingPage` | **Outside `Layout`** — no `NavBar`, no `AuthSync` |
| `/floor-trials` | — | `FloorTrialsPage` | Public |
| `/check-in` | — | `FloorTrialsPage` | Legacy alias |
| `/how-it-works` | — | `HowItWorksPage` | Public hub; legacy `#anchor` links redirect to sub-pages |
| `/how-it-works/floor-trials` | — | `HelpFloorTrialsPage` | Public guide topic |
| `/how-it-works/submitting-music` | — | `HelpSubmittingMusicPage` | Public guide topic |
| `/how-it-works/checking-in` | — | `HelpCheckingInPage` | Public guide topic |
| `/how-it-works/the-queue` | — | `HelpTheQueuePage` | Public guide topic |
| `/how-it-works/partners` | — | `HelpPartnersPage` | Public guide topic (help content, not partner CRUD) |
| `/how-it-works/on-the-floor` | — | `HelpOnTheFloorPage` | Public guide topic |
| `/how-it-works/troubleshooting` | — | `TroubleshootingPage` | Public error-message lookup |
| `/feedback` | — | `FeedbackPage` | Public contact form |
| `/my-content` | `RequireAuth` | `MyContentPage` | |
| `/my-profile` | `RequireAuth` | `MyProfilePage` | |
| `/songs` | `RequireAuth` | `SongsPage` | Legacy |
| `/songs/add` | `RequireAuth` | `AddSongPage` | |
| `/event-submissions` | `RequireAuth` | `EventSubmissionsPage` | Event picker; choosing one opens its page |
| `/event-submissions/:eventId` | `RequireAuth` | `EventSubmissionsPage` | Submit and remove songs for one event: song, division override, and round (Classic at The Open only) |
| `/open-submissions` | `RequireAuth` | `OpenSubmissionsRedirect` | Old link: forwards to The Open's event page, or the picker |
| `/sessions` | `RequireAuth` | `SessionsPage` | |
| `/sessions/:id` | — | `SessionDetailPage` | Public read; check-in UI hidden when signed out |
| `/events` | — | `EventsPage` | Public; lists active + upcoming only |
| `/events/:id` | — | `EventDetailPage` | Public read; entity roster hidden when signed out |
| `/admin` | — | `<Navigate to="/admin/events">` | |
| `/admin/:section` | `AdminGuard` | `AdminPage` | |
| `/manager` | — | `<Navigate to="/manager/active-sessions">` | |
| `/manager/:section` | `AdminGuard` | `ManagerPage` | |
| `/my-events` | `RequireAuth` | `MyEventsPage` | The caller's staff events, each linking to its portal |
| `/events/:eventId/coordinator` | `EventRoleGuard` (coordinator) | `CoordinatorPortalPage` | |
| `/events/:eventId/dj`, `/events/:eventId/dj/:section` | `EventRoleGuard` (dj) | `DjPortalPage` | Bare path lands on the first section |
| `/events/:eventId/manage`, `/events/:eventId/manage/:section` | `EventRoleGuard` (event-manager) | `EventManagerPortalPage` | Bare path lands on the first section |

### Guards (behavior)

- **`RequireAuth`** — `<SignedOut>` → redirect `/`. No role check.
- **`AdminGuard`** — waits for `useAuthMe().loading`, then requires `isAdmin && me`; else redirect `/`. Shows skeleton while loading, and `AuthMeError` (with a retry) when the record failed to load. It guards the manager area too, which is admin-only: the API's global roles are `user` and `admin`, and staff roles are per event.
- **`EventRoleGuard`** — same loading and error pattern; requires the role it names, or a richer one (event manager, then DJ, then coordinator), in `eventRoles` for the `:eventId` in the URL. The global admin role does not count. The API checks every portal call again against the same event.

### Per-event staff portals

A person granted a staff role on an event (`event_roles` on `GET /v1/auth/me`) sees **My events** in the nav and an **Event staff** sub-bar, one entry per event, opening the portal of their richest role there. Each portal shows only its event and calls only event-scoped routes, never `/v1/admin/*`:

- **Coordinator** — the event's submissions (`GET /v1/events/:id/song-submissions`), filterable by division. Read-only.
- **DJ** — live queue, sessions (create, edit, status, divisions, delete), run history (always filtered to the event), check in and upload for a dancer (uploads send `event_id`), submissions, and where to find the event's Drive folder.
- **Event manager** — the DJ sections plus editing and deleting the event and its staff list, with grant and revoke for coordinator and DJ (`/v1/events/:id/staff`). Granting event manager and creating events stay with admins.

The section list for each portal is in `components/staff/portalSections.tsx`; a section's slug is its URL (`/events/:eventId/dj/queue`). Check in for, upload for and staff grant pick the person with `components/staff/PersonPicker.tsx`, which searches `GET /v1/events/:id/people?q=` (two characters or more, debounced). It finds only people already connected to the event (a submission, a check-in or queue entry in one of its sessions, or a staff grant), so granting staff to someone new to the event, or uploading for a dancer with no link to it yet, needs an admin.

### Admin / manager sections — keeping URL, tabs, and nav in sync

Sections are **URL-driven**, not hidden client-side tab state.

**Admin** (`AdminPage.tsx`):

```ts
export const ADMIN_SECTIONS = [
  "events", "sessions", "runs", "songs", "test-checkin", "users",
] as const;
```

**Manager** (`ManagerPage.tsx`):

```ts
export const MANAGER_SECTIONS = [
  "active-sessions", "event-songs", "upload-for", "checkin-for", "guide",
] as const;
```

`active-sessions` renders the staff `LiveQueueSection` over today's sessions across all events, and check-in-for and upload-for pick the person with `PersonPicker` searching every user (admins only reach this page). `guide` renders `ManagerGuideSection` (floor-trial ops reference). NavBar lists **Guide** last in `MANAGER_ITEMS` (`/manager/guide`); the bare `/manager` redirect lands on `active-sessions`.

Each page reads `:section` from `useParams`, validates against its `*_SECTIONS` array, and falls back to a default (`events` / `active-sessions`) when the slug is missing or unknown — so `/admin/foo` shows the default section instead of a blank screen.

**Run History** (`/admin/runs`): event and session card-button grids (defaults to **All events** / **All sessions**), **Show future events** toggle (off by default), division and partnership summary chips (client-side AND filters), and a flat newest-first run list grouped by `entity_key` on the backend.

Radix `<Tabs value={section}>` wraps the content panes; there is **no tab strip** in the page body. Navigation is the **NavBar sub-bars** (`SUPERUSER_ITEMS` / `MANAGER_ITEMS`), whose `to` paths match the section slugs exactly (`/admin/events`, `/manager/active-sessions`, etc.).

### Landing page consequence

Because `/` renders **outside** `Layout`:

- `NavBar` is not shown (landing has its own chrome).
- **`AuthSync` does not run** on the landing page — even if the user is signed in via Clerk. Auth sync fires only after navigating into any `Layout` route while signed in.

---

## 5. Auth state — `useAuthMe()`

```ts
const { me, loading, error, reload, isAdmin, eventRoles } = useAuthMe();
```

`GET /v1/auth/me` is a query on the shared client (§3), keyed `["auth.me", userId]` with the Clerk user id as the `queryKey()` scope. Every caller (nav bar, guards, pages) reads that one cache entry, so the record is fetched once per page load however many callers are mounted. Because the key carries the user id, signing out and back in as someone else on the same device starts a fresh entry: the previous account's record is never shown, with no reliance on clearing the cache at the right moment. While signed out the query is disabled and `me` is `null`.

`useAuthMe` calls `useQuery` itself rather than `useEndpointQuery`, because its fetch does two things the shared hooks don't: on a brand-new account `/me` can answer `USER_NOT_SYNCED` before `AuthSync` has created the users row, so it waits for the sync (`lib/authSyncStatus.ts`) and asks once more; and it toasts a failure once per request, however many callers share it. To keep that one toast, the query is not retried, and a caller mounted after a failure shows it (with its retry) rather than asking again. `staleTime` is infinite: the record changes only when the caller changes something, and those changes invalidate it.

**Keeping it fresh.** A mutation that changes the caller's record lists `endpoints.auth.me` in its `invalidates`: the profile update (`MyProfilePage`), staff grants and revokes (`EventStaffSection`, which may be the caller's own), and event edits and deletes (`EventDetailsSection`, `AdminPage` — the nav bar lists staff events by name). `invalidates` uses the prefix `["auth.me"]`, so it covers every user's entry. `reload()` invalidates the same prefix by hand; the guards and pages use it for "Try again".

`useAuthMeQuery({ enabled })` is the raw query underneath, for a caller that wants the record only some of the time — `SongUploadForm` reads it only when uploading for the signed-in dancer, through the same key and fetch.

| Field | Meaning |
|-------|---------|
| `me` | `ApiAuthMe` from `GET /v1/auth/me`, or `null` |
| `loading` | `true` until Clerk is loaded and, when signed in, until this account's first answer arrives |
| `error` | Why the last request failed, or `null` (also while a retry is in flight); with `loading` false, so a guard can offer a retry |
| `reload()` | Invalidate and re-fetch the record; resolves once it is back |
| `isAdmin` | `me?.role === "admin"` |
| `eventRoles` | `me.event_roles`: the caller's `{ event_id, role }` staff roles; `[]` when none or signed out |

### Why `loading` is computed that way

```ts
loading: !isLoaded || (owner !== null && (isPending || (isFetching && me === null))),
```

Clerk can report a signed-in user before `/v1/auth/me` returns. Without the second clause, `AdminGuard` would see `loading: false`, `isAdmin: false`, and redirect a legitimate admin to `/`. `isPending` covers this account's first load (a new user id is a new key, so it starts pending); the `isFetching` clause covers a retry after a failed first load. A refetch with a record already on screen leaves `loading` false. The hook keeps guards in a loading state until this account's record arrives, its request fails, or the user is confirmed signed out.

### Divisions — `useDivisions()`

The API owns the division list; the app keeps no copy. `useDivisions()` returns `{ groups, divisions, loading, error, retry }` from `GET /v1/divisions`, read through `useEndpointQuery` with an infinite `staleTime` (one fetch per page load; a failed load is retried by the next caller to mount): `groups` for the grouped pills on the upload form, `divisions` (the groups flattened, in order) for dropdowns, checkbox lists and sorting. Both are empty until the list loads, so forms that send divisions (the session dialogs) refuse to submit until then. Unit tests get the list already loaded from `src/test/setup.ts`; `useDivisions.test.tsx` tests the hook itself.

---

## 6. Chunked song upload (`lib/chunkedSongUpload.ts`)

Used by `SongUploadForm` (and manager “upload for” flows). Bypasses the API client — see §3.

### Constants

| Constant | Value |
|----------|-------|
| `CHUNK_SIZE` | 5 MB |
| `MAX_FILE_BYTES` | 100 MB |
| `MAX_RETRIES` | 3 per chunk |

### Flow

1. Check the file can be read (first and last byte) — an empty file or an unread cloud placeholder fails here, before any request.
2. Generate `uploadId` (`crypto.randomUUID()`).
3. Slice file into chunks; POST each to `/v1/songs/upload/chunk` as `FormData` (`chunk`, `upload_id`, `chunk_index`, `total_chunks`, `original_filename`, `mime_type`, plus caller fields from `buildFormFields()`).
4. **Fresh Clerk token** on every attempt (`getToken()` passed in from the form).
5. **Retryable refusals** — 5xx, 408, and 429 other than `TOO_MANY_UPLOADS` (`isRetryableRefusal`) — retry with **linear backoff** (`1000 * attempt` ms between attempts). Every other refusal, 401 included, throws at once with the server's `error.message` (or `Upload failed (<status>)`).
6. Network errors → re-check the file (an unreadable file throws at once), otherwise retry with a message built from the underlying error.
7. Each accepted chunk's response is checked against the catalog (`checkEndpoint`).

### Progress stages (`UploadStage`)

| Stage | UI meaning | Progress hints |
|-------|------------|----------------|
| `uploading` | Bytes on the wire | 10–85% scaled by bytes sent |
| `processing` | Last chunk sent; server processing | ~90% on multi-chunk, ~50% on single-chunk |
| `finishing` | Done | 95% → 100%, then 400 ms delay for UX |

(`idle` is the form's pre-upload state, not set by the uploader itself.)

### User-facing error strings (exact)

**Chunk uploader** (`lib/chunkedSongUpload.ts`):

| Condition | Message |
|-----------|---------|
| Empty file | `"<name>" is empty (0 bytes).` |
| File cannot be read (e.g. a cloud placeholder) | `"<name>" couldn't be read from disk. …` (names iCloud Drive, Google Drive, Dropbox) |
| No token from Clerk | `Your session expired. Please sign in again and retry the upload.` |
| Network failure | `Upload failed (<ErrorName>: <message>) — the connection may have dropped. Retrying…` |
| HTTP error with JSON body | Server's `error.message` |
| Non-retryable refusal (e.g. **401**) | Same as above — server's `error.message` (aborts immediately, no retry) |
| HTTP error without parseable body | `Upload failed (<status>)` |

**Client-side validation** in `SongUploadForm` / `SpecialUploadForm` (before upload starts):

| Condition | Message |
|-----------|---------|
| No file selected | `Please select an audio file.` |
| File over 100 MB | `That file is too large. Please choose an audio file under 100 MB.` |

### iOS file picker carve-out

In `SongUploadForm.tsx`:

```tsx
<Input type="file" accept={isIOS() ? undefined : "audio/*"} … />
```

On iOS (iPhone/iPad, and iPad-as-Mac with touch), the `accept="audio/*"` attribute is **omitted** because iOS Files picker over-filters and hides valid files. Non-iOS browsers still get `accept="audio/*"`. **Server-side magic-byte validation** is the backstop for file type safety.

---

## 7. UI conventions

### shadcn config (`components.json`)

| Setting | Value |
|---------|-------|
| `style` | `default` |
| `baseColor` | `slate` |
| `cssVariables` | `true` |
| Aliases | `@/components`, `@/lib/utils`, `@/components/ui` |

Add new shadcn components with the CLI from the repo root (see cheatsheet §10).

### `components/ui/` inventory

Installed shadcn primitives: `badge`, `button`, `card`, `dialog`, `form`, `input`, `label`, `select`, `separator`, `skeleton`, `table`, `tabs`.

**`choice-group.tsx` is custom** — a segmented control built for this app, not from the shadcn registry.

### Patterns

- **`cn()`** (`lib/utils.ts`) — `twMerge(clsx(...))`; use when merging Tailwind classes so later wins (e.g. `CLICKABLE_ROW_CLASS` over shadcn defaults).
- **Variants** — `class-variance-authority` (`cva`) in components like `button.tsx`.
- **Icons** — `lucide-react`.
- **Toasts** — `import { toast } from "sonner"`; global `<Toaster richColors closeButton position="top-center" />` in `App.tsx`. There is no shadcn toast component in this project.
- **Click affordances** — `CLICKABLE_CARD_CLASS` / `CLICKABLE_ROW_CLASS` from `lib/clickable.ts` for consistent hover on cards and table rows. A clickable card is a `<Link>`; a clickable row keeps its `onClick` for the mouse and puts a `<Link>` (`ROW_LINK_CLASS`) in its primary cell, so the row is reachable with Tab and Enter.

---

## 8. Testing

### Layout

- Tests are **colocated**: `src/**/*.test.{ts,tsx}` next to source.
- **`lib/` pure functions** — default Vitest `node` environment (fast, no DOM).
- **Components / pages** — opt into jsdom with a file-level directive:

```ts
// @vitest-environment jsdom
```

### Global setup (`test/setup.ts`)

- Loaded via `vitest.config.ts` → `setupFiles`.
- Detects `window` at runtime; only in jsdom:
  - Imports `@testing-library/jest-dom/vitest`
  - Registers `afterEach(cleanup)` from Testing Library
  - Stubs Radix pointer/scroll APIs jsdom lacks
- Mocks `useDivisions` with the list already loaded, so a test's API mock need not serve `/v1/divisions`

Default environment is **`node`** so pure tests do not pull DOM deps.

### Coverage

`pnpm test:coverage` counts every file under `src/` (the `coverage.include` / `exclude` in `vitest.config.ts`), not only the ones a test imports, so a file with no test shows as uncovered rather than missing from the report. The thresholds there are a floor: the run fails below them and rewrites them upward when coverage rises.

### Worked example — page that uses the API client

From `SessionDetailPage.test.tsx` — the pattern used across page tests:

```ts
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

const apiGet = vi.fn();
const apiClient = { get: apiGet, post: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() };
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }) => <>{children}</>,
  SignedOut: ({ children }) => null,
  useAuth: () => ({ isSignedIn: true }),
  useUser: () => ({ user: { id: "user_1" } }),
}));

// apiGet.mockImplementation((path) => { … return fixtures by path … });

render(
  <MemoryRouter initialEntries={["/sessions/s1"]}>
    <Routes>
      <Route path="/sessions/:id" element={<SessionDetailPage />} />
    </Routes>
  </MemoryRouter>
);

await waitFor(() => expect(screen.getByText(/…/)).toBeInTheDocument());
expect(apiGet).toHaveBeenCalledWith("/v1/sessions/s1");
```

A component that reads through the query hooks renders with `renderWithQueryClient(ui)` from `src/test/render.tsx` instead of `render(ui)`: it wraps the tree in a `QueryClientProvider` with a fresh client per render and retries off, so no cache or retry leaks between tests (`SessionsPage.test.tsx`). The `@/api/client` mock stays the same — the query functions call through it.

**Key practices:**

1. Mock `@/api/client` with a **stable** `apiClient` object (recreated mocks break `useCallback` deps).
2. Mock Clerk and sonner — pages assume signed-in unless testing public behavior.
3. Use `MemoryRouter` + `Routes` to supply `:params`.
4. Assert on rendered output and which API paths were called.

---

## 9. Polling and refresh cadence

Three screens poll on an interval. **Do not shorten these casually** — they trade API load against freshness.

Polling is TanStack Query's `refetchInterval` (ADR-0003). A background refetch never brings a skeleton back, because `isLoading` is true only with no data, and a failed one leaves the last data on screen.

### `SessionDetailPage` — 60 seconds

The session (`sessions.get`) and its public queues (`queue.active`, `queue.waiting`) are queries with `refetchInterval: 60_000`.

**Why 60s:** Attendees watching the queue on their phone do not need sub-second updates. Floor trials span hours; a one-minute lag is acceptable and keeps hundreds of open tabs from hammering queue endpoints.

A failed refresh shows `Couldn't refresh the queue; it may be out of date` with **Retry now**, without blocking the page. The check-in clock (`now`) ticks on its own timer at the window's next edge; it does not fetch.

### `LiveQueueSection` (staff portals and the manager's active sessions) — 8 seconds

`components/staff/LiveQueueSection.tsx` is the one live queue: a staff portal shows it for its event, and `ManagerPage`'s active-sessions section shows it for today's sessions across all events. It reads through `hooks/useLiveQueues.ts`: `queue.activeStaff`, `queue.priority` and `queue.nonPriority` with `refetchInterval: LIVE_QUEUE_POLL_MS` (8000), plus a **1 second** tick only to refresh the “Updated Xs ago” label without re-fetching.

**Why 8s:** Managers actively reorder and advance the queue; they need near-real-time state. A failed background refetch is silent but turns the label amber: `Couldn't refresh — tap to retry`; a refresh someone taps says why it failed in a toast. Success shows `Updated {formatAgo(...)}` (e.g. `just now`, `12s ago`).

### After a queue action

`useQueueActions` (`components/staff/queueActions.tsx`) runs one action at a time, then invalidates every queue, session, run-history and check-in query and waits for the ones on screen to refetch before it takes another action.

| Surface | Interval | Rationale |
|---------|----------|-----------|
| Public session detail | 60s | Low urgency, many passive viewers |
| Manager live queue | 8s | Operational tool; stale queue causes wrong decisions |
| Staff portal live queue (`components/staff/LiveQueueSection.tsx`) | 8s (`LIVE_QUEUE_POLL_MS`), plus a 1s label tick | Same as the manager live queue |

`SessionInfoHeader` also re-renders every 30s to keep its time-relative text current; it does not fetch.

---

## 10. “Where do I add…?” cheatsheet

### A new page

1. Create `src/pages/MyPage.tsx` (default export).
2. Add a `<Route>` in `App.tsx` inside or outside `Layout` as appropriate.
3. Wrap with `RequireAuth`, `AdminGuard` or `EventRoleGuard` if needed.
4. Read with `useEndpointQuery` and change with `useEndpointMutation` (§3); render a query's error with `QueryError`.
5. Add `MyPage.test.tsx` with `// @vitest-environment jsdom` if it renders UI, rendering through `renderWithQueryClient`.
6. Link from `NavBar` or an existing page if it should be discoverable.

### A new admin section

1. Add slug to `ADMIN_SECTIONS` in `AdminPage.tsx`.
2. Add a section component under `components/admin/` that renders its own `<TabsContent value="your-slug">` (and its dialogs), and render it from `AdminPage.tsx`.
3. Add `{ to: "/admin/your-slug", label: "…" }` to `SUPERUSER_ITEMS` in `NavBar.tsx`.
4. Section is immediately bookmarkable at `/admin/your-slug`.

### A new manager section

Same pattern with `MANAGER_SECTIONS`, `ManagerPage.tsx` `<TabsContent>`, and `MANAGER_ITEMS` in `NavBar.tsx`.

### A new API call

1. Declare it in `api/endpoints.ts` (method, access, path, response schema).
2. A read is `useEndpointQuery(endpoints.x.y, { params })`; a change is `useEndpointMutation(endpoints.x.y, { invalidates: [...] })` naming the endpoints whose data it changes.
3. Show a query error inline (`QueryError`); toast a mutation error with `toast.error(e.message)`.
4. Only use raw `fetch` if unauthenticated, non-React (chunk upload), or a documented exception.

### A new shadcn component

From the repo root:

```bash
pnpm dlx shadcn@latest add <component>
```

Config is in `components.json`; output goes to `src/components/ui/`. Import via `@/components/ui/...`.

### A new shared helper

- **Pure logic / formatting** → `src/lib/myHelper.ts` + optional `myHelper.test.ts` (no jsdom).
- **Reusable React UI** → `src/components/MyWidget.tsx`.
- **Shared auth-aware logic** → `src/hooks/useMyHook.ts`.

---

## Quick reference — entrypoints

| Concern | File |
|---------|------|
| Bootstrap | `main.tsx` |
| Routes | `pages/App.tsx` |
| HTTP | `api/client.ts` |
| Server state | `api/queryClient.ts`, `api/queries.ts`, `api/queryKeys.ts` |
| Profile / roles | `hooks/useAuthMe.ts` |
| Clerk → DB sync | `components/AuthSync.tsx` |
| Upload pipeline | `lib/chunkedSongUpload.ts`, `components/SongUploadForm.tsx` |
| Tests setup | `vitest.config.ts`, `test/setup.ts` |

For API shapes, auth rules, and endpoint details, see the [`api-deejaytools` README](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md) (every route and the scope it requires) and the API's own OpenAPI docs at `/docs`.
