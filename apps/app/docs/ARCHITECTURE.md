# Frontend architecture (`apps/app`)

Orientation for a developer who has never opened this codebase. The app is a Vite-powered React SPA for floor-trial check-in, song uploads, and admin/manager tooling against the DeejayTools API.

---

## 1. Stack — and deliberate absences

| Layer | Choice | Notes |
|-------|--------|-------|
| Bundler | **Vite 6** | Dev server on `:5173`; proxies `/v1` → API (`vite.config.ts`) |
| UI | **React 19** | StrictMode; Sentry error hooks on `createRoot` |
| Routing | **React Router 7** | `BrowserRouter` in `App.tsx` |
| Styling | **Tailwind CSS 3** | CSS variables for theme tokens; `tailwindcss-animate` |
| Auth | **Clerk** (`@clerk/clerk-react`) | JWT via `getToken()`; `ClerkProvider` in `main.tsx` |
| Components | **shadcn/ui** | Radix primitives + Tailwind; config in `components.json` |
| Toasts | **sonner** | `<Toaster />` in `App.tsx` — not a shadcn toast |
| Forms | **react-hook-form** + **@hookform/resolvers** | Used where multi-field validation matters |
| Types | **`@deejaytools/schemas`** | Shared API shapes from the monorepo |
| Envelopes | **`common-typescript-utils`** | `{ data, meta }` / `{ error }` response typing |
| Observability | **@sentry/react** | Init in `lib/instrument.ts` before React mounts |

**What is intentionally *not* here:**

- **No TanStack Query / react-query** — no global cache, no stale-time config, no `useQuery` to grep for.
- **No Redux, Zustand, Jotai, or similar** — no store file, no slices, no selectors.

**Data fetching is local:** each page owns its own `useState` + `useEffect` (or event handlers) and calls `useApiClient()` directly. That keeps the bundle small and makes each screen self-contained, at the cost of duplicated loading/error patterns and no automatic deduplication. If you find yourself hunting for “where the global fetch layer lives,” stop — there isn't one.

---

## 2. Directory map

