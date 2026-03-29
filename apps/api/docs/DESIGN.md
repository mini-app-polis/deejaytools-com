# deejaytools-com — design decisions

## Stack choices

**Hono on Node over Cloudflare Workers**
The original `routine-management-platform` ran on Cloudflare Workers with D1 (SQLite). Replaced with Hono on Node deployed to Railway. Reasons: Railway is the ecosystem standard for all API services, Workers has compute/duration limits that constrain real-time floor trial logic, and moving off D1 allows PostgreSQL as the universal database standard.

**Drizzle ORM over raw SQL**
Drizzle gives TypeScript-native schema definitions, migration management via Drizzle Kit, and explicit query building that stays close to SQL without hiding it. Consistent with SQLAlchemy on the Python side — both are explicit-first ORMs.

**PostgreSQL over D1**
D1 is a Workers-specific constraint. PostgreSQL on Railway is the ecosystem standard for all new services. The schema migrated cleanly from the D1 SQL migrations.

## API design

**Resource-oriented routes over session-nested routes**
The old platform nested routes under sessions (e.g. `/api/sessions/:id/checkin`). The new platform uses flat resource routes (`/v1/checkins?session_id=`). More consistent, easier to extend, and cleaner for the frontend to reason about.

**queue_type: 'standard' over 'non_priority'**
The old platform used `non_priority` as the non-priority queue type value. Renamed to `standard` throughout — more intuitive and consistent with how the UI presents it.

**queue_type supplied by caller**
The old platform auto-determined queue type server-side based on division `is_priority` flag and completed run count. The new platform accepts `queue_type` from the caller and validates the `max_priority_runs` cap independently. Gives the frontend explicit control and makes the logic testable.

**pair_id optional on checkin creation**
`POST /v1/checkins` accepts either `pair_id` (explicit) or `partner_id` (find-or-create the pairs row server-side). Reduces frontend complexity — the caller doesn't need to manage pair IDs explicitly.

## Shared library

**kaiano-ts-utils in-repo**
`packages/ts-utils` lives inside this monorepo during development rather than as a published package. Will be extracted to its own repo (`kaiano-ts-utils`) and published to GitHub Packages once the API is stable and the library interface has stopped changing. Extraction is a one-afternoon job — the package is already structured as publishable.

## Observability

**Three-layer stack**
Layer 1 (liveness): Railway auto-restart. Layer 2 (structured logs): kaiano-ts-utils logger emitting JSON with standard shape. Layer 3 (exceptions): Sentry capturing unhandled errors. Each layer covers a distinct failure mode.

**Session status via cron tick**
Session status transitions (scheduled → checkin_open → in_progress → completed) are driven by `GET /internal/tick` called by a Railway cron job every minute. Protected by `x-tick-secret` header. Replaces Cloudflare Workers' native `scheduled()` handler.
