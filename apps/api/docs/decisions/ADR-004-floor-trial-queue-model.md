# ADR-004. Floor-trial queue model

Date: 2026-04-25

## Status

Accepted

## Context

Floor trials are the central operational primitive of deejaytools-com.
A weekend competition event runs one or more floor-trial sessions, in
which dance entities (couples or solos) check in, wait their turn in
priority and non-priority queues, get pulled into an active queue by
admins, run their routines, and either complete or drop out. The
process is real-time, manual where it matters, and produces records
that are useful long after the event ends.

The schema and routes that exist today are an early sketch. They
predate a full understanding of how the floor trial actually runs:

- `floor_slots` is a fixed N-slot table with hardcoded count
  (`session.max_slots`), and the `slotRoutes.fill` endpoint
  auto-promotes the next priority/non-priority entry. Real operation
  requires manual promotion and a different shape.
- `checkins.queue_type` is set at check-in and never changes, but the
  real model has queue assignment recomputed at check-in time based on
  prior runs, and queues that drain into active.
- `checkins.status` overlaps with queue membership. Live state and
  history are conflated in one table.
- There is no audit trail for queue mutations.
- There is no concept of an event-level run limit spanning a weekend's
  sessions.
- Session-level priority configuration (`session_divisions.is_priority`)
  exists but the per-division priority-run-limit ("X runs of priority
  divisions are priority, X+1 onward are non-priority") is missing.

There is no production data on this platform yet. The floor-trial
*process* has been run in past events using ad-hoc tooling; this is
the first time it is being modelled in deejaytools-com. The redesign
is free to drop tables and start fresh — no migration of historical
records is needed.

## Decision

Replace the queue-related schema with four append-only history tables
and one mutable live-state table, plus modest column additions to
`sessions` and `session_divisions` and a new event-level run-limit
table.

### Conceptual model

**Event.** A weekend competition. Spans multiple days. Has an optional
per-division cross-event run limit (rarely used; field exists for the
case where an event caps total runs for a division across the whole
weekend).

**Session.** One floor-trial block within an event. Has its own
start/end times, its own check-in opens-at time (auto-opens, no manual
trigger), and its own per-division run limits and priority
configuration. Sessions within a single event may not overlap in time.
Sessions across different events may overlap. Each session has two
configurable caps on the active queue: a priority-admission cap and a
non-priority-admission cap.

**Division (per session).** The list of divisions that may check in to
this session. Each entry marks whether the division is priority for
this session and the per-session priority-run-limit (the X in "runs
1..X of this division go priority").

**Entity.** A specific (couple-or-solo + song) combination. A single
dancer with two different songs in two different divisions is two
entities. A pair (two dancers) with the same song is one entity. The
existing `pairs`, `users`, and `songs` tables continue to model the
underlying parts; this ADR does not change them.

**Check-in.** An entity submitting an intent to run in a specific
session, in a specific division. Allowed only when the session's
check-in is open (between `checkin_opens_at` and session end). At
check-in time the system computes:

- the entity's prior run count in this division for this session
- the entity's prior run count in this division for the event (only
  if the event has a division-level limit set)
- the session's priority-division list and per-division X
- whether the same entity already has a live queue entry in this
  session (rejection if so)

…and from those determines the queue: priority or non-priority.

**Three queues per session:**

1. **Priority queue.** Auto-fed by check-ins for priority divisions
   under the per-division X-cap. Unbounded length. Append at bottom.
   No automatic re-sorting; arrival order is strict.
2. **Non-priority queue.** Auto-fed by check-ins that didn't qualify
   for priority. Unbounded length. Append at bottom. No automatic
   re-sorting; arrival order is strict.
3. **Active queue.** The floor's working set. Manual promotion by
   admins. Capped at `active_priority_max` (default 6) total entries.
   Slot 1 is currently running. Slots 2..N are upcoming, in order.

**Entity provenance.** A check-in lands in priority or non-priority
based on rules; once promoted to active, the entry no longer carries
priority/non-priority status. Active is a flat ordered list.
Provenance only matters at admission time.

**Run.** A completed routine. Recorded when an admin marks the slot-1
active entry as "run complete." A run includes entity, session,
division, song, and completion time. Run counts (for priority/
non-priority assignment) are queried from this table.

**Auto-compaction.** When any entry leaves any queue, all entries
below shift up to close the gap. There are never holes in any queue.
Position N implies position N-1 exists.

**No automatic drop-out.** Active-queue entries cannot be involuntarily
ejected by another entry. The "run-incomplete" action rotates an entry
from slot 1 to the bottom of active; if active is full this is slot 6,
and the entry stays in active. The only way an entry leaves active is
via explicit admin action: run complete, withdraw, or being marked
incomplete with subsequent runs draining the queue below 6.

**Single-entry rule.** An entity can have at most one row in
`queue_entries` for a given session at any time. The same pair (or
same solo user) cannot be in priority and non-priority simultaneously.
The same pair cannot be checked in for two different divisions
simultaneously in the same session. After their run completes (or they
withdraw), the `queue_entries` row goes away — at that point they're
free to check in again, which creates a fresh `checkins` row and a
fresh `queue_entries` row.

A subtlety: a *pair* `(A, B)` and a *solo* entry for user A can both
be live in the same session. They are different entities. Different
routines, different songs. The single-entry rule applies per entity,
not per natural-person.

**Promotion admission rules** (the only constraint on growing active):

- Promoting a *priority-queue entry* into active is allowed when
  `count(active) < session.active_priority_max`.
- Promoting a *non-priority-queue entry* into active is allowed when
  `count(active) < session.active_non_priority_max` AND
  `count(priority_queue) == 0`.

`active_non_priority_max <= active_priority_max` is enforced by a
CHECK constraint on `sessions`.

**Run-count predicate** (the rule for priority assignment at
check-in time):

```
is_priority(entity, session, division) :=
    session_division.is_priority
  AND (runs_this_session(entity, division) < session_division.priority_run_limit)
  AND (event_limit is null
       OR runs_this_event(entity, division) < event_limit)
```

Both the session and event predicates must be under cap (when each
applies). If `is_priority` returns false, the entry is non-priority.
If the division isn't in the session at all, check-in is rejected.

### Schema changes

#### Dropped

- `floor_slots` — replaced by `queue_entries` rows with
  `queue_type='active'`.
- The current `checkins` table is replaced by a new `checkins` table
  of different shape (history-only). All current `checkins` columns
  are reconsidered.
- `sessions.max_slots` — replaced by `active_priority_max` and
  `active_non_priority_max`.

#### Added — `checkins` (history; append-only)

One row per check-in submission. Never updated. A re-check-in after a
run is a new row.

| Column                  | Type                            | Notes |
|-------------------------|---------------------------------|-------|
| id                      | uuid PK                         | |
| session_id              | uuid FK → sessions.id           | NOT NULL |
| division_name           | text                            | NOT NULL; FK pair `(session_id, division_name)` → `session_divisions` |
| entity_pair_id          | uuid FK → pairs.id              | nullable; one of pair / solo required |
| entity_solo_user_id     | text FK → users.id              | nullable |
| song_id                 | uuid FK → songs.id              | NOT NULL |
| submitted_by_user_id    | text FK → users.id              | NOT NULL; the human who hit submit |
| initial_queue           | enum('priority','non_priority') | NOT NULL; the queue this check-in landed in. Snapshot at the moment of check-in. |
| created_at              | timestamptz                     | NOT NULL DEFAULT now() |
| notes                   | text                            | nullable; the dancer's "instructions for the deejay" field |

Constraint: CHECK that exactly one of `entity_pair_id` /
`entity_solo_user_id` is non-null. FKs use ON DELETE RESTRICT.

#### Added — `queue_entries` (live state; mutable)

One row per entry currently sitting in any queue. When an entry leaves
a queue (promoted, completed, withdrew), the row is deleted.

The entity columns are denormalised onto this table — they're
redundant with `checkins` but make the single-entry partial unique
indexes efficient and avoid joining on every queue read.

| Column              | Type                                            | Notes |
|---------------------|-------------------------------------------------|-------|
| id                  | uuid PK                                         | |
| checkin_id          | uuid FK → checkins.id                           | NOT NULL UNIQUE |
| session_id          | uuid FK → sessions.id                           | NOT NULL; denormalised for index efficiency |
| entity_pair_id      | uuid FK → pairs.id                              | nullable; matches the source check-in |
| entity_solo_user_id | text FK → users.id                              | nullable; matches the source check-in |
| queue_type          | enum('priority','non_priority','active')        | NOT NULL |
| position            | integer                                         | NOT NULL; 1-indexed within (session_id, queue_type) |
| entered_queue_at    | timestamptz                                     | NOT NULL DEFAULT now(); reset on each queue transition |

Constraints:

- CHECK that exactly one of `entity_pair_id` / `entity_solo_user_id`
  is non-null.
- UNIQUE (session_id, queue_type, position) — no two entries at the
  same position in the same queue.
- Partial UNIQUE INDEX on (session_id, entity_pair_id) WHERE
  entity_pair_id IS NOT NULL — single-entry rule for pairs.
- Partial UNIQUE INDEX on (session_id, entity_solo_user_id) WHERE
  entity_solo_user_id IS NOT NULL — single-entry rule for solos.
- All entity FKs use ON DELETE RESTRICT.

Auto-compaction is application logic on delete: when a row is removed,
positions below shift up by 1 within (session_id, queue_type).
Implemented as a single SQL statement inside the same transaction.

#### Added — `runs` (history; append-only)

| Column                | Type                              | Notes |
|-----------------------|-----------------------------------|-------|
| id                    | uuid PK                           | |
| checkin_id            | uuid FK → checkins.id             | NOT NULL UNIQUE; the check-in that produced this run |
| session_id            | uuid FK → sessions.id             | NOT NULL; denormalised for query efficiency |
| event_id              | uuid FK → events.id               | NOT NULL; denormalised for run-count queries against event-level limits |
| division_name         | text                              | NOT NULL |
| entity_pair_id        | uuid FK → pairs.id                | nullable |
| entity_solo_user_id   | text FK → users.id                | nullable |
| song_id               | uuid FK → songs.id                | NOT NULL |
| completed_at          | timestamptz                       | NOT NULL DEFAULT now() |
| completed_by_user_id  | text FK → users.id                | NOT NULL; the admin who clicked "run complete" |

Constraint: CHECK that exactly one of `entity_pair_id` /
`entity_solo_user_id` is non-null. All entity FKs use ON DELETE
RESTRICT.

Run counts for priority/non-priority assignment are computed via:

```sql
-- Per-session, per-division, for a pair entity
SELECT count(*) FROM runs
WHERE session_id = $1 AND division_name = $2
  AND entity_pair_id = $3;

-- Per-event, per-division, for a pair entity
SELECT count(*) FROM runs
WHERE event_id = $1 AND division_name = $2
  AND entity_pair_id = $3;
```

Symmetric forms for solo entities use `entity_solo_user_id`. The
`event_id` denormalisation avoids a join through `sessions` on the
hot-path predicate evaluation.

#### Added — `queue_events` (audit log; append-only)

Every state-changing action produces a row. This is the floor's black
box.

| Column         | Type                                | Notes |
|----------------|-------------------------------------|-------|
| id             | uuid PK                             | |
| session_id     | uuid FK → sessions.id               | NOT NULL |
| checkin_id     | uuid FK → checkins.id               | nullable; absent for session-level events not tied to one entity |
| action         | enum (see below)                    | NOT NULL |
| from_queue     | enum('priority','non_priority','active') | nullable |
| from_position  | integer                             | nullable |
| to_queue       | enum('priority','non_priority','active') | nullable |
| to_position    | integer                             | nullable |
| actor_user_id  | text FK → users.id                  | NOT NULL; admin or self for check-ins |
| reason         | text                                | nullable; admin-supplied note |
| created_at     | timestamptz                         | NOT NULL DEFAULT now() |

Action enum values (v1):

- `checked_in`
- `promoted_to_active`
- `run_completed`
- `run_incomplete_rotated`
- `withdrawn`

`reordered_within_queue` and any "push back to a prior queue" actions
are deliberately *not* in the v1 enum. When reorder is implemented
(future work — see "Out of scope for v1"), the enum extends. The audit
table itself is forward-compatible.

`reason` is optional on every action. In practice it's most likely
populated for `run_incomplete_rotated` and `withdrawn`.

#### Added — `event_division_run_limits` (optional cross-event caps)

| Column               | Type                  | Notes |
|----------------------|-----------------------|-------|
| event_id             | uuid FK → events.id   | NOT NULL; part of PK |
| division_name        | text                  | NOT NULL; part of PK |
| priority_run_limit   | integer               | NOT NULL; the cap on priority runs across all sessions in this event |

Primary key (event_id, division_name). Absence of a row means no
event-level limit for that division.

#### Modified — `sessions`

Add:

- `active_priority_max INTEGER NOT NULL DEFAULT 6`
- `active_non_priority_max INTEGER NOT NULL DEFAULT 4`
- CHECK (`active_non_priority_max <= active_priority_max`)
- CHECK (`active_priority_max >= 0`)

Drop:

- `max_slots`

Existing columns (`event_id`, `start_time`, `end_time`,
`checkin_opens_at`, `created_by`) retained. `checkin_opens_at` remains
NOT NULL; the React form pre-fills it to session start time if the
admin doesn't override it. Sessions within a single event must not
overlap in `[start_time, end_time]` — enforced at the application
level in v1; future work may upgrade this to a PostgreSQL
exclusion constraint.

#### Modified — `session_divisions`

Add:

- `priority_run_limit INTEGER NOT NULL DEFAULT 0` — the X for "runs
  1..X are priority." Paired with `is_priority` (`is_priority`
  controls whether the division is priority-eligible at all;
  `priority_run_limit` controls how many runs).

