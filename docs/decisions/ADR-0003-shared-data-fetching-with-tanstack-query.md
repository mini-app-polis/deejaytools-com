# ADR-0003: Shared data fetching with TanStack Query

**Date:** 2026-10-30
**Status:** Accepted
**Repo:** deejaytools-com

---

## Context

Every page and most section components fetch their own data with a
hand-written `useEffect` + `useState` pair around `call(api, …)`. Each one
decides for itself how to cancel, how to report a failure, and when to
fetch again, and they decide differently:

- **Cancellation.** `SessionsPage` guards its effect with a `let on = true`
  flag and `FloorTrialsPage` and `useStaffEvents` with `cancelled`;
  `EventsPage` and `EventDetailPage` call a `load()` that sets state with no
  guard, so a response that lands after the page has moved on still writes.
  `useAuthMe` keeps a request counter so only the newest answer is kept. Four
  techniques, and some screens use none.
- **Errors.** `SessionsPage` and `FloorTrialsPage` toast a failure.
  `ManagerPage`'s `loadSessions`, `MyContentPage`'s active sessions, and the
  staff `CheckinForSection` and `RunHistorySection` turn a failure into `[]`,
  so a dead API reads as "no sessions". `AdminPage` starts several loaders
  with `.catch(() => {})`. `EventsPage` and `EventDetailPage` render an inline
  error for their sessions part.
- **Caching and deduplication.** The events list is read separately by
  seven callers (`EventsPage`, `FloorTrialsPage`, `EventSubmissionsPage`,
  `MyContentPage`, `ManagerPage`, `AdminPage`, `useStaffEvents`) and the
  sessions list by eleven, each with its own request. Two hooks hand-build a
  module-level cache to share one request: `useAuthMe` (an external store
  read through `useSyncExternalStore`) and `useDivisions` (a shared
  promise). `useApiVersion` fetches once per mounted caller.
- **Polling.** `SessionDetailPage` (60 s), `ManagerPage`'s live queue and the
  staff `LiveQueueSection` (8 s) each run their own `setInterval`, with a
  hand-rolled "silent" flag so a background refresh does not flash a
  skeleton, and their own refresh-failed state.
- **After a change.** A mutation reloads what it touched by calling the
  page's own `load()` again; nothing else on screen that shows the same data
  hears about it.

Several review findings — the auth-me record fetched once per caller,
swallowed errors, stale responses overwriting newer ones — trace back to
this one cause. Fixing them page by page repeats the same code in each
place and leaves the next page to get it wrong again.

The options were one in-house hook (`useEndpoint(ep, args)`) or a library.
An in-house hook would have to grow cancellation, deduplication, a shared
cache, invalidation after mutations, background refetch and polling — that
is, rebuild a query library and own its bugs.

## Decision

**TanStack Query (`@tanstack/react-query`) manages server state.** Component
state (`useState`) remains for what the user is editing and UI state.

1. **One `QueryClient` at the app root.** Created once in its own module and
   provided by a `QueryClientProvider` wrapping `<App />` inside
   `ClerkProvider` in `main.tsx`, so every route and guard shares one cache.
   Its defaults are set in that one module: no retry for an `ApiError` with
   a 4xx status (validation, auth and not-found will not change on a retry),
   a bounded retry for network errors and 5xx, and a short `staleTime` so
   pages that share a list share one request.
2. **Every request still goes through `call()`.** Query and mutation
   functions call `call(api, endpoints.x.y, { params, body })` from
   `src/api/endpoints.ts`, so the catalog stays the only place a path is
   written and every response is still validated against its schema
   (ADR-0002). Raw `fetch` stays limited to the callers ARCHITECTURE §3
   lists (`AuthSync`, the chunk uploader, `FeedbackPage`, `useApiVersion`).
3. **Query keys derive from endpoint ids.** A key is `[endpoint.id, params]`
   (for example `["sessions.list", { eventId }]`), built by one helper next
   to the catalog, never written by hand. Invalidating by the id alone
   (`["sessions.list"]`) refreshes every variant of that list, so a mutation
   says what it changed in terms of endpoints.
4. **Thin wrappers over the catalog.** A query hook and a mutation hook take
   an endpoint and its arguments and supply the key and the `call()`; pages
   do not assemble `queryFn`s themselves.