```
apps/app/src/
├── api/           HTTP client hook (the default way to talk to the API)
├── components/    Shared UI, guards, layout, domain sections
│   ├── help/      HelpLayout, HelpSection, HelpStillStuck, helpTopics
│   └── manager/   ManagerGuideSection (manager ops guide tab)
├── hooks/         Cross-cutting React hooks (auth profile today)
├── lib/           Pure helpers — no React, safe to import anywhere
├── pages/         Route-level screens (+ colocated *.test.tsx)
│   └── help/      Seven /how-it-works/* topic pages
├── test/          Vitest global setup
├── main.tsx       Entry: Sentry → ClerkProvider → App
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
| `EventSubmissionsPage.tsx` | `/event-submissions` |
| `SessionsPage.tsx` | `/sessions` |
| `SessionDetailPage.tsx` | `/sessions/:id` |
| `EventsPage.tsx` | `/events` |
| `EventDetailPage.tsx` | `/events/:id` |
| `AdminPage.tsx` | `/admin/:section` |
| `ManagerPage.tsx` | `/manager/:section` |

### `components/`

| Area | Purpose |
|------|---------|
| `Layout.tsx` | Shell: `NavBar`, `<Outlet />`, `AuthSync` (signed-in only) |
| `NavBar.tsx` | Primary nav + admin/manager sub-bars |
| `AuthSync.tsx` | One-shot POST `/v1/auth/sync` after sign-in |
| `RequireAuth.tsx` | Clerk signed-in gate |
| `AdminGuard.tsx` | Requires `role === "admin"` |
| `ManagerGuard.tsx` | Requires admin **or** manager role |
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
| `useAuthMe.ts` | Fetches `/v1/auth/me`, exposes `me`, `loading`, `isAdmin`, `isManager` |

### `lib/` modules

| Module | One-line purpose |
|--------|------------------|
| `chronoSort.ts` | Bucketed chronological sort for sessions/events (active → upcoming → past) |
| `chunkedSongUpload.ts` | 5 MB chunked POST to `/v1/songs/upload/chunk` with retries |
| `clickable.ts` | Shared Tailwind class strings for clickable cards and table rows |
| `entityLabel.ts` | “Owner & Partner” display labels; handles placeholder partner kinds |
| `env.ts` | `isProdHost()` — true on `deejaytools.com` / `www.deejaytools.com` |
| `instrument.ts` | Sentry browser init (no-op without `VITE_SENTRY_DSN`) |
| `logger.ts` | Structured console logger; `error` also forwards to Sentry |
| `sessionFormat.ts` | Session title and time formatting with optional IANA timezone |
| `utils.ts` | `cn()` — `twMerge(clsx(...))` for class merging |

### Config files (repo root of `apps/app`)

| File | Role |
|------|------|
| `components.json` | shadcn generator config + path aliases |
| `vite.config.ts` | `@/` alias, API proxy, `VITE_APP_VERSION` injection |
| `tailwind.config.js` | Theme extension (shadcn color tokens, container, animations) |
| `vitest.config.ts` | Test runner; default `node` env, jsdom opt-in per file |

---

## 3. API client (`api/client.ts`)

### `useApiClient()`

A React hook that returns a stable object of HTTP helpers: `get`, `post`, `postForm`, `patch`, `put`, `del`. Must be called inside a component (it uses Clerk's `useAuth()`).

```ts
const api = useApiClient();
const sessions = await api.get<ApiSession[]>("/v1/sessions");
await api.post("/v1/foo", { bar: 1 });
await api.postForm("/v1/upload", formData);
```

Base URL: `import.meta.env.VITE_API_URL` (empty string in dev → same-origin via Vite proxy).

### `withAuth()`

Every request runs through an internal `withAuth()` that:

1. Calls Clerk `getToken()`
2. Sets `Accept: application/json`
3. Adds `Authorization: Bearer <token>` when a token exists

There is no refresh logic here — Clerk owns session lifetime.

### `parseEnvelope()`

Responses are JSON envelopes from `common-typescript-utils`:

- Success: `{ data: T, meta?: … }` → returns `data`
- Error: `{ error: { message, … } }` → throws `new Error(error.message)`
- Non-JSON failure → throws `Request failed: <status>`

**5xx handling:** before throwing, the client calls `Sentry.captureException` with URL and status. **4xx are not sent to Sentry** — validation, auth, and not-found are expected user-facing failures, often caught and shown as toasts.

### Call sites that bypass the client

Three places use raw `fetch` instead of `useApiClient()`:

| Location | Why |
|----------|-----|
| **`AuthSync.tsx`** | Runs as a side-effect component; could use the client, but intentionally uses raw `fetch` with an explicit token from `getToken()` and does not need envelope parsing for its fire-and-forget sync POST. Failures are logged, not surfaced to UI. |
| **`lib/chunkedSongUpload.ts`** | Not a React hook — receives `getToken` as a callback. Builds `FormData` per chunk, implements its own retry/backoff, and must re-fetch a fresh token on each attempt. Cannot call `useApiClient()`. |
| **`FeedbackPage.tsx`** | **Unauthenticated** endpoint — no Clerk token. Submits JSON to `POST /v1/feedback` for anonymous bug reports. |

For any new authenticated JSON call, use `useApiClient()`. Only bypass it when you have one of the reasons above.

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
| `/event-submissions` | `RequireAuth` | `EventSubmissionsPage` | |
| `/sessions` | `RequireAuth` | `SessionsPage` | |
| `/sessions/:id` | — | `SessionDetailPage` | Public read; check-in UI hidden when signed out |
| `/events` | `RequireAuth` | `EventsPage` | |
| `/events/:id` | `RequireAuth` | `EventDetailPage` | |
| `/admin` | — | `<Navigate to="/admin/events">` | |
| `/admin/:section` | `AdminGuard` | `AdminPage` | |
| `/manager` | — | `<Navigate to="/manager/active-sessions">` | |
| `/manager/:section` | `ManagerGuard` | `ManagerPage` | |

### Guards (behavior)

- **`RequireAuth`** — `<SignedOut>` → redirect `/`. No role check.
- **`AdminGuard`** — waits for `useAuthMe().loading`, then requires `isAdmin && me`; else redirect `/`. Shows skeleton while loading.
- **`ManagerGuard`** — same loading pattern; requires `isAdmin || isManager`.

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

`guide` renders `ManagerGuideSection` (floor-trial ops reference). NavBar lists **Guide** last in `MANAGER_ITEMS` (`/manager/guide`); the bare `/manager` redirect still lands on `active-sessions`.

Each page reads `:section` from `useParams`, validates against its `*_SECTIONS` array, and falls back to a default (`events` / `active-sessions`) when the slug is missing or unknown — so `/admin/foo` shows the default section instead of a blank screen.

**Run History** (`/admin/runs`): event button grid (defaults to **All events**), optional session filter, division summary chips, and collapsible division groups — same interaction patterns as Manager → Event Songs.

Radix `<Tabs value={section}>` wraps the content panes; the **tab strip was removed** from the page body. Navigation is the **NavBar sub-bars** (`SUPERUSER_ITEMS` / `MANAGER_ITEMS`), whose `to` paths match the section slugs exactly (`/admin/events`, `/manager/active-sessions`, etc.).

### Landing page consequence

Because `/` renders **outside** `Layout`:

- `NavBar` is not shown (landing has its own chrome).
- **`AuthSync` does not run** on the landing page — even if the user is signed in via Clerk. Auth sync fires only after navigating into any `Layout` route while signed in.

---

## 5. Auth state — `useAuthMe()`

```ts
const { me, loading, reload, isAdmin, isManager } = useAuthMe();
```

| Field | Meaning |
|-------|---------|
| `me` | `ApiAuthMe` from `GET /v1/auth/me`, or `null` |
| `loading` | `true` until Clerk is loaded **and** (signed out **or** `me` is populated) |
| `reload()` | Re-fetch profile (after profile edits) |
| `isAdmin` | `me?.role === "admin"` |
| `isManager` | `me?.role === "manager"` |

### Why `loading` is computed that way

```ts
const loading = !isLoaded || fetching || (isSignedIn === true && me === null);
```

Clerk can report `isSignedIn: true` before `/v1/auth/me` returns. Without the third clause, `AdminGuard` would see `loading: false`, `isAdmin: false`, and redirect a legitimate admin to `/` before the fetch starts. The hook keeps guards in a loading state until `me` exists or the user is confirmed signed out.

### Known bug — `isManager`

The API only assigns roles `"user"` and `"admin"`. There is no `"manager"` role in the backend today, so **`isManager` is always false** and **`ManagerGuard` only admits admins** in practice.

From `useAuthMe.ts`:

```ts
isManager: me?.role === "manager",
```

Do not build features assuming a distinct manager role works until the backend exposes one (or this check is aligned with however managers are represented).

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

1. Generate `uploadId` (`crypto.randomUUID()`).
2. Slice file into chunks; POST each to `/v1/songs/upload/chunk` as `FormData` (`chunk`, `upload_id`, `chunk_index`, `total_chunks`, `original_filename`, `mime_type`, plus caller fields from `buildFormFields()`).
3. **Fresh Clerk token** on every attempt (`getToken()` passed in from the form).
4. **401 → immediate throw** (no retry) — surfaces the server's `error.message` (or `Upload failed (401)`).
5. Other failures → retry with **linear backoff** (`1000 * attempt` ms between attempts).
6. Network errors → retry with message built from the underlying error.

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
| No token from Clerk | `Your session expired. Please sign in again and retry the upload.` |
| Network failure | `Network error (<ErrorName>: <message>) — check your connection and try again.` |
| HTTP error with JSON body | Server's `error.message` |
| HTTP **401** with JSON body | Same as above — server's `error.message` (aborts immediately, no retry) |
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

Add new shadcn components with the CLI from `apps/app` (see cheatsheet §10).

### `components/ui/` inventory

Installed shadcn primitives: `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `select`, `separator`, `skeleton`, `table`, `tabs`.