Existing columns retained.

### State-transition table

Each row: an action, the writes it produces, and the rule it enforces.

| Action | Trigger | Writes | Rules / preconditions |
|--------|---------|--------|-----------------------|
| **Check in** | Dancer/admin submits check-in form | `checkins` (1 row), `queue_entries` (1 row at bottom of priority or non_priority), `queue_events` (action=`checked_in`, to_queue=that queue, to_position=bottom) | Session check-in window is open. Division is in `session_divisions`. Entity has a song. No live `queue_entries` row exists for this entity in this session. Initial queue determined by the run-count predicate above. |
| **Promote to active (priority)** | Admin clicks promote on priority-queue entry | `queue_entries` (delete priority row, compact priority queue, insert active row at bottom-most open position), `queue_events` (action=`promoted_to_active`, from_queue=priority, to_queue=active) | `count(active) < session.active_priority_max`. |
| **Promote to active (non-priority)** | Admin clicks promote on non-priority entry | Same as above, with from_queue=non_priority | `count(active) < session.active_non_priority_max` AND `count(priority_queue) == 0`. |
| **Run complete** | Admin clicks "run complete" on slot-1 active entry | `queue_entries` (delete slot 1, compact active queue), `runs` (1 row), `queue_events` (action=`run_completed`, from_queue=active, from_position=1) | Slot 1 must exist. |
| **Run incomplete (rotate)** | Admin clicks "run incomplete" on slot-1 active entry | `queue_entries` (move slot 1 row to bottom of active; compact intermediate positions up by 1), `queue_events` (action=`run_incomplete_rotated`, from_queue=active, from_position=1, to_queue=active, to_position=new bottom) | Slot 1 must exist. |
| **Withdraw** | Admin clicks withdraw on any queue_entries row | `queue_entries` (delete that row, compact its queue), `queue_events` (action=`withdrawn`, from_queue=its queue, from_position=its position) | Entry must exist. No run is recorded. No count is incremented. Available on all positions of all queues, including slot 1 of active. |

