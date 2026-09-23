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
- Endpoints that touch Google Drive or send email (song upload and removal,
  check-in create/withdraw, event song submissions, feedback) are skipped
  by the live suite and covered only by schema-validated unit fixtures.
- The queue steps depend on the API's scheduler tick (30 s), so the suite
  takes a few minutes and cannot run in parallel with itself.
- The schema file is still copied between repos; keeping the copies
  identical is a separate guard.
