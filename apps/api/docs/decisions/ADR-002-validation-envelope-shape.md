# ADR-002. Validation 400 responses use the canonical error envelope

Date: 2026-04-24

## Status

Accepted

## Context

ecosystem-standards API-005 / XSTACK-002 require every API response
to use one of two envelopes:
- success: `{ data, meta }`
- error:   `{ error: { code, message } }`

`@hono/zod-validator`'s default behaviour on validation failure is to
return `{ success: false, error: ZodError }` — it does not match the
canonical envelope. The mismatch was visible in
`apps/api/src/test/helpers.ts:assertValidation400`, which had to
accept both shapes.

## Decision

A thin wrapper at `apps/api/src/lib/validate.ts` re-exports a
`zValidator` that passes a hook into `@hono/zod-validator`. The hook
reshapes failures into `CommonErrors.validationError(...)` from
`common-typescript-utils`, producing the canonical
`{ error: { code, message } }` envelope. All route files import
`zValidator` from this wrapper rather than directly from
`@hono/zod-validator`.

## Consequences

**Easier:**
- Every 400 across the API uses the same shape. Frontend error
  handling becomes uniform.
- `assertValidation400` is now a strict contract check.

**Harder:**
- One indirection. New routes must import from `lib/validate.js` not
  `@hono/zod-validator` directly. Code review and the wrapper's
  docstring catch this.

## References

- ecosystem-standards API-005 (Response envelope on all endpoints)
- ecosystem-standards XSTACK-002 (Cross-stack response shape parity)
- apps/api/src/lib/validate.ts — wrapper implementation
