# ADR-003. Clerk verification: session JWTs only, no M2M

Date: 2026-04-24

## Status

Accepted

## Context

ecosystem-standards CD-012 requires API services to verify both:
1. Clerk session JWTs (RS256, verified locally against JWKS) — for
   human callers.
2. Clerk M2M opaque tokens (verified remotely via Clerk's BAPI
   `m2m_tokens/verify` endpoint) — for cog/service callers.

The deejaytools-com ecosystem has no machine callers today:
- The API serves the React app at deejaytools.com (browser-only).
- The Python cogs (deejay-cog, evaluator-cog, watcher-cog,
  notes-ingest-cog) push to api-kaianolevine-com, not to this API.
- There is no scheduled job, third-party integration, or sibling
  TypeScript service that calls this API server-to-server.

Adding M2M verification code that nothing exercises would be future
drift surface — code that won't be tested in production traffic and
may rot before its first real caller.

## Decision

Implement only the JWT path. `apps/api/src/middleware/auth.ts` calls
`verifyClerkToken` from `common-typescript-utils` against the JWKS
document at `CLERK_JWKS_URL`. CD-012 is recorded as a deferral in
`apps/api/evaluator.yaml`, not an exemption — the rule still applies,
the gap is real, and the trigger to remediate is well-defined.

## Trigger to revisit

Add the M2M path when any of the following becomes true:
- A Python cog needs to write to deejaytools-com-api.
- A TypeScript service in the ecosystem needs to make M2M calls and
  `common-typescript-utils` ships an M2M helper.
- Any non-browser caller (scheduled job, third-party webhook, etc.)
  is introduced.

## Consequences

**Easier:**
- One verification path to maintain and test.
- No `CLERK_SECRET_KEY` required on the API service.

**Harder:**
- When an M2M caller appears, this is the first thing that has to
  change. The deferral entry plus this ADR document the implementation
  shape: token format discrimination by dot count (JWTs have two,
  opaque tokens have none); add the BAPI verify call; extract `sub`
  from both paths uniformly.

## References

- ecosystem-standards CD-012 (Internal auth via Clerk Bearer tokens)
- apps/api/evaluator.yaml — CD-012 deferral
- apps/api/src/middleware/auth.ts — JWT-only implementation
