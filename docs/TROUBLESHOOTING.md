# Troubleshooting

Symptom-first guide. Headings match **exact error text or observable behaviour** from the codebase. Each entry: **Cause** → **Fix**.

For deployment topology and env var checklists, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## `DATABASE_URL is required`

**Symptom:** API process exits immediately on boot; stack trace points at `apps/api/src/db/index.ts`.

**Cause:** `DATABASE_URL` is missing or empty. The DB module throws before the server listens.

**Fix:**

1. Set `DATABASE_URL` to a valid Postgres connection string (`apps/api/.env` locally, Railway variables in production).
2. Redeploy / restart the API.
3. Confirm Postgres is reachable from the host (network, credentials, SSL mode if required by the provider).

---

## `CLERK_JWKS_URL is required` (surfacing as HTTP 500, not 401)

**Symptom:** Authenticated API calls return **500 Internal server error** with body `"Internal server error"` in production. Railway logs show `unhandled_error` with message `CLERK_JWKS_URL is required`. Locally in development you may see the raw message in the JSON body.

**Cause:** `CLERK_JWKS_URL` is unset, but the request reached `requireAuth`, which calls `jwksUrl()` → `throw new Error("CLERK_JWKS_URL is required")`. That throw is **not** caught inside the auth middleware; it bubbles to `app.onError` as an unexpected server failure — not a client auth failure.

**Fix:**

1. Set `CLERK_JWKS_URL` to your Clerk instance JWKS endpoint (e.g. `https://<instance>.clerk.accounts.dev/.well-known/jwks.json`).
2. Redeploy Railway.
3. Retry the request — you should now get proper **401** responses for bad/missing tokens instead of 500.

---

## 401 `USER_NOT_SYNCED` — `Call POST /v1/auth/sync first`

**Symptom:** API returns:

```json
{ "error": { "code": "USER_NOT_SYNCED", "message": "Call POST /v1/auth/sync first" } }
```

**Cause:** Clerk JWT is valid, but there is **no row in `users`** for `payload.sub`. The app expects a one-time sync after sign-in.

**Fix:**

1. Sign in on the frontend and navigate to any route inside `Layout` (not `/` alone — `AuthSync` does not run on the landing page).
2. `AuthSync` POSTs `/v1/auth/sync` with the Clerk token.
3. If sync still fails, check Railway logs for `auth_sync_failed` and confirm the user has a primary email in Clerk.
4. Manually POST `/v1/auth/sync` with a valid Bearer token if debugging.

---

## `VITE_CLERK_PUBLISHABLE_KEY is required`

**Symptom:** Blank page; browser console shows uncaught error at startup from `apps/app/src/main.tsx`.

**Cause:** Production build was deployed without `VITE_CLERK_PUBLISHABLE_KEY`. Vite inlines env vars at **build time** — setting the variable after build does nothing.

**Fix:**

1. Add `VITE_CLERK_PUBLISHABLE_KEY` in Cloudflare Pages → Settings → Environment variables (Production **and** Preview if you use previews).
2. **Trigger a new build** (retry deployment or push a commit).
3. Verify locally: copy `apps/app/.env.example` to `.env.local` and set the key before `pnpm dev`.

---

## Postgres connection refused / timeout / pool exhaustion

**Symptoms (typical):**

- Railway log: `ECONNREFUSED`, `connection timeout`, or postgres.js errors on queries.
- `/health` returns **503** `{ "status": "degraded", "detail": "db_unreachable" }`.
- Intermittent 500s under load; `too many clients already` from Postgres.

**Cause:** Wrong `DATABASE_URL`, database down, network/firewall, or connection pool larger than Postgres allows.

**Fix:**

