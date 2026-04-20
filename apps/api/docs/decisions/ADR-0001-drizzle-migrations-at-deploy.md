# 0001. Run Drizzle migrations at Railway deploy time

Date: 2026-04-20

## Status

Accepted

## Context

This service uses Drizzle ORM against PostgreSQL. Drizzle produces
timestamped migration files under `apps/api/drizzle/` via
`drizzle-kit generate` and applies them via `drizzle-kit migrate`.

Two places could run the migrations:

1. **CI (GitHub Actions)** — add a `drizzle-kit migrate` step to the
   release job. Runs once per deploy from the CI runner.
2. **Deploy hook (Railway)** — run `drizzle-kit migrate` as a Railway
   release command before the service starts serving traffic.

CI-run migrations require the CI runner to have production database
credentials. Deploy-hook migrations run from the service container
itself, where the `DATABASE_URL` is already injected by Railway.

## Decision

Migrations run via Railway's deploy hook, configured on the service
(not in `ci.yml`). CI verifies the app builds and tests pass;
Railway applies migrations before starting the new image.

## Consequences

**Easier:**
- CI runner does not need production database credentials.
- Migrations always run in the same network/runtime as the service
  that depends on the new schema.
- Rollback is automatic — if migration fails, Railway halts the
  deploy and the previous service image keeps serving traffic.

**Harder:**
- Schema drift between dev and production is not caught by CI; you
  only notice when deploy runs.
- Migration runtime (locks, long-running ALTERs) can block deploys.
  For large migrations, author them to be applied out-of-band first.

**Cost of this decision against standards:**
- API-011 flags absence of `drizzle-kit migrate` in ci.yml. Exempted
  in `apps/api/evaluator.yaml` with this ADR as the rationale.

## References

- api-kaianolevine-com ADR-0001 documents the equivalent decision for
  Alembic (raw SQL flavor).
- ecosystem-standards API-011 (CI must run migrations at deploy).