**`choice-group.tsx` is custom** — a segmented control built for this app, not from the shadcn registry.

### Patterns

- **`cn()`** (`lib/utils.ts`) — `twMerge(clsx(...))`; use when merging Tailwind classes so later wins (e.g. `CLICKABLE_ROW_CLASS` over shadcn defaults).
- **Variants** — `class-variance-authority` (`cva`) in components like `button.tsx`.
- **Icons** — `lucide-react`.
- **Toasts** — `import { toast } from "sonner"`; global `<Toaster richColors closeButton position="top-center" />` in `App.tsx`. There is no shadcn toast component in this project.
- **Click affordances** — `CLICKABLE_CARD_CLASS` / `CLICKABLE_ROW_CLASS` from `lib/clickable.ts` for consistent hover on cards and table rows.

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

Default environment is **`node`** so pure tests do not pull DOM deps.

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

**Key practices:**

1. Mock `@/api/client` with a **stable** `apiClient` object (recreated mocks break `useCallback` deps).
2. Mock Clerk and sonner — pages assume signed-in unless testing public behavior.
3. Use `MemoryRouter` + `Routes` to supply `:params`.
4. Assert on rendered output and which API paths were called.

---

## 9. Polling and refresh cadence

Two screens poll on an interval. **Do not shorten these casually** — they trade API load against freshness.

