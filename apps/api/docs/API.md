# API endpoint reference

Mounting and global middleware: [`apps/api/src/app.ts`](../src/app.ts). Route handlers: [`apps/api/src/routes/`](../src/routes/).

Base URL in production is deployment-specific (Railway). All versioned routes live under `/v1`.

---

## Conventions

### Response envelope

Success responses use [`common-typescript-utils`](https://www.npmjs.com/package/common-typescript-utils) helpers:

```json
{
  "data": { },
  "meta": { "version": "…", "count": 42 }
}
```

- `success(payload)` — single object in `data`; `meta` includes `version`.
- `successList(array)` — array in `data`; `meta` includes `version` and `count`.

Failure responses:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Human-readable explanation"
  }
}
```

Zod validation failures (via `zValidator` in `lib/validate.ts`) return **400** with `CommonErrors.validationError(issues)` — typically `code: "VALIDATION_ERROR"` and a message summarizing field errors.

Unhandled exceptions return **500** with `CommonErrors.internalError()` (message is generic in production).

### Authentication

Send a Clerk session JWT:

```
Authorization: Bearer <clerk_session_token>
```

Three distinct failure modes on protected routes:

| Status | Code | Meaning |
|--------|------|---------|
| 401 | `UNAUTHORIZED` | Missing `Authorization` header, non-`Bearer` prefix, or JWT verification failed |
| 401 | `USER_NOT_SYNCED` | JWT valid but no row in `users` — client must call `POST /v1/auth/sync` first |
| 403 | `FORBIDDEN` | Authenticated user lacks admin role (`requireAdmin`); message **"Admin access required"** |

`POST /v1/auth/sync` uses its own auth (valid JWT required) but does **not** use `requireAuth` — it creates/updates the `users` row.

### Optional-user pattern

`GET /v1/sessions` and `GET /v1/sessions/:id` call `getOptionalSyncedUserId()` ([`lib/optional-user.ts`](../src/lib/optional-user.ts)):

- No token, invalid token, or unsynced user → treated as anonymous; no error.
- Valid token + synced user → extra fields are added.

| Endpoint | Extra fields when authenticated |
|----------|----------------------------------|
| `GET /v1/sessions` | `has_active_checkin: boolean` on each session row |
| `GET /v1/sessions/:id` | `has_active_checkin: boolean`, `active_checkin_division: string` when in queue |

Anonymous responses **omit** these keys entirely (not `null`).

### Rate limiting and timeouts

Applied in `app.ts`:

| Middleware | Scope | Limit |
|------------|-------|-------|
| `bodyLimit` | `*` | 11 MB max body; **413** `payload_too_large` |
| `rateLimitMiddleware(300, 60_000)` | `/v1/*` only | 300 requests / minute / IP; **429** `too_many_requests` |
| `timeoutMiddleware` | `/v1/*` only | **30 s** default; **300 s** for paths starting with `/v1/songs/upload/`; **503** `request_timeout` |

**Exempt from rate limiting:** `/health`, `/internal/tick` (unversioned).

CORS: origins from `CORS_ORIGINS` (comma-separated), default `http://localhost:5173`. Allowed headers: `Authorization`, `Content-Type`.

### Frontend polling intervals

| Page | Interval | Endpoints touched |
|------|----------|-------------------|
| `SessionDetailPage` | **60 s** | `GET /v1/sessions/:id`, `GET /v1/queue/:id/active`, `GET /v1/queue/:id/waiting` |
| `ManagerPage` (Active Sessions tab) | **8 s** | `GET /v1/queue/:sessionId/active`, `…/priority`, `…/non-priority` |
| `SessionInfoHeader` | 30 s | Local clock only (no API) |
| `FloorTrialsPage` | none | Loads `GET /v1/sessions` + `GET /v1/events` once on mount |

Queue read responses are cached server-side for **3 s** (`CACHE_TTL.QUEUE`); session list/detail shared data for **5 s** (`CACHE_TTL.SESSION`).

### Shared error rows

Many authenticated endpoints also return:

In this table, the third column is the **trigger** (when the error fires), not always the verbatim JSON `error.message`. Per-endpoint tables below use the **Message** column for exact text where it is fixed.

| Status | Code | Trigger |
|--------|------|---------|
| 401 | `UNAUTHORIZED` | Missing/invalid token (`requireAuth` / `requireAdmin`) |
| 401 | `USER_NOT_SYNCED` | Valid token, no `users` row |
| 403 | `FORBIDDEN` | Non-admin on `requireAdmin` route |
| 400 | `VALIDATION_ERROR` | Zod validation failed |
| 429 | `too_many_requests` | Rate limit exceeded. Please slow down. |
| 503 | `request_timeout` | Handler exceeded deadline |

Unless noted, assume these apply to every `requireAuth` / `requireAdmin` endpoint below.

---

## App-level routes (`app.ts`)

### GET /health

**Auth:** public

**Purpose:** Liveness/readiness probe for Railway and uptime monitors.

**Path params / Query params:** none

**Request body:** none

**Response:** Not wrapped in `{ data, meta }`.

```json
{ "status": "ok" }
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 503 | — | `{ "status": "degraded", "detail": "db_unreachable" }` | DB ping failed |

---

### GET /internal/tick

**Auth:** public (optional secret gate)

**Purpose:** Manual trigger for session status advance + active-queue auto-fill (`runTick()`).

**Path params / Query params:** none

**Request body:** none

**Response:**

```json
{
  "data": { "ticked": true },
  "meta": { "version": "…" }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 403 | `FORBIDDEN` | Admin access required | `TICK_SECRET` env is set (including empty string) and `x-tick-secret` header mismatch |

When `TICK_SECRET` is **unset**, the endpoint is completely open.

---

## `auth.ts` — `/v1/auth`

### POST /v1/auth/sync

**Auth:** Bearer JWT required (not `requireAuth` — creates user if missing)

**Purpose:** Upsert the Clerk user into `users` after first sign-in.

**Path params / Query params:** none

**Request body:**

```typescript
const syncBody = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
});
```

**Response:**

```json
{
  "data": {
    "id": "user_2abc…",
    "email": "dancer@example.com",
    "display_name": null,
    "first_name": "Ada",
    "last_name": "Lovelace",
    "role": "user",
    "created_at": 1710000000000,
    "updated_at": 1710000000000
  },
  "meta": { "version": "…" }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 401 | `UNAUTHORIZED` | Authentication required | Missing or invalid JWT |
| 400 | `VALIDATION_ERROR` | … | Invalid JSON body |
| 500 | `INTERNAL` | … | User row missing after upsert |

On conflict, only `email` and `updated_at` are updated — `firstName` / `lastName` are **not** overwritten.

---

### GET /v1/auth/me

**Auth:** requireAuth

**Purpose:** Return the authenticated user's profile.

**Path params / Query params:** none

**Request body:** none

**Response:** Same shape as `POST /sync` `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | User not found | Row deleted after auth (edge case) |

---

### PATCH /v1/auth/me

**Auth:** requireAuth

**Purpose:** Update the caller's first and last name.

**Path params / Query params:** none

**Request body:**

```typescript
const updateProfileBody = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});
```

**Response:** Same shape as `GET /me`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | User not found | Missing row |
| 500 | `INTERNAL` | … | DB update failed |

---

## `events.ts` — `/v1/events`

Helper schemas used by create/patch (same file):

```typescript
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

const ianaTimezone = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid IANA timezone (e.g. 'America/Chicago')" }
  );
```

### GET /v1/events

**Auth:** public

**Purpose:** List all events, newest `start_date` first.

**Path params / Query params:** none

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "evt_…",
      "name": "Rising Star Classic 2026",
      "start_date": "2026-03-01",
      "end_date": "2026-03-03",
      "timezone": "America/Chicago",
      "status": "upcoming",
      "created_by": "user_…",
      "created_at": 1710000000000,
      "updated_at": 1710000000000
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

`status` is derived at response time (`upcoming` | `active` | `completed`), not stored.

**Errors:** none (empty list is valid).

---

### GET /v1/events/:id

**Auth:** public

**Purpose:** Fetch one event by id.

**Path params:** `id` — event UUID

**Query params:** none

**Request body:** none

**Response:** Single event object (same fields as list item) in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Event not found | Unknown id |

---

### GET /v1/events/:id/entities

**Auth:** requireAuth

**Purpose:** List the competing entities that have at least one song submitted to
this event, with the divisions they are entered in.

Unlike the event itself this is **not public**: who is entered is
competitor-visible information. The response carries **no song identity** — no
title, routine name, filename or song id — by design.

Entities are grouped by `songEntityKey` (managed partnership → partner →
solo owner), so two submissions from the same couple collapse to one row.
A division comes from the submission's per-event override when set, otherwise
from the song; blank divisions are dropped rather than emitted as `""`.

**Path params:** `id` — event UUID

**Query params / Request body:** none

**Response:**

```json
{
  "data": [
    {
      "entity_key": "pt_…",
      "label": "Alex Kim & Jo Ruiz",
      "divisions": ["Classic", "Masters"]
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

`entity_key` is prefixed by source table (`mp:` managed partnership, `pt:`
partner, `us:` solo user) so ids from different tables can never collide.
`divisions` is in `DIVISIONS` display order; unknown divisions sort last.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 401 | `UNAUTHORIZED` | … | Missing/invalid token |
| 404 | `NOT_FOUND` | Event not found | Unknown id |
| 500 | `INTERNAL` | … | Query failed |

---

### POST /v1/events

**Auth:** requireAdmin

**Purpose:** Create an event.

**Path params / Query params:** none

**Request body:**

```typescript
const createEvent = z.object({
  name: z.string().min(1),
  start_date: dateString,
  end_date: dateString,
  /** IANA timezone for this event. All session times are displayed in this zone. */
  timezone: ianaTimezone.default("America/Chicago"),
});
```

**Response:** **201** — created event in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `BAD_REQUEST` | start_date must be on or before end_date | Date ordering |
| 400 | `VALIDATION_ERROR` | … | Invalid body |

---

### PATCH /v1/events/:id

**Auth:** requireAdmin

**Purpose:** Partially update an event.

**Path params:** `id`

**Query params:** none

**Request body:**

```typescript
const patchEvent = z.object({
  name: z.string().min(1).optional(),
  start_date: dateString.optional(),
  end_date: dateString.optional(),
  timezone: ianaTimezone.optional(),
});
```

**Response:** Updated event in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Event not found | Unknown id |
| 400 | `BAD_REQUEST` | start_date must be on or before end_date | Combined dates invalid |

---

### DELETE /v1/events/:id

**Auth:** requireAdmin

**Purpose:** Delete an event and cascade-delete its sessions and all floor-trial data.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:**

```json
{ "data": { "deleted": true }, "meta": { "version": "…" } }
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Event not found | Unknown id |

