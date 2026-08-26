# ADR-005. Floor-trial queue model, as built

Date: 2026-08-26

## Status

Accepted. Supersedes [ADR-004](./ADR-004-floor-trial-queue-model.md).

## Context

ADR-004 recorded the queue design agreed in April 2026. The system that
shipped diverges from it far enough that the document is now actively
misleading rather than merely stale:

- ADR-004's Context section **rejects** auto-promotion as the broken old
  shape and specifies manual admin promotion as the fix. Auto-promotion is
  what shipped. `POST /v1/queue/promote` still exists but has no frontend
  caller; the manager UI reads "Fills automatically".
- Managed partnerships do not appear in ADR-004 at all, yet the entity XOR
  — the document's central concept — is three-way in every table.
- Queue actions were specified as slot-1-only. They are available on any
  active row.
- Reorder was listed as out of scope for v1. It shipped as
  `POST /v1/queue/move-down`.
- Concurrency was specified as optimistic-with-retry. The code takes a
  pessimistic `SELECT … FOR UPDATE` on the session row and never retries.

ADRs record decisions as they were made, so ADR-004 is not rewritten. This
ADR describes the model as it actually works, and is the document to trust.

## Decision

### Entities

A queue entry belongs to exactly one entity, enforced by a three-way `CHECK`
on `checkins`, `queue_entries` and `runs`:

| Entity | Column | Status |
|---|---|---|
| Pair | `entity_pair_id` → `pairs.id` | Current |
| Managed partnership | `entity_managed_partnership_id` | Current |
| Solo | `entity_solo_user_id` → `users.id` | **Legacy, read-only** |

Solo is no longer creatable. No UI produces a partnerless song, both
creation paths have been closed, and the columns remain only so historical
rows keep rendering and keep counting toward run limits. New code must not
write a solo entity; read paths must continue to handle it.

Note `partners.kind = 'solo'` is unrelated — a placeholder partner record
with a **non-null** `partner_id`. Those are pair entities.

### Queues

Three, on one table discriminated by `queue_type`: `priority`,
`non_priority`, `active`. Position is unique per `(session_id, queue_type,
position)`, 1-based.

### Admission

On check-in, an entity enters `priority` or `non_priority`
(`lib/queue/admission.ts:26-41`). Priority requires **all** of:

1. the session-division is flagged `is_priority`;
2. the entity's completed runs **in that division for that session or
   event** are below the session's `priority_run_limit`;
3. an event-level `event_division_run_limits` row, if present, is not
   already met.

Run counts are scoped per entity **and** per division
(`lib/queue/runCounts.ts:23-49`). Runs in one division never affect
admission in another.

### Filling the active queue — automatic

`fillActiveQueue()` (`lib/queue/fill.ts:63-158`) drains priority first, then
standard, into `active` up to the caps. It runs on every check-in, run
complete, run incomplete, withdraw, and on every scheduler tick. Nobody
promotes by hand.

Caps are `active_priority_max` (default 6) and `active_non_priority_max`
(default 4), with a `CHECK` that non-priority ≤ priority. A non-priority
entry is admitted only when the priority queue is empty.

Auto-fill is inert unless `now` is inside `[floor_trial_starts_at,
floor_trial_ends_at)` and the session is not cancelled.

### Actions

Available on **any** active row, not only position 1:

| Action | Effect |
|---|---|
| Run complete | Writes a `runs` row, removes the entry, compacts, refills |
| Run incomplete | Rotates the entry to the bottom of active |
| Move down | Swaps with `position + 1` within the same queue |
| Withdraw | Removes the entry, compacts, refills |

Position 1 is a visual treatment only.

A dancer may also withdraw their own entry —
`DELETE /v1/checkins/:id` under `requireAuth`, ownership resolved through
the solo id, `pairs.userAId`, or `managedPartnerships.userId`. This is a
second, non-admin write path into the queue.

### Concurrency — pessimistic

Every queue transaction begins by locking the session row
(`lockSessionForFill()`, `lib/queue/fill.ts:24-41`), which establishes a
single lock order and serialises all mutations for that session. There is
no server-side retry: a conflict returns **409** and the client retries.

### Compaction

Closing a gap is a two-phase per-row loop, not the single `UPDATE` ADR-004
specified — each affected row moves to `position + 1_000_000`, then to
`position - 1` (`lib/queue/compaction.ts:19-60`). The sentinel exists to
avoid transient unique-key collisions. Rotate and move-down use their own
sentinels.

### Session status

`sessions.status` (`scheduled | checkin_open | in_progress | completed |
cancelled`) is advanced by `tickSessionStatuses()` on an in-process
scheduler running every 30 s, also forceable via `GET /internal/tick`
behind `TICK_SECRET`.

Status gates the queue: auto-fill only runs inside the trial window, and
cap enforcement is **skipped** for completed and cancelled sessions, so a
manual promote can exceed the caps on a closed session.

### Check-in preconditions

Beyond the check-in window: if the session belongs to an event, the song
must already have an `event_song_submissions` row for that event
(`routes/checkins.ts:178-208`). In practice this is the most common
rejection. Admins may check in on behalf of a user with
`on_behalf_of_user_id`, in which case the server derives the entity from
the song.

### Reads

- `GET /v1/queue/:id/active` — public
- `GET /v1/queue/:id/waiting` — dancer view, priority and standard
  concatenated with a `subQueue` tag
- `GET /v1/queue/:id/priority`, `/non-priority` — admin

All queue reads are served from a 3-second response cache, so the polling
UI is not hitting the database per request.

### Audit trail

`queue_events` is append-only and records check-in, promotion, run
completion, rotation, withdrawal, and within-queue moves
(`moved_within_queue`). Move-down writes one row for the initiating entry;
the swapped-with entry's position change is the inverse and does not need
its own row.

### Schema conventions

Ids are `text` (UUIDs generated in the application), not `uuid`.
Timestamps are `bigint` epoch-milliseconds, not `timestamptz`.
`runs.event_id` and `queue_events.actor_user_id` are nullable — the latter
because the scheduler acts with no actor.

## Consequences

**Easier.** The floor runs itself: entries surface without an operator, and
the failure mode of a distracted admin is gone. Any active row can be acted
on, so a stuck entry no longer blocks the ones behind it. Pessimistic
locking makes concurrent admin actions deterministic instead of racy.

**Harder.** Automatic filling means less direct control — an operator who
wants a specific entry on the floor must move others out of the way rather
than promote it. The 30-second tick bounds how quickly status changes take
effect. Pessimistic locking serialises per session, which is fine at floor
scale but would need revisiting at much higher write rates.

**Outstanding.** Solo remains as read-only columns; dropping them needs a
backfill migration and carries real hazards, since several ownership
queries seed their `OR` array with the solo predicate and collapse
dangerously if it is naively removed.
