# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for this
repository. ADRs document significant architectural decisions, the
context around them, and their consequences.

## Format

Each ADR is a markdown file named `ADR-NNN-title-in-kebab-case.md`
where `NNN` is a zero-padded 3-digit sequence number starting at `001`.
This matches ecosystem-standards DOC-005.

## Template

```markdown
# ADR-NNN. Title of the decision

Date: YYYY-MM-DD

## Status

Proposed | Accepted | Superseded by [ADR-NNN](./ADR-NNN-other.md)

## Context

What is the issue that we're seeing that is motivating this decision?

## Decision

What is the change that we're actually proposing or doing?

## Consequences

What becomes easier or more difficult to do because of this change?
```

## Index

- [ADR-001 — Run Drizzle migrations at Railway deploy time](./ADR-001-drizzle-migrations-at-deploy.md)
- [ADR-002 — Validation 400 responses use the canonical error envelope](./ADR-002-validation-envelope-shape.md)
- [ADR-003 — Clerk verification: session JWTs only, no M2M](./ADR-003-jwt-only-clerk-verification.md)
- [ADR-004 — Floor-trial queue model](./ADR-004-floor-trial-queue-model.md)
