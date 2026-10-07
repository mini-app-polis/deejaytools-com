# ADR-002. The API contract lives in the web app

Date: 2026-09-22

## Status

Accepted

## Context

The web app and the API are separate repositories, and the API is due to be
rewritten (Hono/TypeScript → FastAPI/Python). The two already shared zod
schemas — a copy in each repo — but nothing enforced them at runtime: the
client cast every response with `api.get<T>()`, pages built `/v1/...` paths
inline, and unit-test mocks were partial objects that no schema checked. A
field the API renamed or dropped surfaced as `undefined` deep in a component,
if at all. The rewrite needs a statement of the contract that is complete,
executable, and independent of the implementation being replaced.

## Decision

The contract is owned by its consumer, the web app, in three layers:

1. **Catalog.** `src/api/endpoints.ts` declares every call the app makes —
   method, access level, path, response schema. Pages call `call()`; no path
   is written anywhere else.
2. **Boundary validation.** Every response is parsed against its schema.
   Strict (throw) in dev, tests and the contract suite; in production a
   violation is reported to Sentry and the raw data is used, so drift is
   seen without taking a page down. Unit-test mocks are built by `fx.*`
   factories that parse through the same schemas.
3. **Live suite.** `src/contract` walks the catalog against the development
   API with a real Clerk session (created through the Clerk Backend API for
   a dedicated admin test user), validating every response and the
   error envelope, and probing that every non-public endpoint rejects an
   unauthenticated call. Data it creates hangs off one tagged event and is
   deleted at the end. An endpoint neither exercised nor skipped with a
   written reason fails the run.

It refuses to run unless the Clerk key is a development key and the host
is not a production hostname; a production API would also reject the
development token before the first write.

## Consequences

- A rewrite of the API is done when `pnpm test:contract` passes against it.
- Adding an endpoint means adding it to the catalog, which the live suite
  then forces to be covered or explicitly skipped.
- Endpoints that touch Google Drive are exercised for real against the dev
  Drive folder: song upload and removal, event song submissions, and check-in
  create/withdraw, which need a submitted song. The suite waits for the
  background Drive jobs (the event copy, and trashing on removal) to finish.
  Only feedback, which sends a real email, is skipped, and it is covered by
  schema-validated unit fixtures alone.
- The queue steps depend on the API's scheduler tick (30 s), so the suite
  takes a few minutes and cannot run in parallel with itself.
- `src/schemas` is the app's own view of the contract. Since the API moved to
  api-deejaytools (Python), there is no second copy to keep in step; this
  suite is the only check that the API matches it.