1. Verify `DATABASE_URL` (host, port, user, password, database name, SSL).
2. Confirm Postgres is running / Railway Postgres plugin is healthy.
3. Tune pool settings in Railway (all optional, defaults in `apps/api/src/db/index.ts`):
   - `DB_POOL_MAX` — default **20**; lower if you hit `too many clients`.
   - `DB_CONNECT_TIMEOUT` — default **10** s; increase on slow networks.
   - `DB_IDLE_TIMEOUT` — default **30** s; idle connections released to free DB slots.
4. On boot, look for structured log `db_connected` with `max_connections`, `connect_timeout`, `idle_timeout` to confirm effective settings.

---

## Missing table / relation errors (`relation "…" does not exist`)

**Symptom:** API 500s; Postgres or Drizzle error mentioning a missing relation (e.g. `sessions`, `users`, `songs`).

**Cause:** Migrations were not applied to this database. Common after pointing `DATABASE_URL` at a fresh DB or restoring an old snapshot.

**Fix:**

1. **Production:** Railway `startCommand` runs `db:migrate` before start — if deploy succeeded, migrations should be applied. If you bypassed deploy or restored DB manually, redeploy or run `pnpm --filter api db:migrate` against that URL from a trusted environment.
2. **Local:** `pnpm --filter api db:migrate`.
3. If migrate fails on deploy, Railway keeps the **previous** image — fix the migration SQL and redeploy (see ADR-001).

---

## `EADDRINUSE :::3001`

**Symptom:** API fails to start locally with Node error that port **3001** is already in use.

**Cause:** Another process (often a previous `pnpm dev:api`) is bound to `3001`.

**Fix:**

1. Find the process: `lsof -i :3001` (macOS/Linux).
2. Stop it: `kill <PID>` or stop the other terminal session.
3. Or set a different `PORT` in `apps/api/.env` and point `VITE_API_URL` / Vite proxy at the new port.

Production on Railway uses the injected `PORT` — this error is almost always local dev.

---

## `Google Drive environment variables are not configured`

**Symptom:** Song upload appears to succeed at chunk stage, then song vanishes from library; Railway log: `song_background_upload_failed` with this message. Or immediate failure in Drive code paths during admin operations.

**Cause:** One or more of `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, or `GOOGLE_DRIVE_PARENT_FOLDER_ID` is missing.

**Fix:**

1. Set all three on Railway (see `apps/api/.env.example`).
2. Redeploy.
3. Retry upload.

---

## Google private key / `\n` escaping

**Symptom:** Drive auth fails at runtime; JWT or OpenSSL errors about invalid PEM; uploads fail with `song_background_upload_failed`.

**Cause:** `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` was pasted as a single line without newline escapes, or real newlines were stripped by the secrets UI.

**Fix:**

1. Store the key with `\n` for line breaks in the env var (Railway multiline secret editor, or escaped string).
2. Code applies `.replace(/\\n/g, "\n")` in `apps/api/src/services/drive.ts` — the stored value must use **literal backslash-n**, not actual newlines, if your platform requires single-line secrets.
3. Redeploy and retry.

---

## Drive folder not shared with service account

**Symptom:** `song_background_upload_failed` with Google API **403** / **404** (e.g. “File not found”, “Insufficient permissions”) when creating subfolders or uploading under `GOOGLE_DRIVE_PARENT_FOLDER_ID`.

**Cause:** The parent folder exists in your personal Drive but the **service account email** was never granted access.

**Fix:**

1. In Google Drive, share `GOOGLE_DRIVE_PARENT_FOLDER_ID` with `GOOGLE_SERVICE_ACCOUNT_EMAIL` as **Editor** (or Content manager on shared drives).
2. Retry upload — no code change required.

---

## `File exceeds 100 MB limit`

**Symptom:** API **400** with message exactly: `File exceeds 100 MB limit`.

**Cause:** Assembled file after chunked upload exceeds `MAX_ASSEMBLED_BYTES` (~110 MB) in `apps/api/src/routes/songs.ts`. The API error message still says “100 MB”; the browser rejects uploads over 100 MB client-side (`MAX_FILE_BYTES` in `chunkedSongUpload.ts`), so a file between 100 and 110 MB never reaches the server from the app but would pass a direct API upload.

**Fix:** Upload a smaller file. Client-side `SongUploadForm` also rejects files over 100 MB before upload starts.

---

## `That file doesn't look like a supported audio format. Please upload an MP3, WAV, FLAC, or M4A.`