### `SessionDetailPage` — 60 seconds

```ts
setInterval(() => {
  void Promise.all([loadQueue(), loadSession()]).catch(() => {});
}, 60_000);
```

**Why 60s:** Attendees watching the queue on their phone do not need sub-second updates. Floor trials span hours; a one-minute lag is acceptable and keeps hundreds of open tabs from hammering queue endpoints.

Also ticks `now` for time-relative UI on the same interval.

### `ManagerPage` (active-sessions section) — 8 seconds

```ts
setInterval(() => void loadLiveQueues(lqSessionId, true), 8000);
```

Plus a **1 second** `lqNowTick` interval only to refresh the “Updated Xs ago” staleness label without re-fetching.

**Why 8s:** Managers actively reorder and advance the queue; they need near-real-time state. Silent polling (`silent = true`) avoids flashing loading skeletons every tick. Failures set `lqRefreshFailed` and turn the label amber: `Couldn't refresh — tap to retry`. Success shows `Updated {formatAgo(...)}` (e.g. `just now`, `12s ago`).

| Surface | Interval | Rationale |
|---------|----------|-----------|
| Public session detail | 60s | Low urgency, many passive viewers |
| Manager live queue | 8s | Operational tool; stale queue causes wrong decisions |

---

## 10. “Where do I add…?” cheatsheet

### A new page

1. Create `src/pages/MyPage.tsx` (default export).
2. Add a `<Route>` in `App.tsx` inside or outside `Layout` as appropriate.
3. Wrap with `RequireAuth`, `AdminGuard`, or `ManagerGuard` if needed.
4. Fetch with `useApiClient()` in `useEffect` / handlers — no new global layer.
5. Add `MyPage.test.tsx` with `// @vitest-environment jsdom` if it renders UI.
6. Link from `NavBar` or an existing page if it should be discoverable.

### A new admin section

1. Add slug to `ADMIN_SECTIONS` in `AdminPage.tsx`.
2. Add `<TabsContent value="your-slug">` block in the same file.
3. Add `{ to: "/admin/your-slug", label: "…" }` to `SUPERUSER_ITEMS` in `NavBar.tsx`.
4. Section is immediately bookmarkable at `/admin/your-slug`.

### A new manager section

Same pattern with `MANAGER_SECTIONS`, `ManagerPage.tsx` `<TabsContent>`, and `MANAGER_ITEMS` in `NavBar.tsx`.

### A new API call

1. Prefer `const api = useApiClient()` in the component or hook.
2. Use types from `@deejaytools/schemas` where available.
3. Catch errors and `toast.error(e.message)` (or inline error state).
4. Only use raw `fetch` if unauthenticated, non-React (chunk upload), or a documented exception.

### A new shadcn component

From `apps/app`:

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
| Profile / roles | `hooks/useAuthMe.ts` |
| Clerk → DB sync | `components/AuthSync.tsx` |
| Upload pipeline | `lib/chunkedSongUpload.ts`, `components/SongUploadForm.tsx` |
| Tests setup | `vitest.config.ts`, `test/setup.ts` |

For API shapes, auth rules, and endpoint details, see `apps/api/docs/API.md` and `apps/api/docs/AUTHENTICATION.md`.
