# Authentication and authorization

How Clerk session JWTs become API access, how roles are resolved, and how the React app stays in sync.

Sources: [`middleware/auth.ts`](../src/middleware/auth.ts), [`lib/optional-user.ts`](../src/lib/optional-user.ts), [`routes/auth.ts`](../src/routes/auth.ts), [`routes/admin-users.ts`](../src/routes/admin-users.ts), [`test/mocks.ts`](../src/test/mocks.ts), `verifyClerkToken` in [`common-typescript-utils`](https://www.npmjs.com/package/common-typescript-utils) (`dist/auth.js`), and frontend [`useAuthMe.ts`](../../app/src/hooks/useAuthMe.ts), [`AuthSync.tsx`](../../app/src/components/AuthSync.tsx), [`RequireAuth.tsx`](../../app/src/components/RequireAuth.tsx), [`AdminGuard.tsx`](../../app/src/components/AdminGuard.tsx), [`ManagerGuard.tsx`](../../app/src/components/ManagerGuard.tsx).

Related: [ADR-003: JWT-only Clerk verification](decisions/ADR-003-jwt-only-clerk-verification.md), [API.md](API.md) endpoint reference.

---

## 1. Authenticated request path

End-to-end flow from browser to handler:

```
Browser (Clerk session)
  │
  │  useApiClient() → getToken() from @clerk/clerk-react
  ▼
Authorization: Bearer <session_jwt>
  │
  │  HTTP → Hono route
  ▼
requireAuth / requireAdmin middleware
  │
  ├─ bearerToken(c) — strip "Bearer " prefix; null → 401
  │
  ├─ verifyClerkToken(token, CLERK_JWKS_URL)
  │     JWKS fetch (cached 1h) → import RS256 public key by kid (cached 1h)
  │     → signature verify → exp check (if numeric) → payload.sub
  │
  ├─ SELECT users WHERE id = payload.sub
  │     no row → 401 USER_NOT_SYNCED
  │
  ├─ (requireAdmin only) users.role !== 'admin' → 403 FORBIDDEN
  │
  └─ c.set("user", { userId, email, role, clerk })
        │
        ▼
     Route handler reads c.get("user")
```

**Numbered walkthrough:**

1. User signs in via Clerk on the React app; Clerk holds the session in the browser.
2. `useApiClient()` calls `getToken()` and sets `Authorization: Bearer <jwt>` on each request ([`apps/app/src/api/client.ts`](../../app/src/api/client.ts)).
3. Hono runs route-level middleware (`requireAuth` or `requireAdmin`).
4. `bearerToken()` extracts the token string; missing or non-Bearer header → **401** + log `auth_failed` / `missing_token`.
5. `verifyClerkToken()` validates the JWT cryptographically (see §2).
6. Invalid JWT → **401** + log `auth_failed` / `invalid_token`.
7. `SELECT` from `users` where `id = payload.sub`. No row → **401** `USER_NOT_SYNCED` (see §4).
8. `requireAdmin`: if `users.role !== 'admin'` → **403** + log `auth_forbidden`.
9. Middleware sets `c.set("user", AuthUser)` and calls `next()`.
10. Handler uses `c.get("user").userId`, `.role`, etc.

`POST /v1/auth/sync` follows steps 4–6 but **skips** the DB lookup gate — it **creates** the `users` row instead.

---

## 2. JWT verification (`verifyClerkToken`)

Implemented in `common-typescript-utils` (`dist/auth.js`) — a hand-rolled **Web Crypto** verifier, not `jsonwebtoken` or Clerk backend SDK.

### What it does

| Step | Detail |
|------|--------|
| Parse | Expect exactly three dot-separated segments; base64url-decode header and payload |
| `kid` | Require `header.kid`; look up JWK in JWKS document |
| JWKS cache | Module-level `{ jwks, expiry }`, **1 hour TTL** (`CACHE_TTL_MS = 3_600_000`) |
| Key cache | `Map<kid, { key, expiry }>`, **1 hour TTL** per `kid` |
| Algorithm | `RSASSA-PKCS1-v1_5` with **SHA-256** (`crypto.subtle.verify`) |
| `exp` | Reject only if `exp` is a number and `Date.now() / 1000 >= exp`; omitted `exp` is not checked |
| `sub` | Require non-empty string; returned as `ClerkPayload.sub` |
| Email | Optional: `payload.email` or first `email_addresses[].email_address` |

JWKS URL comes from **`CLERK_JWKS_URL`** (read via `jwksUrl()` in [`middleware/auth.ts`](../src/middleware/auth.ts)).

### What it does **not** check

- **`iss` (issuer)** — not validated
- **`aud` (audience)** — not validated
- **`nbf` (not before)** — not validated
- **`exp` absent** — not rejected; token treated as non-expiring

**Signature** and presence/shape of **`sub`** are always enforced; **`exp`** is enforced only when the claim is a number. This matches [ADR-003](decisions/ADR-003-jwt-only-clerk-verification.md): session JWTs only, no M2M opaque tokens.

### `CLERK_JWKS_URL` missing

`jwksUrl()` throws synchronously:

```typescript
if (!url) throw new Error("CLERK_JWKS_URL is required");
```

This is a **server misconfiguration**, not a client auth failure. The throw is evaluated as an argument to `verifyClerkToken()` inside broad `try/catch` blocks in `resolveAuthUser` and `POST /v1/auth/sync`, so it is **currently caught and returned as 401 `UNAUTHORIZED`** (logged as `invalid_token` / `auth_sync_failed` with `reason: "invalid_token"`) — the same response as a genuinely bad JWT. That makes deployment mistakes easy to misread as a browser token problem.

If `jwksUrl()` were called outside such a catch, the throw would propagate to `app.onError` and surface as **500** `INTERNAL`. Treat any auth 401 storm after deploy as a signal to verify `CLERK_JWKS_URL` and JWKS reachability.

---

## 3. Role resolution

| Fact | Detail |
|------|--------|
| Source of truth | **`users.role`** in PostgreSQL — **not** the JWT |
| Enum | `user_role`: **`user`** \| **`admin`** only ([`schema.ts`](../src/db/schema.ts)) |
| Default on create | **`user`** — set in `POST /v1/auth/sync` insert (`role: "user"`) |
| Promotion | **`PATCH /v1/admin/users/:id/role`** with `{ "role": "user" \| "admin" }` ([`admin-users.ts`](../src/routes/admin-users.ts)) |
| Self-demote guard | If `id === callerId` and `role !== "admin"` → **403** `forbidden`, message **"You cannot change your own admin role."**, log `admin_self_demote_blocked` |

Clerk organization roles, JWT claims, and session metadata are **ignored** for API authorization.

---

## 4. Sync requirement (`USER_NOT_SYNCED`)

Clerk can issue a valid JWT **before** this API has a `users` row. `resolveAuthUser` returns:

```json
{
  "error": {
    "code": "USER_NOT_SYNCED",
    "message": "Call POST /v1/auth/sync first"
  }
}
```

HTTP **401**. No structured log event (unlike `auth_failed`).

### Frontend: `AuthSync`

[`AuthSync.tsx`](../../app/src/components/AuthSync.tsx):

- Mounted inside [`Layout.tsx`](../../app/src/components/Layout.tsx) under `<SignedIn>`.
- **`/` (LandingPage) is outside `Layout`** ([`App.tsx`](../../app/src/pages/App.tsx)) — **sync does not run on the landing page**.
- Once per browser tab session, guarded by **`sessionStorage` key `deejaytools_auth_sync_v1`**:
  - If key exists → skip.
  - Else set key **before** fetch (so retries don't spam sync on failure).
- POST `${VITE_API_URL}/v1/auth/sync` with Clerk `getToken()` bearer and body `{ email, firstName?, lastName?, displayName? }`.
- Skips silently if no primary email (`auth_sync_skipped` / `missing_primary_email`) or no token (`no_session_token`).
- Logs `auth_sync_failed` / `auth_sync_error` on failure; does not block UI.

After sync, `requireAuth` routes succeed. `GET /v1/auth/me` (via `useAuthMe`) loads profile including `role`.

---

## 5. `requireAuth` vs `requireAdmin`

Both call shared `resolveAuthUser()` then differ on role check.

| Middleware | Behavior |
|------------|----------|
| **`requireAuth`** | Valid JWT + synced `users` row → set `c.set("user")`, continue |
| **`requireAdmin`** | Same as `requireAuth`, then require `user.role === "admin"` |

### Failure modes

| Status | Code | Message (typical) | Log event | Trigger |
|--------|------|-------------------|-----------|---------|
| 401 | `UNAUTHORIZED` | Authentication required | `auth_failed` | `reason: "missing_token"` — no `Authorization: Bearer …` |
| 401 | `UNAUTHORIZED` | Authentication required | `auth_failed` | `reason: "invalid_token"` — malformed JWT, bad signature, expired, JWKS/key errors, or **`jwksUrl()` throw** (misconfiguration masked here) |
| 401 | `USER_NOT_SYNCED` | Call POST /v1/auth/sync first | *(none)* | Valid JWT, no `users` row for `sub` |
| 403 | `FORBIDDEN` | Admin access required | `auth_forbidden` | Synced user with `role !== "admin"` on `requireAdmin` route |

`POST /v1/auth/sync` auth failures use **`auth_sync_failed`** with `missing_token` or `invalid_token` instead of `auth_failed`.

Additional **403** on specific routes (after auth succeeds):

| Route | Code | Message |
|-------|------|---------|
| `POST /v1/checkins` | `FORBIDDEN` | Admin access required |
| `DELETE /v1/checkins/:id` | `FORBIDDEN` | Admin access required |
| `POST /v1/songs/upload/chunk` | `FORBIDDEN` | Admin access required |
| `PATCH /v1/admin/users/:id/role` | `forbidden` | You cannot change your own admin role. |

---

## 6. Optional-user (`getOptionalSyncedUserId`)

Full source ([`lib/optional-user.ts`](../src/lib/optional-user.ts)):

```typescript
/** Valid JWT + synced user row; otherwise undefined (invalid token is ignored). */
export async function getOptionalSyncedUserId(c: Context): Promise<string | undefined> {
  const token = bearerToken(c);
  if (!token) return undefined;
  try {
    const payload = await verifyClerkToken(token, jwksUrl());
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    return row?.id;
  } catch {
    return undefined;
  }
}
```

**Never throws.** Never returns 401. Bad token, expired token, unsynced user, and missing token are all treated as **anonymous**.

### Call sites (exactly two)

| File | Route | Effect when synced |
|------|-------|-------------------|
| [`sessions.ts`](../src/routes/sessions.ts) | `GET /v1/sessions` | Adds `has_active_checkin` per session |
| [`sessions.ts`](../src/routes/sessions.ts) | `GET /v1/sessions/:id` | Adds `has_active_checkin`, `active_checkin_division` |

Anonymous callers get responses **without** those keys (not `null`).

---

## 7. Endpoint × role matrix

Derived from middleware on each route handler. **Public** = no bearer required. **User** = valid JWT + synced row (`requireAuth` or equivalent). **Admin** = synced row with `role = admin` (`requireAdmin`).

Legend: **●** = allowed. **○** = optional enrichment (optional-user). **—** = not allowed.

‡ When `TICK_SECRET` is defined (including as an empty string), requires matching `x-tick-secret` header; otherwise **403** `FORBIDDEN`.

### App-level

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /health` | ● | ● | ● |
| `GET /internal/tick` | ●‡ | ●‡ | ●‡ |

### `/v1/auth`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `POST /v1/auth/sync` | — | ●† | ●† |
| `GET /v1/auth/me` | — | ● | ● |
| `PATCH /v1/auth/me` | — | ● | ● |

† Requires valid Clerk JWT; **no** pre-existing `users` row (creates one).

### `/v1/events`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/events` | ● | ● | ● |
| `GET /v1/events/:id` | — | ● | ● |
| `POST /v1/events` | — | — | ● |
| `PATCH /v1/events/:id` | — | — | ● |
| `DELETE /v1/events/:id` | — | — | ● |

### `/v1/sessions`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/sessions` | ● | ○ | ○ |
| `GET /v1/sessions/:id` | ● | ○ | ○ |
| `POST /v1/sessions` | — | — | ● |
| `PUT /v1/sessions/:id/divisions` | — | — | ● |
| `PATCH /v1/sessions/:id/status` | — | — | ● |
| `PATCH /v1/sessions/:id` | — | — | ● |
| `DELETE /v1/sessions/:id` | — | — | ● |

### `/v1/checkins`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `POST /v1/checkins` | — | ● | ●‡ |
| `GET /v1/checkins/mine` | — | ● | ● |
| `DELETE /v1/checkins/:id` | — | ● | ● |

‡ Admin-only field: `on_behalf_of_user_id`.

### `/v1/queue`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/queue/:sessionId/active` | ● | ● | ● |
| `GET /v1/queue/:sessionId/waiting` | ● | ● | ● |
| `GET /v1/queue/:sessionId/priority` | — | — | ● |
| `GET /v1/queue/:sessionId/non-priority` | — | — | ● |
| `POST /v1/queue/promote` | — | — | ● |
| `POST /v1/queue/complete` | — | — | ● |
| `POST /v1/queue/incomplete` | — | — | ● |
| `POST /v1/queue/move-down` | — | — | ● |
| `POST /v1/queue/withdraw` | — | — | ● |

### `/v1/runs`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/runs` | — | — | ● |

### `/v1/pairs`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `POST /v1/pairs/find-or-create` | — | ● | ● |

### `/v1/partners`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/partners/leading-pairs` | — | ● | ● |
| `GET /v1/partners` | — | ● | ● |
| `POST /v1/partners` | — | ● | ● |
| `GET /v1/partners/:id/associations` | — | ● | ● |
| `GET /v1/partners/:id` | — | ● | ● |
| `PATCH /v1/partners/:id` | — | ● | ● |
| `DELETE /v1/partners/:id` | — | ● | ● |

### `/v1/teams`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/teams` | — | ● | ● |
| `POST /v1/teams` | — | ● | ● |
| `PATCH /v1/teams/:id` | — | ● | ● |
| `DELETE /v1/teams/:id` | — | ● | ● |

### `/v1/managed-partnerships`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/managed-partnerships` | — | ● | ● |
| `POST /v1/managed-partnerships` | — | ● | ● |
| `PATCH /v1/managed-partnerships/:id` | — | ● | ● |
| `DELETE /v1/managed-partnerships/:id` | — | ● | ● |

### `/v1/event-song-submissions`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/event-song-submissions` | — | ● | ● |
| `POST /v1/event-song-submissions` | — | ● | ● |
| `DELETE /v1/event-song-submissions/:id` | — | ● | ● |

### `/v1/songs`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/songs` | — | ● | ● |
| `POST /v1/songs` | — | ● | ● |
| `GET /v1/songs/:id` | — | ● | ● |
| `PATCH /v1/songs/:id` | — | ● | ● |
| `DELETE /v1/songs/:id` | — | ● | ● |
| `POST /v1/songs/upload/chunk` | — | ● | ●‡ |

‡ Admin-only field: `on_behalf_of_user_id`.

### `/v1/feedback`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `POST /v1/feedback` | ● | ● | ● |

### `/v1/admin/checkins`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `POST /v1/admin/checkins` | — | — | ● |
| `GET /v1/admin/checkins/test` | — | — | ● |
| `DELETE /v1/admin/checkins/test` | — | — | ● |

### `/v1/admin/songs`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/admin/songs` | — | — | ● |

### `/v1/admin/event-song-submissions`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/admin/event-song-submissions` | — | — | ● |

### `/v1/admin/users`

| Endpoint | Public | User | Admin |
|----------|--------|------|-------|
| `GET /v1/admin/users` | — | — | ● |
| `PATCH /v1/admin/users/:id/role` | — | — | ● |
| `GET /v1/admin/users/:id/partners` | — | — | ● |
| `GET /v1/admin/users/:id/event-song-submissions` | — | — | ● |

---

## 8. Frontend guards

| Component | Mechanism | Loading behavior |
|-----------|-----------|------------------|
| **`RequireAuth`** | Clerk `<SignedOut>` → redirect `/`; `<SignedIn>` → children | **No loading state** — purely Clerk session presence |
| **`AdminGuard`** | `useAuthMe()` → `isAdmin` (`me?.role === "admin"`) | **Skeleton** while `loading`; then redirect `/` if not admin |
| **`ManagerGuard`** | `useAuthMe()` → `isAdmin \|\| isManager` | **Skeleton** while `loading`; then redirect `/` if neither |

### Why `useAuthMe.loading` stays true until `me` is set

From [`useAuthMe.ts`](../../app/src/hooks/useAuthMe.ts):

```typescript
const loading = !isLoaded || fetching || (isSignedIn === true && me === null);
```

Comment in source: *"Keep loading=true until we actually have a me record (or know user isn't signed in), otherwise AdminGuard can fire a redirect before the fetch even starts."*

Sequence for a signed-in admin visiting `/admin`:

1. Clerk `isLoaded` becomes true, `isSignedIn === true`, `me === null`.
2. `loading === true` → AdminGuard shows Skeleton (no premature redirect).
3. `useEffect` calls `reload()` → `GET /v1/auth/me`.
4. `me` populated → `loading === false` → `isAdmin` checked → children render.

`RequireAuth` does **not** wait for `/v1/auth/me`; it only checks Clerk sign-in. A signed-in but unsynced user can pass `RequireAuth` and then get **401** `USER_NOT_SYNCED` from API calls until `AuthSync` completes.

---

## 9. Testing

Route tests **do not** call Clerk or `verifyClerkToken`. They replace middleware via Vitest:

```typescript
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return {
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});
```

### Mock conventions ([`test/mocks.ts`](../src/test/mocks.ts))

| Helper | Behavior |
|--------|----------|
| **`mockRequireAuth(defaultUserId?, defaultRole?)`** | Requires `Authorization: Bearer …`. Parses user id from **`Bearer mock-token-<userId>`** (suffix after `Bearer mock-token-`). If suffix empty, uses `defaultUserId` (`user_test123`). Sets `role: "admin"` when user id is **`user_admin123`**, else `defaultRole` (`user`). |
| **`mockRequireAdmin()`** | Requires bearer. Only **`user_admin123`** passes; any other id → **403** `FORBIDDEN`. |

Constants:

- Default test user: `user_test123` ([`test/helpers.ts`](../src/test/helpers.ts) `MOCK_USER`)
- Admin user id: **`user_admin123`** (`ADMIN_USER_ID` in mocks, `MOCK_ADMIN` in helpers)

`authHeaders()` helper sends `Authorization: Bearer mock-token-user_test123`.

### Copy-paste template for a new route test

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import { authHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return {
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});

beforeEach(resetSelectQueue);

describe("GET /v1/my-new-route", () => {
  it("returns 401 without token", async () => {
    const res = await app.request("/v1/my-new-route");
    expect(res.status).toBe(401);
  });

  it("returns 200 for authenticated user", async () => {
    enqueueSelectResult([/* rows your handler SELECTs */]);
    const res = await app.request("/v1/my-new-route", {
      headers: authHeaders(), // Bearer mock-token-user_test123
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    // assert body.data …
  });
});
```

For admin routes, use `adminHeaders()` or `authHeaders({ userId: "user_admin123" })`.

Tests that hit **`getOptionalSyncedUserId`** (session list/detail) should mock [`optional-user.ts`](../src/lib/optional-user.ts) separately if needed — see [`sessions.contract.test.ts`](../src/routes/sessions.contract.test.ts).

`POST /v1/auth/sync` tests mock `verifyClerkToken` from `common-typescript-utils` directly ([`auth.test.ts`](../src/routes/auth.test.ts)).

---

## 10. Known limitations

- **No M2M / opaque Clerk tokens** — session JWTs only. See [ADR-003](decisions/ADR-003-jwt-only-clerk-verification.md). Adding a machine caller requires a second verification path and CD-012 compliance work.

- **One DB round-trip per authenticated request** — `resolveAuthUser` always `SELECT`s `users` by `sub`. No caching of role or sync state on the JWT.

- **No `iss` / `aud` validation** — any RS256 JWT signed by a key in the configured JWKS document with a valid or absent `exp` and a valid `sub` is accepted. Protect `CLERK_JWKS_URL` and network path to Clerk JWKS.

- **`ManagerGuard` / `isManager` discrepancy** — [`useAuthMe.ts`](../../app/src/hooks/useAuthMe.ts) exposes `isManager: me?.role === "manager"`, but the database enum **`user_role` only contains `user` and `admin`**. No API path assigns `manager`. **`/manager/*` routes are admin-only in practice** (`isAdmin` satisfies `ManagerGuard`). **TODO:** either add `manager` to the schema and role patch endpoint, or remove `isManager` and align `ManagerGuard` with admin-only intent.

- **`USER_NOT_SYNCED` has no structured log** — harder to distinguish from client bugs in log aggregators.

- **Auth sync is best-effort** — `AuthSync` logs failures but does not retry or block navigation; users can reach `RequireAuth` routes before sync completes and see API 401s briefly.

- **Rate limiting is per-IP** — shared NAT users share the 300/min `/v1/*` bucket ([`app.ts`](../src/app.ts)).