**Symptom:** API **400** with `error.code` **`UNSUPPORTED_FORMAT`** and the message above.

**Cause:** Server magic-byte sniffing (`detectAudioFormat` in `apps/api/src/services/audioFormat.ts`) did not recognize the file — wrong type, corrupt file, or renamed non-audio extension. Client MIME type is intentionally not trusted (iOS often sends `application/octet-stream`).

**Fix:**

1. Confirm the file is a real MP3, WAV, FLAC, or M4A.
2. Re-export from a DAW or converter if needed.
3. On iOS, the file picker omits `accept="audio/*"` by design — server validation is the gate.

---

## `Your session expired. Please sign in again and retry the upload.`

**Symptom:** Mid-upload failure in the browser; toast or inline error with this exact string from `apps/app/src/lib/chunkedSongUpload.ts`.

**Cause:** `getToken()` returned null on a chunk retry (Clerk session expired, signed out in another tab, or token fetch threw).

**Fix:**

1. Sign in again.
2. Re-upload the file from the beginning (chunks are tied to a new `upload_id` each attempt).
3. Note: API **401** on a chunk also aborts immediately without retry. The message is the server's `error.message` from the JSON envelope (or `Upload failed (401)` if the body is not parseable) — not the session-expired string above, which is only thrown when `getToken()` returns null.

---

## `Network error (<ErrorName>: <message>) — check your connection and try again.`

**Symptom:** During chunked upload, client shows this pattern (from `chunkedSongUpload.ts`).

**Cause:** TCP/TLS failure before an HTTP response — includes Fastly idle timeout if body drain regresses, offline client, or API unreachable.

**Fix:**

1. Check API health and CORS.
2. If uploads fail consistently with no status code, verify the Fastly body-drain server in `apps/api/src/index.ts` is still deployed (see [`DEPLOYMENT.md`](./DEPLOYMENT.md)).
3. Retry on stable network.

---

## Feedback form succeeds but no email arrives

**Symptom:** User sees success on `/feedback`; API returns **201**; nothing in inbox.

**Cause:** `BREVO_API_KEY` is unset. Handler logs:

```
[feedback] BREVO_API_KEY not set; skipping transactional email
```

and still returns success — **by design**, invisible to the user.

**Fix:**

1. Set `BREVO_API_KEY` on Railway (Brevo → SMTP & API → API Keys).
2. Redeploy.
3. Submit test feedback; if Brevo rejects, API returns **502** `Failed to send email. Please try again.` and logs `[feedback] Brevo error:`.

---

## Sessions not advancing status / active queue not filling

**Symptoms:**

- Session stays `scheduled` past check-in open time in DB (UI may still **look** correct — see below).
- Active queue empty at floor-trial start; manager “Active” panel never fills.
- No `session_status_updated` or `auto_fill_completed` in logs.

**Cause:** In-process scheduler not running or tick failing.

**Fix:**

1. **`DISABLE_SCHEDULER`** — only the literal string **`"1"`** disables the scheduler. `"true"`, `"yes"`, etc. do **not** disable it.
2. **`TICK_INTERVAL_MS`** — default **30000** (30 s). Lower for faster queue fill in dev; do not set absurdly low in production without reason.
3. After deploy, grep Railway logs for **`scheduler_started`** with `interval_ms`. Absence means scheduler was disabled or process crashed before start.
4. Grep **`tick_failed`** or **`auto_fill_failed`** for DB/lock errors during ticks.
5. Manual pass: `GET /internal/tick` with header `x-tick-secret: <TICK_SECRET>` when `TICK_SECRET` is set.