---

## `sessions.ts` — `/v1/sessions`

Shared schemas:

```typescript
const divisionItemSchema = z.object({
  division_name: z.string(),
  is_priority: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  priority_run_limit: z.number().int().min(0).optional(),
});

const createSessionBody = z.object({
  event_id: z.string().optional(),
  name: z.string().min(1),
  date: z.string().optional(),
  checkin_opens_at: z.number(),
  floor_trial_starts_at: z.number(),
  floor_trial_ends_at: z.number(),
  active_priority_max: z.number().int().min(0).optional(),
  active_non_priority_max: z.number().int().min(0).optional(),
  divisions: z.array(divisionItemSchema),
});

const patchSessionBody = z.object({
  name: z.string().min(1).optional(),
  date: z.string().nullable().optional(),
  event_id: z.string().nullable().optional(),
  checkin_opens_at: z.number().optional(),
  floor_trial_starts_at: z.number().optional(),
  floor_trial_ends_at: z.number().optional(),
  active_priority_max: z.number().int().min(0).optional(),
  active_non_priority_max: z.number().int().min(0).optional(),
});

const putDivisionsBody = z.object({
  divisions: z.array(divisionItemSchema),
});

const listQuery = z.object({
  event_id: z.string().optional(),
});

const statusBody = z.object({
  status: SessionStatusSchema,
});
```

`SessionStatusSchema` (`@deejaytools/schemas`):