5. **Errors are shown, not swallowed.** A query's `error` is rendered where
   its data would be (an inline message, with a retry where it helps); a
   failed load never becomes an empty list. Mutation failures keep using a
   toast.
6. **Polling uses `refetchInterval`** at the intervals ARCHITECTURE §9
   records (60 s session detail, 8 s live queues). Background refetches do
   not show a skeleton, because `isLoading` is only true with no data.
7. **The shared `useAuthMe` store stays as it is until the last step.** It
   fetches once per page load, keys its record by Clerk user id, waits for
   `AuthSync` on `USER_NOT_SYNCED` and toasts a failure once, and its tests
   pin that behaviour. It moves onto the `QueryClient` (keyed
   `["auth.me", userId]`) as the last migration step, together with
   `useDivisions` and `useApiVersion`, once every page reads through the
   client and a profile mutation can invalidate it alongside the data it
   affects.

This record decides the direction; it adds no dependency and changes no
code. Until a page is migrated it keeps its current fetching.

## Consequences

**Easier:**
- Cancellation and out-of-order responses are handled in one place: a
  response is rendered only while a component still reads its key.
- Screens that read the same endpoint share one request and one cached
  answer; navigating back shows cached data while it refreshes.
- A mutation invalidates the endpoints it changed and every screen showing
  them updates, not only the one that made the change.
- Pages shrink: the loading/error/data state, the cancel flag and the
  polling interval disappear from each of them.
- Unit tests keep mocking `@/api/client`; the query functions still call
  through it.

**Harder:**
- A new runtime dependency (roughly 13 kB gzipped) that the fleet's
  dependency updates must track.
- Every component test needs a `QueryClientProvider`. A shared test render
  helper creates a fresh client per test with retries off, so cached data
  and retries never leak between tests or slow a failure down.
- Until the migration finishes, two patterns coexist; ARCHITECTURE describes
  both, and new code uses the query hooks.
- Cache lifetime becomes a design decision: data can be served from cache
  where a page fetches on every mount today. `staleTime` and invalidation
  have to be chosen per endpoint where the default does not fit (the live
  queues, for instance, always refetch on their interval).

## Migration

Each step below is one follow-up task, done in order; each leaves the app
working, with its tests moved to the shared render helper.

1. **Add TanStack Query and the shared query layer.** Add
   `@tanstack/react-query`, the `QueryClient` module with the defaults above,
   the provider in `main.tsx`, the key helper and the query/mutation hooks
   over `call()`, and the test render helper. Migrate `SessionsPage` as the
   first user. Update ARCHITECTURE §1, §3 and §10.
2. **Migrate the public listing pages.** `EventsPage`, `EventDetailPage`
   (with its `EnteredEntities` roster), `FloorTrialsPage`, and the
   `useStaffEvents` hook.
3. **Migrate the polling screens.** `SessionDetailPage` (60 s), the
   `ManagerPage` active-sessions live queue and the staff
   `LiveQueueSection` (8 s), with their queue mutations invalidating the
   queue and session keys.
4. **Migrate the dancer pages and forms.** `MyContentPage`, `MyProfilePage`,
   `SongsPage`, `EventSubmissionsPage`, `SongUploadForm`,
   `SpecialUploadForm`, `PartnersSection`, `TeamsSection` and
   `ManagedPartnershipsSection`.
5. **Migrate the admin and manager pages.** Every `AdminPage` section
   (events, sessions, run history, songs, test check-in, users) and the
   remaining `ManagerPage` sections (event songs, upload for, check in
   for).
6. **Migrate the staff portal sections.** `StaffPortal`,
   `EventDetailsSection`, `EventSessionsSection`, `EventStaffSection`,
   `EventSubmissionsSection`, `CheckinForSection`, `RunHistorySection`,
   `DriveFolderSection` and `PersonPicker`.
7. **Move the shared caches onto the query client.** `useAuthMe`,
   `useDivisions` and `useApiVersion` become queries (keeping their current
   behaviour and tests), profile and staff-role mutations invalidate
   `auth.me`, and ARCHITECTURE §5 describes the result.

## References

- ADR-0002 — the endpoint catalog and `call()` every query goes through
- `src/api/endpoints.ts` — endpoint ids the query keys derive from
- `docs/ARCHITECTURE.md` §1, §3, §5, §9 — current fetching, client, auth
  state and polling
- TanStack Query documentation: https://tanstack.com/query/latest