**Reassurance:** Session **display** status on reads is **derived from wall-clock timestamps** in API responses, so Floor Trials UI can show “check-in open” even when the DB `status` column lags. What actually stops is **DB status transitions** and **automatic active-queue fill** — check-ins and manual manager actions may still work; auto-fill at trial start does not.

---

## CORS error in browser (`Access-Control-Allow-Origin`)

**Symptom:** Browser console blocks fetch to API; preflight or response missing CORS headers.

**Cause:** Frontend origin not listed in Railway `CORS_ORIGINS`. Default when unset is only `http://localhost:5173` (`apps/api/src/app.ts`).

**Fix:**

1. Set `CORS_ORIGINS` to a comma-separated list including every frontend origin (production domain, `www`, Cloudflare preview URLs if needed).
2. Redeploy API.
3. Ensure `VITE_API_URL` points at the same API host the browser calls.

---

## `GET /internal/tick` returns 403 Forbidden

**Symptom:** HTTP **403** with forbidden envelope when calling `/internal/tick`.

**Cause:** `TICK_SECRET` is **defined** in the environment, but request missing or wrong `x-tick-secret` header.

**Fix:** Send `x-tick-secret: <exact value of TICK_SECRET>` or unset `TICK_SECRET` only in non-production if you accept the security tradeoff.

---

## `/internal/tick` is completely open (security hazard)

**Symptom:** Anyone can hit `GET /internal/tick` without a header and receive `{ "data": { "ticked": true } }`.

**Cause:** `TICK_SECRET` is **unset** (`undefined`). Code only gates when `secret !== undefined` (`apps/api/src/app.ts`).

**Fix:** Set `TICK_SECRET` to a long random string in Railway production; always send matching `x-tick-secret` from cron/monitors. Never rely on obscurity alone.

---

## `TypeError: Failed to fetch` on upload or authenticated POST (no HTTP status)

**Symptom:** Browser network tab shows failed request with no response body; often on large uploads or first authenticated POST after idle.

**Cause:** Fastly idle write-timeout before server consumed request body (see `apps/api/src/index.ts` comment). Regression if custom `createServer` body drain is removed.

**Fix:** Ensure production runs current `index.ts` with `rawBody` drain. Do not add async middleware before body consumption without testing through Railway/Fastly.

---

## `Request body exceeds the 11 MB limit.`

**Symptom:** API **413** with code `payload_too_large`.

**Cause:** Single request body over global Hono `bodyLimit` (11 MB). Chunks are sized at 5 MB client-side; this usually means a misconfigured client sending whole file in one request or oversized non-upload POST.

**Fix:** Use chunked upload endpoint; reduce payload size.

---

## `Failed to send email. Please try again.`

**Symptom:** Feedback form error; API **502**, code `EMAIL_FAILED`.

**Cause:** `BREVO_API_KEY` is set but Brevo API rejected the send. Check Railway logs for `[feedback] Brevo error:` with status and body.

**Fix:** Verify Brevo API key, sender domain verification, and recipient limits in Brevo dashboard.

---

## `Expected N chunks but only received M. Please retry the upload.`

**Symptom:** API **409**, code `CHUNK_MISSING`.

**Cause:** Final chunk arrived but temp directory missing prior chunk files (partial upload, concurrent upload_id collision, or tmp cleanup).

**Fix:** Retry full upload from client. Check `chunk_readdir_failed` in logs if persistent.

---

## Song record disappears shortly after “successful” upload

**Symptom:** Upload UI completes; song briefly appears then is gone.

**Cause:** Background pipeline failed after HTTP 201 — `buildAndUploadSong` error triggers delete. Log: **`song_background_upload_failed`** then possibly **`song_cleanup_delete_failed`**.