All writes for a given action happen in a single SQL transaction.

Withdraw on slot 1 of active is distinct from run-complete: withdraw
removes the entry without recording a run; run-complete records a run
and increments the run count for future check-ins.

### Live derivable state

The dancer-facing "Upcoming List" view:

```sql
SELECT * FROM queue_entries
WHERE session_id = $1 AND queue_type = 'active'
ORDER BY position ASC;
```

The currently-running entry is `position = 1` from the same query.

The "Priority Queue" admin view is the same with
`queue_type = 'priority'`. Likewise non_priority.

The historical record of an entity's runs in this division this
session is `SELECT count(*) FROM runs WHERE …` as shown in the runs
section.

The full audit replay of a session is
`SELECT * FROM queue_events WHERE session_id = $1 ORDER BY created_at`.

### Auto-compaction implementation

Implemented as a single update statement after each delete or rotate,
inside the same transaction as the delete:

```sql
UPDATE queue_entries
SET position = position - 1
WHERE session_id = $1
  AND queue_type = $2
  AND position > $deleted_position;
```

Followed by inserts at the appropriate position. Race conditions are
prevented by the UNIQUE constraint on
(session_id, queue_type, position) — concurrent admin clicks on the
same session that would produce a position collision get an
IntegrityError on one of the two; the API retries the failed one
after re-reading queue state. Application-level advisory locks per
session are an alternative if retry-on-conflict proves noisy in
practice. Default: optimistic with retry.

