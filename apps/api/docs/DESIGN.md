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

**common-typescript-utils (npm) + @deejaytools/schemas (workspace)**
Generic cross-project utilities (structured logger, success/error envelopes, Clerk `verifyClerkToken`, `UserRoleSchema`, pagination helpers) ship as [`common-typescript-utils`](https://www.npmjs.com/package/common-typescript-utils) on npm. Deejaytools-specific Zod enums (`SessionStatusSchema`, `DivisionSchema`, `PartnerRoleSchema`, etc.) live in `packages/schemas` so the API and app stay aligned without coupling domain types to the generic library.

## Observability

**Three-layer stack**
Layer 1 (liveness): Railway auto-restart. Layer 2 (structured logs): `common-typescript-utils` logger emitting JSON with standard shape. Layer 3 (exceptions): Sentry capturing unhandled errors. Each layer covers a distinct failure mode.

**Session status via cron tick**
Session status transitions (scheduled → checkin_open → in_progress → completed) are driven by `GET /internal/tick` called by a Railway cron job every minute. Protected by `x-tick-secret` header. Replaces Cloudflare Workers' native `scheduled()` handler.

## Music management

**Partner dance role on the partner record, not the user**
Each partner relationship has a `partner_role` field (`leader` | `follower`) representing the partner's role. The uploading user's role is always the opposite. This allows the same user to be a leader with one partner and a follower with another. The role lives on the partner record rather than the user because it varies per relationship.

**Filename ordering: always leader_follower**
Processed filenames always put the leader name first regardless of who uploaded the song. The server resolves ordering at upload time based on `partner_role`: if the partner is a follower, the uploading user is the leader (user name first); if the partner is a leader, the uploading user is the follower (partner name first). Solo uploads use the user name only.

Format: `{leader}_{follower}_{division}_{seasonYear}_{routineName}_{descriptor}_v{N}.{ext}`

**Two-step atomic upload pattern**
Song creation is split into two API calls: `POST /v1/songs` (JSON metadata, creates the DB record) and `POST /v1/songs/:id/upload` (multipart file, tags and uploads to Drive, updates the record). The frontend orchestrates both as a single atomic operation — if the upload fails after the record is created, the frontend deletes the record automatically. This keeps the API clean while giving the user a single-step experience.

**Per-format audio tagging**
ID3 tags (via `node-id3`) for MP3 and WAV. Vorbis comments (via `flac-tagger`) for FLAC. iTunes-style ilst atoms (manual Buffer manipulation) for m4a. All other formats pass through untagged. Each format preserves existing tags in a comment field as `prev[title=...,artist=...]` before overwriting.

**Divisions list hardcoded**
The 15 WCS divisions are hardcoded in the frontend. Admin-configurable divisions are deferred — when the floor trial UX is revisited, a divisions management UI should be part of that pass since session divisions and song divisions share the same list.