**Fix:** Inspect the error on `song_background_upload_failed` (Drive, tagger, DB). Fix root cause (Google vars, file format, permissions) and re-upload.

---

## Useful log events

Structured logs use `{ event, category, context?, error? }`. Grep Railway log stream for these `event` values:

| Event | Meaning |
|-------|---------|
| `scheduler_started` | In-process scheduler running; includes `interval_ms`. **Should appear once per deploy** if scheduler enabled. |
| `scheduler_stopped` | Scheduler cleared (SIGTERM shutdown). |
| `tick_completed` | Status tick finished; `sessions_checked`, `sessions_updated`. Confirms cron loop alive even when nothing changed. |
| `tick_failed` | Entire tick pass threw (unexpected); scheduler continues on next interval. |
| `session_status_updated` | DB session row moved (e.g. `scheduled` → `checkin_open`); includes `session_id`, `status`. |
| `auto_fill_completed` | Queue auto-fill sweep finished for all in-window sessions. |
| `auto_fill_failed` | Auto-fill failed for one session; includes `session_id`. |
| `auth_failed` | JWT missing or invalid; context `reason`: `missing_token` or `invalid_token`. |
| `auth_forbidden` | Authenticated user lacked admin role on admin route. |
| `auth_sync_failed` | POST `/v1/auth/sync` rejected or Clerk verify failed. |
| `unhandled_error` | Uncaught exception in a route; check `path`, `method`, Sentry. |
| `song_background_upload_failed` | Post-chunk Drive/tag/DB pipeline failed; song may be deleted. |
| `song_drive_share_failed` | Could not share Drive file with uploader/partner emails. |
| `song_drive_share_partial_failure` | Some share emails failed; see `failed` list in context. |
| `chunk_readdir_failed` | Could not list temp chunk directory during finalize. |
| `checkin_create_failed` | Check-in POST failed server-side. |
| `queue_promote_failed` | Manager/admin queue promote failed. |
| `queue_complete_failed` | Mark queue entry complete failed. |
| `queue_withdraw_failed` | Withdraw from queue failed. |
| `sigterm_received` | Container received SIGTERM (deploy/scaling). |
| `server_closed` | Graceful shutdown completed. |
| `sigterm_hard_kill` | Forced exit after 10 s drain timeout. |
| `db_connected` | Startup: pool configured (not an error — confirms DB env). |

### Route-level `*_failed` events (grep when a specific action breaks)

| Event | Route / area |
|-------|----------------|
| `admin_event_song_submission_list_failed` | Admin event submissions list |
| `admin_checkin_inject_failed` | Admin test check-in inject |
| `auth_profile_update_failed` | PATCH profile |
| `checkin_self_withdraw_failed` | Self withdraw from queue |
| `checkin_song_not_submitted` | Check-in rejected — song not submitted to event |
| `event_song_submission_list_failed` | List own submissions |
| `event_song_submission_create_failed` | Submit song to event |
| `event_song_submission_delete_failed` | Delete submission |
| `managed_partnership_create_failed` | Create managed partnership |
| `managed_partnership_update_failed` | Update managed partnership |
| `managed_partnership_delete_failed` | Delete managed partnership |
| `queue_incomplete_failed` | Mark entry incomplete |
| `queue_move_down_failed` | Move down in queue |
| `queue_promote_blocked` | Promote rejected (business rule) |
| `session_divisions_put_failed` | Admin session divisions update |
| `song_delete_failed` | Song delete |
| `song_drive_soft_delete_failed` | Drive trash on delete failed |
| `team_create_failed` | Team create |

---

## Related docs

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Railway, Cloudflare, CI, env vars, first-deploy runbook
- [`apps/api/docs/AUTHENTICATION.md`](../apps/api/docs/AUTHENTICATION.md) — auth codes and guards
- [`apps/app/docs/ARCHITECTURE.md`](../apps/app/docs/ARCHITECTURE.md) — frontend upload and auth sync behaviour