### API-006 exemption

ecosystem-standards API-006 expects ownership-scoped tables to follow
one of three patterns: `owner_id`, `user_id`, or a relationship table.

Floor-trial entities (`events`, `sessions`, `session_divisions`,
`checkins`, `queue_entries`, `runs`, `queue_events`,
`event_division_run_limits`) don't fit any of those. They are
admin-managed shared resources. An event isn't "owned" by a user in
the API-006 sense — it's an event the admin is running, attended by
many users. `created_by` is recorded for audit (and remains as such on
events and sessions) but it's not an authorisation scope. Sessions
can only be created by admins; non-admins can only attend.

This deviates from API-006 deliberately. The exemption is recorded in
`apps/api/evaluator.yaml` referencing this ADR. To remove the
exemption, API-006 would need a fourth pattern explicitly modelling
"admin-managed shared resource" — a standards-repo change, not a
deejaytools-com change.

### UI implications (non-binding)

The data model dictates the API surface; these are intended frontend
patterns that the model accommodates but does not require.

1. **Session creation form pre-fills from the most recent session in
   the same event.** Caps, priority divisions, X values — all
   inherited as defaults that the admin can override. Pure UI; the
   database stays per-session. Avoids redundant manual data entry
   across same-event sessions where settings are usually identical.