```typescript
export const SessionStatusSchema = z.enum([
  "scheduled",
  "checkin_open",
  "in_progress",
  "completed",
  "cancelled",
]);
```

### GET /v1/sessions

**Auth:** optional-user

**Purpose:** List sessions with divisions, queue depths, and optional per-user check-in flag.

**Path params:** none

**Query params:**

| Param | Type | Notes |
|-------|------|-------|
| `event_id` | string | Optional filter |

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "sess_…",
      "event_id": "evt_…",
      "name": "Saturday AM Floor Trials",
      "date": "2026-03-01",
      "checkin_opens_at": 1710000000000,
      "floor_trial_starts_at": 1710003600000,
      "floor_trial_ends_at": 1710010800000,
      "active_priority_max": 6,
      "active_non_priority_max": 4,
      "status": "checkin_open",
      "created_by": "user_…",
      "created_at": 1710000000000,
      "event_timezone": "America/Chicago",
      "divisions": [
        {
          "id": "…",
          "division_name": "Classic",
          "is_priority": true,
          "sort_order": 0,
          "priority_run_limit": 2
        }
      ],
      "queue_depth": { "priority": 3, "non_priority": 1, "active": 2 },
      "has_active_checkin": true
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

`status` is derived from wall clock unless DB status is `cancelled`. `has_active_checkin` only when authenticated.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `VALIDATION_ERROR` | … | Invalid query |

---

### GET /v1/sessions/:id

**Auth:** optional-user

**Purpose:** Fetch one session with event name, divisions, queue depth, optional user check-in state.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** Session object as in list, plus:

```json
{
  "event_name": "Rising Star Classic 2026",
  "has_active_checkin": true,
  "active_checkin_division": "Classic"
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Session not found | Unknown id |

---

### POST /v1/sessions

**Auth:** requireAdmin

**Purpose:** Create a session and its division rows.

**Path params / Query params:** none

**Request body:** `createSessionBody` (above)

**Response:** **201** — full session + `divisions` + `queue_depth` in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `BAD_REQUEST` | Missing or invalid required fields… | Zero/negative timestamps or empty name |
| 400 | `BAD_REQUEST` | floor_trial_starts_at must be after checkin_opens_at | Time ordering |
| 400 | `BAD_REQUEST` | floor_trial_ends_at must be after floor_trial_starts_at | Time ordering |
| 400 | `BAD_REQUEST` | active_non_priority_max must be <= active_priority_max | Cap constraint |
| 400 | `BAD_REQUEST` | Session floor-trial window overlaps… | Overlap in same event |
| 400 | `BAD_REQUEST` | Session starts (…) before event start date… | Outside event date range |

---

### PUT /v1/sessions/:id/divisions

**Auth:** requireAdmin

**Purpose:** Upsert session divisions (priority flags and run limits).

**Path params:** `id`

**Query params:** none

**Request body:** `putDivisionsBody`

**Response:** Updated session + divisions + queue_depth.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Session not found | Unknown id |
| 500 | `DIVISIONS_UPDATE_FAILED` | … | Transaction failed |

---

### PATCH /v1/sessions/:id/status

**Auth:** requireAdmin

**Purpose:** Manually set persisted session status (e.g. `cancelled`).

**Path params:** `id`

**Query params:** none

**Request body:** `statusBody`

**Response:** Updated session + divisions + queue_depth.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Session not found | Unknown id |

---

### PATCH /v1/sessions/:id

**Auth:** requireAdmin

**Purpose:** Update session metadata and time window.

**Path params:** `id`

**Query params:** none

**Request body:** `patchSessionBody`

**Response:** Updated session + divisions + queue_depth.

**Errors:** Same validation family as `POST /v1/sessions` plus 404 not found.

---

### DELETE /v1/sessions/:id

**Auth:** requireAdmin

**Purpose:** Delete session and all queue/check-in/run data.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** `{ "data": { "deleted": true }, … }`

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Session not found | Unknown id |

---

## `checkins.ts` — `/v1/checkins`

### POST /v1/checkins

**Auth:** requireAuth (admins may pass `on_behalf_of_user_id`)

**Purpose:** Check in an entity for a session; creates `checkins`, `queue_entries`, and `queue_events` rows.

**Path params / Query params:** none

**Request body:** (`@deejaytools/schemas`)

```typescript
export const createCheckinBodySchema = z
  .object({
    sessionId: z.string().min(1),
    divisionName: z.string().min(1),
    entityPairId: z.string().nullish(),
    entitySoloUserId: z.string().nullish(),
    entityManagedPartnershipId: z.string().nullish(),
    on_behalf_of_user_id: z.string().trim().nullish(),
    songId: z.string().min(1),
    notes: z.string().nullish(),
  })
  .refine(
    (b) => {
      const entityCount = [b.entityPairId, b.entitySoloUserId, b.entityManagedPartnershipId].filter(
        Boolean
      ).length;
      // On-behalf check-ins let the server derive the entity from the song.
      if (b.on_behalf_of_user_id) return entityCount === 0;
      return entityCount === 1;
    },
    { message: "Exactly one entity must be provided (or none when checking in on behalf)" }
  );