2. **Check-in is a picker UX, not a free-form entry.** The form
   presents the user's existing pairs (with both members' display
   names) plus a "dancing solo" option, the songs valid for the
   chosen entity, and the divisions configured for this session. No
   free-text fields for partner names; no song uploads at check-in
   time. If the user doesn't see their partner or song, they leave
   check-in to set them up first. This is consistent with the existing
   submission-layer expectation that pair and song details are settled
   before floor-trial day.

3. **Promote buttons disable when admission rules block them.** The
   frontend computes admission predicate state and disables the
   button. Server enforces too — UI is a hint, not a gate.

4. **Currently Running renders as a distinct card from the upcoming
   list.** Slot 1 of active gets its own card with the three slot-1
   actions (run complete, run incomplete, withdraw). Slots 2..N
   render as a list with one action each (withdraw). This is a
   render-time distinction, not a data-model one.

5. **`partners` continues to be the lightweight, one-sided address
   book.** A `partners` row may name a non-signed-up partner; that
   partner can later create an account and the row stays valid.
   `partners` does not participate in the queue model — only `pairs`
   (mutual, both-signed-up) check in. Music submission may use a
   `partners` reference, which is the existing behaviour that this
   ADR does not alter.

### Out of scope for v1

These are anticipated extensions that are deliberately not part of v1:

- **Reorder within a queue.** Anticipated shape: "move this entry
  down by N positions" rather than drag-to-position. When implemented,
  the `queue_events.action` enum extends with appropriate values.
- **Push from active back to a prior queue.** Considered and rejected
  for v1 — the rotate-or-withdraw set covers practical needs.
- **Audit-log read endpoint and admin-facing audit UI.** The
  `queue_events` data is captured from day one, but no API endpoint
  reads it in v1. When needed, the read shape will be a paginated
  per-session timeline.
- **Real-time push to dancer-facing views.** v1 polls. SSE/WebSocket
  upgrade is future work; the data model is unaffected.
- **Database-level session-overlap exclusion constraint.** v1
  enforces non-overlap in application code. Future work may upgrade
  to a PostgreSQL exclusion constraint with a `tstzrange` over
  `[start_time, end_time]`.

## Consequences

### Easier

- The floor's audit trail is complete. Every state transition is
  recoverable from `queue_events`. "Why is this person in slot 3?"
  is always answerable.
- Run counts come from a clean, append-only `runs` table. No
  status-field semantics to remember.
- Queue admission has a clear, testable rule with two configurable
  knobs. Unit-testable in isolation.
- Re-check-in after a run "just works" — it inserts a fresh
  `checkins` row, the recompute happens against current `runs` data,
  the entry lands in whichever queue they qualify for.
- Active-queue size and the priority/non-priority split are
  session-configurable. Different events run different floors with
  different rules; the model accommodates that.
- The single-entry rule is enforced by partial unique indexes —
  defence in depth against bugs that would otherwise produce a
  duplicate live entry.

### Harder

- Five new tables to maintain instead of one. More moving parts at
  first glance, though each has one clearly-scoped job.
- Queue mutations must be transactional. Auto-compaction across rows
  in the same query introduces concurrency considerations the flat
  `floor_slots` design didn't have. Mitigated by the UNIQUE
  constraint and short transactions.
- Two writes per check-in (one to `checkins`, one to
  `queue_entries`) instead of one. This is the cost of the
  auditability requirement.
- The frontend has to query and re-render three queues plus a
  running card instead of one floor-slots view. Reasonable cost.
- Entity columns denormalised onto `queue_entries` and `runs`. CHECK
  constraints on all three tables enforce the "exactly one of pair /
  solo" invariant; the denormalisation has to be respected at every
  insert site.

### Neutral

- API-006 conformance regresses slightly on paper (an exemption is
  added). In practice nothing changes — the current schema doesn't
  conform to API-006 either, the conformance is just being recorded
  honestly now.
- The `pairs`, `partners`, `users`, `songs` tables are untouched.
  Existing code using them keeps working.
- No data migration. The current `floor_slots` and `checkins` tables
  drop; new tables are created empty. No production data exists.

## Implementation sequence

After this ADR is accepted, the work breaks into roughly:

1. **Migration.** Drop `floor_slots`, drop current `checkins`, drop
   `sessions.max_slots`. Create `checkins`, `queue_entries`, `runs`,
   `queue_events`, `event_division_run_limits`. Add new columns and
   CHECK constraints to `sessions` and `session_divisions`. Add
   partial unique indexes for the single-entry rule.
2. **Drizzle schema update** reflecting (1).
3. **Application-side helpers** — admission-rule predicate, run-count
   query, single-entry check, auto-compaction routine,
   session-overlap check. Each independently unit-tested.
4. **Routes — check-in.** `POST /v1/sessions/:id/checkins` consumes
   `(entity, division, song, notes)` and writes `checkins` +
   `queue_entries` + `queue_events` in one transaction.
5. **Routes — queue management.** `POST .../promote`,
   `POST .../complete`, `POST .../incomplete`, `POST .../withdraw`,
   each as transactional handlers with the appropriate writes.
6. **Routes — queue reads.** `GET .../active`, `GET .../priority`,
   `GET .../non-priority` for admin view; `GET .../upcoming` (or
   similar) for dancer view.
7. **Tests.** End-to-end coverage of every state-transition row, plus
   the rotation-on-full-active edge case, the
   priority-empty-required-for-non-priority case, and the
   single-entry rejection case.
8. **React updates.** SessionDetailPage queue rendering with three
   queues + running card; promote/complete/incomplete/withdraw
   buttons; check-in form pickers; session-creation form pre-fill.

Each step is a separate Cursor prompt, with this ADR as the canonical
reference for shape and intent.

## References

- ecosystem-standards API-006 (Tables authorisation-scoped)
- apps/api/docs/decisions/ADR-001-drizzle-migrations-at-deploy.md
  (migration delivery mechanism)
- apps/api/docs/decisions/ADR-002-validation-envelope-shape.md
  (canonical 400 envelope; route handlers in this work follow it)
- The Open 2025 floor-trial competitor information (process
  source-of-truth doc, 2025-11-26)
- apps/api/evaluator.yaml — API-006 exemption referencing this ADR