```

**Response:** **201**

```json
{
  "data": {
    "id": "chk_…",
    "sessionId": "sess_…",
    "divisionName": "Classic",
    "initialQueue": "priority"
  },
  "meta": { "version": "…" }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 403 | `FORBIDDEN` | Admin access required | `on_behalf_of_user_id` set by non-admin |
| 400 | `BAD_REQUEST` | Target user not found | Invalid on-behalf user |
| 404 | `NOT_FOUND` | Session not found | |
| 400 | `BAD_REQUEST` | Check-in has not opened yet | Before `checkin_opens_at` |
| 400 | `BAD_REQUEST` | Check-in is closed for this session | After `floor_trial_ends_at` |
| 404 | `NOT_FOUND` | Song not found | Not owned / soft-deleted |
| 400 | `BAD_REQUEST` | Managed partnership not found | Invalid managed song |
| 400 | `BAD_REQUEST` | Pair not found / You are not a member… | Invalid pair |
| 400 | `BAD_REQUEST` | This song is not associated with a managed partnership | `entityManagedPartnershipId` sent incorrectly |
| 400 | `BAD_REQUEST` | You may only submit a solo check-in for yourself | Solo user mismatch |
| 409 | `conflict` | This entity already has a live queue entry… | Single-entry rule |
| 400 | `BAD_REQUEST` | This song hasn't been submitted to this event… | Missing `event_song_submissions` row |
| 400 | `BAD_REQUEST` | Session not found / Division not configured… | Admission context |
| 409 | `conflict` | Check-in conflicted with concurrent activity… | Transaction failure |

---

### GET /v1/checkins/mine

**Auth:** requireAuth

**Purpose:** List the caller's active check-ins (must have live `queue_entries` row).

**Path params / Query params:** none

**Request body:** none

**Response:** Array in `data` (uses `success()`, not `successList` — no `meta.count`):

```json
{
  "data": [
    {
      "id": "chk_…",
      "sessionId": "sess_…",
      "eventName": "RSC 2026",
      "sessionName": "Saturday AM",
      "sessionFloorTrialStartsAt": 1710003600000,
      "sessionStatus": "in_progress",
      "eventTimezone": "America/Chicago",
      "divisionName": "Classic",
      "entityLabel": "Ada Lovelace & Bob Jones",
      "songDisplayName": "Our Routine",
      "songProcessedFilename": "Ada_Bob_Classic_2026_Routine_v01.mp3",
      "notes": null,
      "checkedInAt": 1710004000000,
      "queueEntryId": "qe_…",
      "queueType": "priority",
      "queuePosition": 2,
      "overallPosition": 4,
      "runCount": 0
    }
  ],
  "meta": { "version": "…" }
}
```

**Errors:** none (empty array valid).

---

### DELETE /v1/checkins/:id

**Auth:** requireAuth

**Purpose:** Self-service withdraw (same effect as admin withdraw).

**Path params:** `id` — check-in id

**Query params:** none

**Request body:** none

**Response:**

```json
{ "data": { "withdrawn": true }, "meta": { "version": "…" } }
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Check-in not found | No row or no live queue entry |
| 403 | `FORBIDDEN` | Admin access required | Not entity owner |
| 409 | `conflict` | Withdraw conflicted with concurrent activity… | Transaction failure |

---

## `queue.ts` — `/v1/queue`

Schemas:

```typescript
const promoteBody = z.object({ queueEntryId: z.string().min(1) });
const entryActionBody = z.object({
  queueEntryId: z.string().min(1),
  reason: z.string().nullish(),
});
const withdrawBody = z.object({
  queueEntryId: z.string().min(1),
  reason: z.string().nullish(),
});
```

Queue entry item shape (all GET queue endpoints):

```json
{
  "queueEntryId": "qe_…",
  "checkinId": "chk_…",
  "position": 1,
  "enteredQueueAt": 1710004000000,
  "entityPairId": "pair_…",
  "entitySoloUserId": null,
  "entityManagedPartnershipId": null,
  "entityLabel": "Ada Lovelace & Bob Jones",
  "divisionName": "Classic",
  "songId": "song_…",
  "songDisplayName": "Our Routine",
  "songProcessedFilename": "Ada_Bob_Classic_2026_Routine_v01.mp3",
  "notes": null,
  "initialQueue": "priority",
  "checkedInAt": 1710004000000
}
```

### POST /v1/queue/promote

**Auth:** requireAdmin

**Purpose:** Move a priority or non-priority entry into the active queue.

**Path params / Query params:** none

**Request body:** `promoteBody`

**Response:** `{ "data": { "promoted": true }, … }`

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Queue entry not found | |
| 400 | `BAD_REQUEST` | Entry is already active | |
| 404 | `NOT_FOUND` | Session not found | Inside transaction |
| 400 | `BAD_REQUEST` | Active queue is at its priority cap (N/M active). | Priority cap |
| 400 | `BAD_REQUEST` | Active queue is at its standard cap… | Non-priority cap |
| 400 | `BAD_REQUEST` | Cannot promote a standard entry while the priority queue has N waiting… | Priority queue non-empty |
| 409 | `conflict` | Promotion conflicted with concurrent activity… | |

---

### POST /v1/queue/complete

**Auth:** requireAdmin

**Purpose:** Mark active slot complete; record a `runs` row.

**Path params / Query params:** none

**Request body:** `entryActionBody`

**Response:** `{ "data": { "completed": true }, … }`

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `BAD_REQUEST` | Active queue entry not found | |
| 404 | `NOT_FOUND` | Check-in not found | |
| 409 | `conflict` | Completion conflicted with concurrent activity… | |

---

### POST /v1/queue/incomplete

**Auth:** requireAdmin

**Purpose:** Rotate active slot-1 entry to bottom of active queue.

**Path params / Query params:** none

**Request body:** `entryActionBody`

**Response:** `{ "data": { "rotated": true }, … }`

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `BAD_REQUEST` | Active queue entry not found | |
| 409 | `conflict` | Rotation conflicted with concurrent activity… | |

---

### POST /v1/queue/move-down

**Auth:** requireAdmin

**Purpose:** Swap entry with the one at `position + 1` within the same queue.

**Path params / Query params:** none

**Request body:**

```typescript
z.object({ queueEntryId: z.string().min(1) })
```

**Response:** `{ "data": { "moved": true }, … }`

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Queue entry not found | |
| 400 | `BAD_REQUEST` | Entry is already at the bottom of its queue | |
| 409 | `conflict` | Move conflicted with concurrent activity… | |

---

### POST /v1/queue/withdraw

**Auth:** requireAdmin

**Purpose:** Remove any queue entry without recording a run.

**Path params / Query params:** none

**Request body:** `withdrawBody`

**Response:** `{ "data": { "withdrawn": true }, … }`

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Queue entry not found | |
| 409 | `conflict` | Withdraw conflicted with concurrent activity… | |

---

### GET /v1/queue/:sessionId/active

**Auth:** public

**Purpose:** List active-queue entries (position 1 = currently running).

**Path params:** `sessionId`

**Query params:** none

**Request body:** none

**Response:** Array of queue entry objects in `data`.

**Errors:** none (empty array valid).

---

### GET /v1/queue/:sessionId/waiting

**Auth:** public

**Purpose:** Combined priority + non-priority waiting queues.

**Path params:** `sessionId`

**Query params:** none

**Request body:** none

**Response:** Same as active entries plus `"subQueue": "priority" | "non_priority"` on each row.

**Errors:** none.

---

### GET /v1/queue/:sessionId/priority

**Auth:** requireAdmin

**Purpose:** Priority queue only (admin Manager page).

**Path params:** `sessionId`

**Query params:** none

**Request body:** none

**Response:** Array of queue entry objects in `data`.

**Errors:** none.

---

### GET /v1/queue/:sessionId/non-priority

**Auth:** requireAdmin

**Purpose:** Non-priority queue only.

**Path params:** `sessionId`

**Query params:** none

**Request body:** none

**Response:** Array of queue entry objects in `data`.

**Errors:** none.

---

## `runs.ts` — `/v1/runs`

### GET /v1/runs

**Auth:** requireAdmin

**Purpose:** Admin run history with display labels.

**Path params:** none

**Query params:**

```typescript
const listQuery = z.object({
  session_id: z.string().optional(),
  event_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
```

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "run_…",
      "completed_at": 1710005000000,
      "division_name": "Classic",
      "session_id": "sess_…",
      "session_floor_trial_starts_at": 1710003600000,
      "event_id": "evt_…",
      "event_name": "RSC 2026",
      "song_id": "song_…",
      "song_label": "Ada Lovelace & Bob Jones · Classic · 2026 · Routine v01",
      "entity_label": "Ada Lovelace & Bob Jones",
      "entity_key": "pair:pair_…",
      "completed_by_label": "Admin Name"
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

Default `limit` 200.

**`entity_key`:** stable grouping id for the run's entity — `managed:{id}`, `pair:{id}`, `solo:{userId}`, or `unknown`. Branch order matches `entity_label` resolution (managed → pair → solo).

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `VALIDATION_ERROR` | … | Invalid query |

---

## `pairs.ts` — `/v1/pairs`

### POST /v1/pairs/find-or-create

**Auth:** requireAuth

**Purpose:** Return or create `pairs` row for `(current user, partner_id)`.

**Path params / Query params:** none

**Request body:**

```typescript
const findOrCreateBody = z.object({
  partner_id: z.string().min(1),
});
```

**Response:**

```json
{ "data": { "id": "pair_…" }, "meta": { "version": "…" } }
```

**201** when newly created; **200** when existing.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Partner not found | Partner not owned by user |

---

## `partners.ts` — `/v1/partners`

Schemas:

```typescript
const createBody = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  partner_role: PartnerRoleSchema,
  email: z.string().email().optional(),
});

const patchBody = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  partner_role: PartnerRoleSchema.optional(),
  email: z.string().email().nullable().optional(),
});
```

`PartnerRoleSchema`: `z.enum(["leader", "follower"])`

### GET /v1/partners/leading-pairs

**Auth:** requireAuth

**Purpose:** Pairs where caller is `user_a` (check-in entity picker).

**Path params / Query params:** none

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "pair_…",
      "partner_b_id": "part_…",
      "display_name": "Bob Jones"
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

**Errors:** none.

---

### GET /v1/partners

**Auth:** requireAuth

**Purpose:** List caller's partners (`kind = 'partner'` only).

**Path params / Query params:** none

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "part_…",
      "user_id": "user_…",
      "first_name": "Bob",
      "last_name": "Jones",
      "partner_role": "follower",
      "email": null,
      "linked_user_id": null,
      "created_at": 1710000000000,
      "updated_at": 1710000000000,
      "display_name": "Bob Jones"
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

**Errors:** none.

---

### POST /v1/partners

**Auth:** requireAuth

**Purpose:** Create a partner record.

**Path params / Query params:** none

**Request body:** `createBody`

**Response:** **201** — partner object in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `VALIDATION_ERROR` | … | Invalid body |

---

### GET /v1/partners/:id/associations

**Auth:** requireAuth

**Purpose:** Count songs and check-in usage before delete.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:**

```json
{
  "data": {
    "song_count": 2,
    "has_active_checkin": false,
    "has_checkin_history": true
  },
  "meta": { "version": "…" }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Partner not found | Not owned |

---

### GET /v1/partners/:id

**Auth:** requireAuth

**Purpose:** Fetch one partner.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** Partner object in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Partner not found | |

---

### PATCH /v1/partners/:id

**Auth:** requireAuth

**Purpose:** Update partner fields.

**Path params:** `id`

**Query params:** none

**Request body:** `patchBody`

**Response:** Updated partner in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Partner not found | |
| 400 | `BAD_REQUEST` | first_name cannot be empty | Trimmed empty name |
| 400 | `BAD_REQUEST` | last_name cannot be empty | |

---

### DELETE /v1/partners/:id

**Auth:** requireAuth

**Purpose:** Delete partner; orphan pairs with history, delete pairs without.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** **204** empty body

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Partner not found | |
| 409 | `PARTNER_IN_ACTIVE_CHECKIN` | This partner is linked to a pair with an active check-in… | Live queue entry |

---

## `teams.ts` — `/v1/teams`

Schema (`@deejaytools/schemas`):

```typescript
export const teamIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9 ]+$/, "Team name may only contain letters, numbers, and spaces")
  .min(1)
  .max(100);

export const createTeamBodySchema = z.object({
  identifier: teamIdentifierSchema,
});
```

### GET /v1/teams

**Auth:** requireAuth

**Purpose:** List caller's teams.

**Path params / Query params:** none

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "team_…",
      "user_id": "user_…",
      "identifier": "Team Alpha",
      "created_at": 1710000000000,
      "updated_at": 1710000000000
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

**Errors:** none.

---

### POST /v1/teams

**Auth:** requireAuth

**Purpose:** Create a team.

**Path params / Query params:** none

**Request body:** `createTeamBodySchema`

**Response:** **201** — team in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 409 | `conflict` | You already have a team with that name. | Unique `(user_id, identifier)` |
| 500 | `INTERNAL` | … | Other DB error |

---

### PATCH /v1/teams/:id

**Auth:** requireAuth

**Purpose:** Rename a team.

**Path params:** `id`

**Query params:** none

**Request body:** `createTeamBodySchema`

**Response:** Updated team in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Team not found | |
| 409 | `conflict` | You already have a team with that name. | Duplicate identifier |

---

### DELETE /v1/teams/:id

**Auth:** requireAuth

**Purpose:** Delete a team.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** **204**

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Team not found | |

---

## `managed-partnerships.ts` — `/v1/managed-partnerships`

Schema (`@deejaytools/schemas`):

```typescript
export const createManagedPartnershipBodySchema = z.object({
  leader_first_name: z.string().trim().min(1).max(100),
  leader_last_name: z.string().trim().min(1).max(100),
  follower_first_name: z.string().trim().min(1).max(100),
  follower_last_name: z.string().trim().min(1).max(100),
});
```

### GET /v1/managed-partnerships

**Auth:** requireAuth

**Purpose:** List active managed partnerships for caller.

**Path params / Query params:** none

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "mp_…",
      "user_id": "user_…",
      "leader_first_name": "Ada",
      "leader_last_name": "Lovelace",
      "follower_first_name": "Bob",
      "follower_last_name": "Jones",
      "created_at": 1710000000000,
      "updated_at": 1710000000000
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

**Errors:** none.

---

### POST /v1/managed-partnerships

**Auth:** requireAuth

**Purpose:** Create a managed partnership.

**Path params / Query params:** none

**Request body:** `createManagedPartnershipBodySchema`

**Response:** **201** — partnership in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 500 | `INTERNAL` | … | Insert failed |

---

### PATCH /v1/managed-partnerships/:id

**Auth:** requireAuth

**Purpose:** Update names on a managed partnership.

**Path params:** `id`

**Query params:** none

**Request body:** `createManagedPartnershipBodySchema`

**Response:** Updated partnership in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Managed partnership not found | Soft-deleted or not owned |
| 500 | `INTERNAL` | … | Update failed |

---

### DELETE /v1/managed-partnerships/:id

**Auth:** requireAuth

**Purpose:** Soft-delete partnership and its songs.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** **204**

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Managed partnership not found | |
| 409 | `MANAGED_PARTNERSHIP_IN_ACTIVE_CHECKIN` | This partnership has an active check-in… | Live queue in non-terminal session |
| 500 | `INTERNAL` | Failed to delete managed partnership | Transaction error |

---

## `event-song-submissions.ts` — `/v1/event-song-submissions`

Schema (`@deejaytools/schemas`):

```typescript
export const createEventSongSubmissionBodySchema = z.object({
  event_id: z.string().min(1),
  song_id: z.string().min(1),
});
```

### GET /v1/event-song-submissions

**Auth:** requireAuth

**Purpose:** List caller's event song submissions.

**Path params:** none

**Query params:**

```typescript
const listQuery = z.object({
  event_id: z.string().optional(),
});
```

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "ess_…",
      "event_id": "evt_…",
      "event_name": "RSC 2026",
      "event_start_date": "2026-03-01",
      "event_status": "upcoming",
      "song_id": "song_…",
      "song_label": "Ada Lovelace & Bob Jones · Classic · 2026 · Routine v01",
      "division": "Classic",
      "created_at": 1710000000000
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 500 | `INTERNAL` | … | Query failed |

---

### POST /v1/event-song-submissions

**Auth:** requireAuth

**Purpose:** Link a owned song to an event.

**Path params / Query params:** none

**Request body:** `createEventSongSubmissionBodySchema`

**Response:** **201** — submission row in `data` (same shape as GET item).

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Song not found | Not owned |
| 404 | `NOT_FOUND` | Event not found | |
| 409 | `conflict` | That song is already submitted to this event. | Unique violation |
| 500 | `INTERNAL` | … | Insert failed |

---

### DELETE /v1/event-song-submissions/:id

**Auth:** requireAuth

**Purpose:** Remove caller's submission.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** **204**

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Event song submission not found | Not owned |
| 500 | `INTERNAL` | … | Delete failed |

---

## `songs.ts` — `/v1/songs`

Schemas:

```typescript
const listQuery = z.object({
  partner_id: z.string().optional(),
});

const createBody = z.object({
  partner_id: z.string().optional(),
  display_name: z.string().optional(),
  original_filename: z.string().optional(),
  division: z.string().min(1, "division is required"),
  routine_name: z.string().nullable().optional(),
  personal_descriptor: z.string().nullable().optional(),
  season_year: z.string().optional(),
});

const patchBody = z.object({
  partner_id: z.string().nullable().optional(),
  display_name: z.string().optional(),
  original_filename: z.string().nullable().optional(),
  division: z.string().nullable().optional(),
  routine_name: z.string().nullable().optional(),
  personal_descriptor: z.string().nullable().optional(),
  season_year: z.string().nullable().optional(),
});
```

Song object in responses:

```json
{
  "id": "song_…",
  "user_id": "user_…",
  "partner_id": "part_…",
  "display_name": "Our Routine",
  "original_filename": "routine.mp3",
  "drive_file_id": "1abc…",
  "drive_folder_id": "folder_…",
  "processed_filename": "Ada_Bob_Classic_2026_Routine_v01.mp3",
  "division": "Classic",
  "routine_name": "Routine",
  "personal_descriptor": null,
  "season_year": "2026",
  "is_legacy": false,
  "created_at": 1710000000000,
  "updated_at": 1710000000000,
  "partner_first_name": "Bob",
  "partner_last_name": "Jones",
  "partner_kind": "partner"
}
```

### GET /v1/songs

**Auth:** requireAuth

**Purpose:** List caller's non-deleted songs.

**Path params:** none

**Query params:** `listQuery` — optional `partner_id`

**Request body:** none

**Response:** Array of song objects in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `VALIDATION_ERROR` | … | Invalid query |

---

### POST /v1/songs

**Auth:** requireAuth

**Purpose:** Create a song metadata row without file upload (legacy path; prefer chunked upload).

**Path params / Query params:** none

**Request body:** `createBody`

**Response:** **201** — song in `data` (Drive fields null).

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `BAD_REQUEST` | Partner not found or does not belong to you | Invalid `partner_id` |

---

### GET /v1/songs/:id

**Auth:** requireAuth

**Purpose:** Fetch one owned song.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** Song object in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Song not found | Not owned or soft-deleted |

---

### PATCH /v1/songs/:id

**Auth:** requireAuth

**Purpose:** Update song metadata.

**Path params:** `id`

**Query params:** none

**Request body:** `patchBody`

**Response:** Updated song in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Song not found | |
| 400 | `BAD_REQUEST` | Partner not found or does not belong to you | |

---

### DELETE /v1/songs/:id

**Auth:** requireAuth

**Purpose:** Soft-delete song and remove event submissions.

**Path params:** `id`

**Query params:** none

**Request body:** none

**Response:** **204**

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Song not found | |
| 409 | `SONG_IN_ACTIVE_CHECKIN` | This song is referenced by an active check-in… | Live queue in non-terminal session |
| 500 | `INTERNAL` | Failed to delete song | Transaction error |

---

### POST /v1/songs/upload/chunk

**Auth:** requireAuth (admins may pass `on_behalf_of_user_id`)

**Purpose:** Chunked atomic upload; song row created only on final chunk; Drive upload runs in background.

**Path params / Query params:** none

**Request body:** `multipart/form-data` (no Zod schema — validated manually):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `chunk` | File | yes | Max 10 MB per chunk |
| `upload_id` | UUID string | yes | Groups chunks |
| `chunk_index` | integer | yes | 0-based |
| `total_chunks` | integer | yes | 1–30 |
| `original_filename` | string | no | Defaults to `"song.mp3"` when omitted or empty |
| `mime_type` | string | no | Defaults to `"audio/mpeg"` when omitted or empty; assembled file format uses magic bytes, not this field |
| `division` | string | yes | |
| `partner_id` | string | portal: empty | XOR with `managed_partnership_id` |
| `managed_partnership_id` | string | optional | |
| `routine_name` | string | optional | |
| `personal_descriptor` | string | optional | |
| `on_behalf_of_user_id` | string | admin only | Target owner |
| `entity_type` | `solo` \| `team` \| `other` | portal uploads | Creates placeholder partner |
| `entity_name` | string | `other` / optional solo | |
| `team_id` | string | team uploads | Must own team |

**Response (non-final chunk):**

```json
{ "data": { "received": true, "complete": false }, "meta": { "version": "…" } }
```

**Response (final chunk):**

```json
{
  "data": {
    "received": true,
    "complete": true,
    "song": { }
  },
  "meta": { "version": "…" }
}
```

`processed_filename` may still be null until background Drive upload completes.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 403 | `FORBIDDEN` | Admin access required | `on_behalf_of_user_id` by non-admin |
| 400 | `BAD_REQUEST` | Invalid upload_id / chunk_index / total_chunks / division… | Validation |
| 400 | `BAD_REQUEST` | Chunk exceeds 10 MB limit | |
| 400 | `BAD_REQUEST` | Portal uploads cannot specify partner_id… | Conflicting fields |
| 400 | `BAD_REQUEST` | Invalid entity_type | |
| 400 | `BAD_REQUEST` | Target user not found | On-behalf |
| 400 | `BAD_REQUEST` | team_id is required for team uploads | |
| 400 | `BAD_REQUEST` | Team not found | |
| 400 | `BAD_REQUEST` | entity_name is required for other uploads | |
| 400 | `BAD_REQUEST` | Set your name on My Profile or provide entity_name | Solo without name |
| 400 | `BAD_REQUEST` | Specify either partner_id or managed_partnership_id, not both | |
| 400 | `BAD_REQUEST` | Managed partnership not found… / Partner not found… | |
| 500 | `CHUNK_ERROR` | Failed to read uploaded chunks | readdir failure |
| 409 | `CHUNK_MISSING` | Expected N chunks but only received M… | Incomplete upload |
| 400 | `BAD_REQUEST` | File exceeds 100 MB limit | Assembled size |
| 400 | `UNSUPPORTED_FORMAT` | That file doesn't look like a supported audio format… | Magic-byte check |
| 500 | `INTERNAL` | … | Song insert failed |

**Timeout:** 300 s (upload path).

---

## `feedback.ts` — `/v1/feedback`

### POST /v1/feedback

**Auth:** public

**Purpose:** Submit site feedback (optional Brevo email when `BREVO_API_KEY` set).

**Path params / Query params:** none

**Request body:**

```typescript
const feedbackBodySchema = z
  .object({
    type: z.enum(["bug", "feature", "general"]),
    subject: z.string().min(1).max(255),
    message: z.string().min(1).max(20_000),
    contactName: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? undefined : v),
      z.string().max(255).optional(),
    ),
    contactEmail: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? undefined : v),
      z.string().email().optional(),
    ),
    screenshot: z.string().max(3 * 1024 * 1024).optional(),
  })
  .superRefine((val, ctx) => {
    const s = val.screenshot;
    if (s !== undefined && s.length > 0 && !DATA_URL_PREFIX.test(s)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["screenshot"],
        message: "Screenshot must be a PNG or JPEG data URL",
      });
    }
  });
```

(`DATA_URL_PREFIX = /^data:image\/(png|jpeg);base64,/i`)

**Response:** **201** — `{ "data": null, "meta": { … } }`

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `VALIDATION_ERROR` | … | Invalid body / screenshot format |
| 502 | `EMAIL_FAILED` | Failed to send email. Please try again. | Brevo API error |

If `BREVO_API_KEY` is unset, feedback is logged and **201** still returned.

---

## `admin-checkins.ts` — `/v1/admin/checkins`

### POST /v1/admin/checkins

**Auth:** requireAdmin

**Purpose:** Inject synthetic test check-in (stub user/partner/pair/song).

**Path params / Query params:** none

**Request body:**

```typescript
const injectBody = z.object({
  sessionId: z.string().min(1),
  divisionName: z.string().min(1),
  leaderFirstName: z.string().min(1),
  leaderLastName: z.string().min(1),
  followerFirstName: z.string().min(1),
  followerLastName: z.string().min(1),
  notes: z.string().nullish(),
});
```

**Response:** **201**

```json
{
  "data": {
    "id": "chk_…",
    "sessionId": "sess_…",
    "divisionName": "Classic",
    "initialQueue": "priority",
    "pair": {
      "id": "pair_…",
      "partner_b_id": "part_…",
      "display_name": "Leader Name & Follower Name"
    }
  },
  "meta": { "version": "…" }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | Session not found | |
| 400 | `BAD_REQUEST` | … | Admission / division errors |
| 409 | `conflict` | This entity already has a live queue entry… / Check-in conflicted… | |

Bypasses check-in time window.

---

### GET /v1/admin/checkins/test

**Auth:** requireAdmin

**Purpose:** List synthetic test injections (`admin-injected-*@test.local` users).

**Path params / Query params:** none

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "pair_id": "pair_…",
      "created_at": 1710000000000,
      "leader_name": "Test Leader",
      "follower_name": "Test Follower",
      "session_id": "sess_…",
      "session_name": "Saturday AM",
      "division_name": "Classic",
      "queue_status": "priority",
      "position": 1
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

`queue_status`: `active` | `priority` | `non_priority` | `off_queue`

**Errors:** none.

---

### DELETE /v1/admin/checkins/test

**Auth:** requireAdmin

**Purpose:** Hard-delete all synthetic test injection data.

**Path params / Query params:** none

**Request body:** none

**Response:**

```json
{ "data": { "deleted": 3 }, "meta": { "version": "…" } }
```

(`deleted` = count of synthetic users removed)

**Errors:** none (0 deletions valid).

---

## `admin-songs.ts` — `/v1/admin/songs`

### GET /v1/admin/songs

**Auth:** requireAdmin

**Purpose:** Searchable directory of all songs.

**Path params:** none

**Query params:**

```typescript
const listQuery = z.object({
  q: z.string().optional(),
  include_deleted: z.enum(["true", "false"]).optional(),
});
```

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "song_…",
      "song_label": "Ada Lovelace & Bob Jones · Classic · 2026 · Routine v01",
      "display_name": "Routine",
      "division": "Classic",
      "routine_name": "Routine",
      "personal_descriptor": null,
      "season_year": "2026",
      "is_legacy": false,
      "created_at": 1710000000000,
      "deleted_at": null,
      "owner": {
        "id": "user_…",
        "email": "dancer@example.com",
        "full_name": "Ada Lovelace"
      },
      "partner": {
        "id": "part_…",
        "full_name": "Bob Jones",
        "linked_user_email": null
      }
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `VALIDATION_ERROR` | … | Invalid query |

---

## `admin-event-submissions.ts` — `/v1/admin/event-song-submissions`

### GET /v1/admin/event-song-submissions

**Auth:** requireAdmin

**Purpose:** All submissions for one event (Manager Event Songs tab).

**Path params:** none

**Query params:**

```typescript
const listQuery = z.object({
  event_id: z.string().min(1),
});
```

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "ess_…",
      "event_id": "evt_…",
      "event_name": "RSC 2026",
      "division": "Classic",
      "song_id": "song_…",
      "song_label": "…",
      "partnership_label": "Ada Lovelace & Bob Jones",
      "submitter_email": "dancer@example.com",
      "created_at": 1710000000000
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `VALIDATION_ERROR` | … | Missing `event_id` |
| 500 | `INTERNAL` | … | Query failed |

---

## `admin-users.ts` — `/v1/admin/users`

### GET /v1/admin/users

**Auth:** requireAdmin

**Purpose:** User directory with song/partner counts.

**Path params:** none

**Query params:**

```typescript
const listQuery = z.object({
  q: z.string().optional(),
  role: z.enum(["user", "admin"]).optional(),
});
```

**Request body:** none

**Response:**

```json
{
  "data": [
    {
      "id": "user_…",
      "email": "dancer@example.com",
      "first_name": "Ada",
      "last_name": "Lovelace",
      "role": "user",
      "created_at": 1710000000000,
      "song_count": 3,
      "partner_count": 2
    }
  ],
  "meta": { "version": "…", "count": 1 }
}
```

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 400 | `VALIDATION_ERROR` | … | Invalid query |

---

### PATCH /v1/admin/users/:id/role

**Auth:** requireAdmin

**Purpose:** Promote or demote a user.

**Path params:** `id`

**Query params:** none

**Request body:**

```typescript
const updateRoleParam = z.object({ id: z.string().min(1) });
const updateRoleBody = z.object({ role: z.enum(["user", "admin"]) });
```

**Response:** User object (same shape as GET list item) in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 403 | `forbidden` | You cannot change your own admin role. | Self-demote |
| 404 | `NOT_FOUND` | Not found | Unknown user id |

---

### GET /v1/admin/users/:id/partners

**Auth:** requireAdmin

**Purpose:** Partner roster for a user (Upload For flow).

**Path params:** `id` — target user id

**Query params:** none

**Request body:** none

**Response:** Array of partner objects (same as `GET /v1/partners`) in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | User not found | |

---

### GET /v1/admin/users/:id/event-song-submissions

**Auth:** requireAdmin

**Purpose:** Event submissions for a specific user and event.

**Path params:** `id` — target user id

**Query params:**

```typescript
const submissionsQuery = z.object({ event_id: z.string().min(1) });
```

**Request body:** none

**Response:** Same submission shape as `GET /v1/event-song-submissions` in `data`.

**Errors:**

| Status | Code | Message | Trigger |
|--------|------|---------|---------|
| 404 | `NOT_FOUND` | User not found | |
| 400 | `VALIDATION_ERROR` | … | Missing `event_id` |

---

## Not implemented

These routes appear in older docs, comments, or migration history but **do not exist** in the current API:

| Route | Notes |
|-------|-------|
| `GET /v1/legacy-songs` | Removed with claim-legacy flow; `legacy_songs` table may exist in DB from migration `0002` but has no handler |
| `POST /v1/songs/claim-legacy` | Removed; legacy metadata now uses `songs.processed_filename` prefix `[Legacy] ` |
| `/v1/music-history` | Frontend route removed; was a separate legacy catalog UI |
| `/v1/floor-slots` / slot fill routes | Replaced by `/v1/queue/*` (ADR-004) |
| `GET /v1/queue-events` | Audit log is written but no read API in v1 |
| `GET /v1/event-registrations` | Table dropped in migration `0004` |

Catch-all unknown paths return **404** with `CommonErrors.notFound()`.
