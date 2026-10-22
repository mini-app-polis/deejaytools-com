# Troubleshooting

Symptom-first guide. Headings match **exact error text or observable behaviour** from the web app and from the API it talks to, [`api-deejaytools`](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md) (FastAPI/Python on Railway). Each entry: **Cause** → **Fix**.

The API's configuration lives in the shared Doppler config (`mini-app-polis-ecosystem`: `dev` locally, `prd` synced to Railway) under the names in its [`.env.example`](https://github.com/mini-app-polis/api-deejaytools/blob/main/.env.example). A variable the Railway service reads must also be listed in its [`.railway/railway.ts`](https://github.com/mini-app-polis/api-deejaytools/blob/main/.railway/README.md), or the next apply removes it.

For the web app's deployment and env vars, see [`DEPLOYMENT.md`](./DEPLOYMENT.md). For API-side procedures (retrying failed song builds, Discord notifications), see api-deejaytools' [`docs/OPERATIONS.md`](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/OPERATIONS.md).

---

## Deploy fails at the migration step: `Neither DEEJAYTOOLS_DATABASE_URL_MIGRATIONS nor DEEJAYTOOLS_DATABASE_URL is set.`

**Symptom:** The API deploy never becomes healthy; the Railway deploy log ends with this line from `scripts/apply_migrations.py`.

**Cause:** The container's start command runs `apply_migrations.py`, then `backfill_principals.py`, then uvicorn, chained with `&&`. With no database URL the migration runner exits before the app starts. (The app itself would refuse to start too: `DEEJAYTOOLS_DATABASE_URL` is a required setting.)

**Fix:**

1. Check that `DEEJAYTOOLS_DATABASE_URL` is set on the Railway service (it references Railway's Postgres service; it is not in Doppler).
2. Redeploy.
3. Locally, export it in your shell before `doppler run` (api-deejaytools README, "Running locally").

`DEEJAYTOOLS_DATABASE_URL_MIGRATIONS` is optional. When it is unset the runner logs a warning that migrations run as the runtime role (OPS-002) and carries on with `DEEJAYTOOLS_DATABASE_URL`.

---

## Every authenticated call returns 401 `Authentication required`

**Symptom:** Signed-in users get **401** `{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }` on every authenticated endpoint. API logs show:

```
auth_failed: DEEJAYTOOLS_CLERK_ISSUER / DEEJAYTOOLS_CLERK_JWKS_URL unset
```

**Cause:** The API trusts exactly one Clerk issuer, configured by `DEEJAYTOOLS_CLERK_ISSUER` and `DEEJAYTOOLS_CLERK_JWKS_URL`. With either unset, every bearer token is refused with a 401 (not a 500).

Other `auth_failed` lines name the reason: `auth_failed: missing_token` (no `Authorization: Bearer …` header) or `auth_failed: <verifier error>` (bad or expired token, wrong issuer, JWKS unreachable). Read the verifier error when a rotated key or an unreachable JWKS looks like a run of bad tokens.

**Fix:**

1. Set both in Doppler for the environment, e.g. `DEEJAYTOOLS_CLERK_ISSUER=https://clerk.deejaytools.com` and `DEEJAYTOOLS_CLERK_JWKS_URL=https://clerk.deejaytools.com/.well-known/jwks.json`.
2. Confirm the web app's `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY` belongs to the same Clerk instance; tokens from another instance carry a different issuer and are refused.
3. Redeploy the API and retry.

---

## 401 `USER_NOT_SYNCED` — `Call POST /v1/auth/sync first`

**Symptom:** API returns:

```json
{ "error": { "code": "USER_NOT_SYNCED", "message": "Call POST /v1/auth/sync first" } }
```

**Cause:** The Clerk JWT is valid, but the caller is not yet a principal (no synced `users` row). The app expects a one-time sync after sign-in.

**Fix:**

1. Sign in on the frontend and navigate to any route inside `Layout` (not `/` alone; `AuthSync` does not run on the landing page).
2. `AuthSync` POSTs `/v1/auth/sync` with the Clerk token, up to 3 attempts.
3. If sync still fails, check the browser console / Sentry for the frontend event `auth_sync_failed` (it carries the API's status and body), and confirm the user has a primary email in Clerk (otherwise `auth_sync_skipped` with `missing_primary_email`).
4. Manually POST `/v1/auth/sync` with a valid Bearer token if debugging.

---

## `This email address is already linked to a different sign-in. Contact an organizer to have your account moved to this sign-in.`

**Symptom:** A persistent toast after sign-in; `/v1/auth/sync` returns **409** `EMAIL_BELONGS_TO_ANOTHER_ACCOUNT`. API log: `auth_sync_email_conflict user=<clerk user id>`.

**Cause:** The person's email already belongs to another `users` row: a Clerk account deleted and re-created, or an email changed in Clerk to one an old row still holds. The API refuses rather than hand over the other row's data, and `AuthSync` does not retry.

**Fix:** An organizer moves the account to the new sign-in in the database. No configuration change helps.

---

## `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY is required`

**Symptom:** Blank page; browser console shows uncaught error at startup from `src/main.tsx`.

**Cause:** Production build was deployed without `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY`. `vite.config.ts` inlines it at **build time**, so setting the variable after the build does nothing.

**Fix:**

1. Add `DEEJAYTOOLS_CLERK_PUBLISHABLE_KEY` in Cloudflare Pages → Settings → Environment variables (Production **and** Preview if you use previews), or in the Doppler config that syncs to Pages.
2. **Trigger a new build** (retry deployment or push a commit).
3. Verify locally: copy `.env.example` to `.env.local` and set the key before `pnpm dev`.

---

## Postgres unreachable / API 500s on every database route

**Symptoms (typical):**

- API answers **500** `INTERNAL` on routes that touch the database, while `/health` still answers **200** `{"status":"ok"}`.
- API log: `unhandled <ExceptionType> on <METHOD> <path>`; the same faults appear as `fault · 500` in the Discord `errors` channel and in Sentry.

**Cause:** Wrong `DEEJAYTOOLS_DATABASE_URL`, database down, or network trouble. `/health` is liveness only: it never queries the database, so it does not turn 503 when Postgres is down.

**Fix:**

1. Verify `DEEJAYTOOLS_DATABASE_URL` (host, port, user, password, database name). Plain `postgresql://` or `postgres://` URLs are fine; the app switches them to asyncpg.
2. Confirm the Railway Postgres service is healthy.
3. Read the exception type in the log line or its Sentry event (query parameters are deliberately left out of both).

There are no pool-tuning environment variables; the engine uses SQLAlchemy's defaults with `pool_pre_ping`.

---

## Missing table / relation errors (`relation "…" does not exist`)

**Symptom:** API 500s; Sentry shows a Postgres error mentioning a missing relation (e.g. `sessions`, `users`, `songs`, `song_uploads`).

**Cause:** Migrations were not applied to this database. Common after pointing `DEEJAYTOOLS_DATABASE_URL` at a fresh DB or restoring an old snapshot.

**Fix:**

1. **Production:** every deploy runs `scripts/apply_migrations.py` before the app starts. If you restored the DB by hand, redeploy. A failing migration stops the start command, so the new deployment never passes its `/health` healthcheck; fix the migration and redeploy.
2. **Local**, from the api-deejaytools checkout: `doppler run -- uv run python scripts/apply_migrations.py`, then `doppler run -- uv run python scripts/backfill_principals.py`.
3. An existing database adopted for the first time needs the one-off bootstrap (`BOOTSTRAP_MIGRATIONS` / `BOOTSTRAP_EXCLUDE`) in the api-deejaytools README, "Database and migrations".

---

## `address already in use` on port 3001

**Symptom:** The API fails to start locally; uvicorn cannot bind to port **3001**.

**Cause:** Another process (often a previous uvicorn run of api-deejaytools) is bound to `3001`.

**Fix:**

1. Find the process: `lsof -i :3001` (macOS/Linux).
2. Stop it: `kill <PID>` or stop the other terminal session.
3. Or run uvicorn with a different `--port` and point `DEEJAYTOOLS_API_DEV` (the Vite dev-server proxy target) at it.

Production on Railway uses the injected `PORT`, so this error is almost always local dev.

---

## Uploaded songs never get a Drive file (`drive_work_skipped`)

**Symptom:** Uploads complete in the browser and the song appears, but it never gets a Drive file, and Drive jobs (renames, event copies, trash) stop moving. API log, once per process:

```
drive_work_skipped: Google Drive is not configured; song builds and Drive jobs stay queued
```

**Cause:** `GOOGLE_CREDENTIALS_JSON` or `GOOGLE_DRIVE_PARENT_FOLDER_ID` is missing or empty, or `GOOGLE_CREDENTIALS_JSON` is not a key file with both `client_email` and `private_key`. The scheduler then skips song builds and Drive jobs rather than failing them, so nothing burns its retries. A Drive call made anyway fails with `Google Drive environment variables are not configured`.

**Fix:**

1. Set both in Doppler (see api-deejaytools' `.env.example`). `GOOGLE_CREDENTIALS_JSON` is the fleet's one service-account key file, the same value the cogs read.
2. Redeploy. Queued builds and jobs run on the next scheduler passes; nothing needs re-uploading.

---

## Google service-account key file

**Symptom:** Drive auth fails at runtime with PEM / key-parsing errors; song builds fail (`song_background_upload_failed song=<id>: …`).

**Cause:** `GOOGLE_CREDENTIALS_JSON` holds something other than the JSON key file Google issued: a bare PEM, an edited file, or a key that was since deleted in Google Cloud.

**Fix:**

1. Paste the whole downloaded key file. Either form of the private key's line breaks works: `\n` escapes as Google writes them, or real newlines as Doppler may store them.
2. Redeploy. Builds kept for retry pick up again on their own; any that gave up can be requeued (api-deejaytools OPERATIONS.md, "Retrying failed song builds").

---

## Drive folder not shared with service account

**Symptom:** Song builds fail with a Google API **403** / **404** (e.g. "File not found", "Insufficient permissions") when creating subfolders or uploading under `GOOGLE_DRIVE_PARENT_FOLDER_ID`.

**Cause:** The parent folder exists in your personal Drive but the **service account email** was never granted access. The API uses the `drive.file` scope.

**Fix:**

1. In Google Drive, share `GOOGLE_DRIVE_PARENT_FOLDER_ID` with the service account (the key file's `client_email`) as **Editor** (or Content manager on shared drives).
2. Re-upload songs that were removed (below); requeue builds that gave up (api-deejaytools OPERATIONS.md).

---

## Song record disappears shortly after a "successful" upload

**Symptom:** Upload UI completes; the song briefly appears, then is gone.

**Cause:** The upload is accepted and its bytes are staged in `song_uploads`; the Drive build runs afterwards on the scheduler. When a build fails and **nothing references the song yet** (no event submission, no check-in), the song is deleted and the uploader has to upload again. Log: `song_background_upload_failed song=<id>: …`; Discord `errors`: `song build <id> · failed, song removed`; a Sentry event tagged `subsystem=song_builds`.

A song that **is** referenced cannot be deleted. Its build is retried with backoff (`song_cleanup_delete_failed song=<id>: build will retry`, then `song_build_retrying song=<id> attempts=<n>`) and gives up after 10 attempts (`song_build_exhausted`; Discord `song build <id> · gave up after 10 attempts`).

**Fix:** Read the exception on `song_background_upload_failed` or its Sentry event (Drive credentials, folder sharing, tagging, DB). Fix the root cause, re-upload removed songs, and requeue exhausted builds with the SQL in api-deejaytools OPERATIONS.md.

---

## `File exceeds 100 MB limit`

**Symptom:** API **400** with message exactly: `File exceeds 100 MB limit`.

**Cause:** The assembled file after chunked upload exceeds `MAX_ASSEMBLED_BYTES` (110 MiB) in api-deejaytools `routers/song_uploads.py`. The message still says "100 MB": the browser rejects files over 100 MiB client-side (`MAX_FILE_BYTES` in `src/lib/chunkedSongUpload.ts`), so a file between 100 and 110 MiB never reaches the server from the app but would pass a direct API upload.

Related refusals from the same route: `Chunk exceeds 10 MB limit` (one chunk; the app sends 5 MiB chunks) and `Invalid total_chunks (max 30)`.

**Fix:** Upload a smaller file.

---

## `That file doesn't look like a supported audio format. Please upload an MP3, WAV, FLAC, or M4A.`

**Symptom:** API **400** with `error.code` **`UNSUPPORTED_FORMAT`** and the message above.

**Cause:** Server magic-byte sniffing (`detect_audio_format` in api-deejaytools `services/audio_format.py`) did not recognize the assembled file: wrong type, corrupt file, or a renamed non-audio file. The client's MIME type is not trusted (iOS often sends `application/octet-stream`).

**Fix:**

1. Confirm the file is a real MP3, WAV, FLAC, or M4A.
2. Re-export from a DAW or converter if needed.
3. On iOS, the file picker omits `accept="audio/*"` by design; server validation is the gate.

---

## `"<file>" couldn't be read from disk. If it's stored in iCloud Drive, Google Drive or Dropbox, …`

**Symptom:** Upload fails immediately, or partway through, with this message (or `"<file>" is empty (0 bytes).`) from `src/lib/chunkedSongUpload.ts`.

**Cause:** The browser could not read the file's bytes, typically because it is a cloud-storage placeholder that has not been downloaded, so the chunk `fetch` fails with `TypeError: Failed to fetch`. The client checks the file before blaming the network and does not retry an unreadable file.

**Fix:** Open the file's folder, make sure it is fully downloaded (no cloud icon), and upload again.

---

## `Your session expired. Please sign in again and retry the upload.`

**Symptom:** Mid-upload failure in the browser with this exact string from `src/lib/chunkedSongUpload.ts`.

**Cause:** `getToken()` returned null (or threw) before a chunk: Clerk session expired, or signed out in another tab.

**Fix:**

1. Sign in again.
2. Re-upload the file from the beginning (each attempt gets a new `upload_id`).
3. Note: an API **401** on a chunk also aborts immediately without retry. The message shown is then the server's `error.message` (e.g. `Authentication required`), or `Upload failed (401)` if the body is not parseable, not the session-expired string above.

---

## `Upload failed (<ErrorName>: <message>) — the connection may have dropped. Retrying…`

**Symptom:** During chunked upload, the client shows this pattern (from `chunkedSongUpload.ts`); after 3 attempts on one chunk the upload fails with it.

**Cause:** No HTTP response came back for a chunk while the file itself was still readable: the client went offline, the API was unreachable, or the browser blocked the response (CORS, below).

**Fix:**

1. Check the API is up (`GET /health`) and that the app's API URL is right (`DEEJAYTOOLS_API` / `DEEJAYTOOLS_API_DEV`).
2. Check the browser console for a CORS error.
3. Retry on a stable network.

---

## `Expected N chunks but only received M. Please retry the upload.`

**Symptom:** API **409**, code `CHUNK_MISSING`.

**Cause:** The final chunk arrived but the API container's temp directory (`/tmp/dj-upload-chunks/…`) lacks earlier chunk files: a partial upload, a deploy or restart during the upload, or the two-hour cleanup of stale chunks.

**Fix:** Retry the full upload. If the directory cannot be read at all, the API answers **500** `CHUNK_ERROR` `Failed to read uploaded chunks` and logs `chunk_readdir_failed`.

---

## `Request body exceeds the 11 MB limit.`

**Symptom:** API **413** with code `payload_too_large`.

**Cause:** A single request body over the API's 11 MiB limit (`BodyLimitMiddleware` in api-deejaytools `middleware.py`). Chunks are 5 MiB client-side, so this usually means a client sending the whole file in one request or an oversized non-upload POST.

**Fix:** Use the chunked upload endpoint; reduce payload size.

---

## `Request timed out after 30000ms` / `Rate limit exceeded. Please slow down.`

**Symptom:** API **503** `request_timeout`, or **429** `too_many_requests`.

**Cause:** Request limits on `/v1/*` (api-deejaytools `middleware.py`): a 30 s deadline (300 s under `/v1/songs/upload/`), and 300 requests a minute per client address. A handler that overruns its deadline is not cancelled: its writes still land, only its response is discarded. Each such 503 is posted to Discord `errors` as `deadline exceeded after <ms>ms`.

**Fix:** For timeouts, find the slow handler in Sentry / Discord; for 429s, look for a polling loop or script hammering the API.

---

## Feedback form succeeds but no email arrives

**Symptom:** User sees success on `/feedback`; API returns **201**; nothing in inbox.

**Cause:** No Brevo key. The API reads `BREVO_API_KEY`, the fleet's one Brevo key. Without it it logs:

```
feedback BREVO_API_KEY not set; skipping transactional email
```

and still returns success, by design. The Discord `activity` post for that feedback says the message was not kept; it is the only sign the feedback arrived.

**Fix:**

1. Set `BREVO_API_KEY` in Doppler (Brevo → SMTP & API → API Keys).
2. Redeploy.
3. Submit test feedback.

---

## `Failed to send email. Please try again.`

**Symptom:** Feedback form error; API **502**, code `EMAIL_FAILED`.

**Cause:** A Brevo key is set but Brevo rejected the send. API log: `feedback brevo_error status=<status> body=<body>`; Discord `errors` gets a `fault · 502`.

**Fix:** Verify the Brevo API key, sender domain verification, and recipient limits in the Brevo dashboard.

---

## Sessions not advancing status / active queue not filling

**Symptoms:**

- Session stays `scheduled` past check-in open time in the DB (the UI may still **look** correct; see below).
- Active queue empty at floor-trial start; manager "Active" panel never fills.
- No `session_status_updated` or `auto_fill_completed` in logs.

**Cause:** The in-process scheduler is not running, or its pass is failing.

**Fix:**

1. After a deploy, look for **`scheduler_started interval_ms=<n>`**. If you see **`scheduler_disabled disable_scheduler=… env=…`** instead, the scheduler is off:
   - **`DISABLE_SCHEDULER`**: only the literal string **`"1"`** disables it. `"true"`, `"yes"`, `"0"` etc. leave it **on**.
   - **`ENVIRONMENT=test`** also turns it off.
2. **`TICK_INTERVAL_MS`**: default **30000** (30 s). A pass also runs once at startup.
3. A healthy scheduler logs **`tick_completed sessions_checked=<n> sessions_updated=<n>`** and **`auto_fill_completed …`** on every pass. Look for **`tick_failed`** (session work), **`auto_fill_failed session_id=<id>`** (one session), **`song_builds_tick_failed`** and **`drive_jobs_tick_failed`**. A failing step is also posted to Discord `errors` once per run of failures (`scheduler · sessions`, `scheduler · song builds`, `scheduler · drive jobs`).
4. Manual pass: `GET /internal/tick` with header `x-tick-secret: <TICK_SECRET>`; it answers `{ "data": { "ticked": true }, … }` once the pass has finished.

**Reassurance:** Session **display** status on reads is **derived from the wall clock** in API responses (`derive_status` in api-deejaytools `routers/sessions.py`), so the Floor Trials UI can show "check-in open" even when the DB `status` column lags. What actually stops is **DB status transitions** and **automatic active-queue fill**, plus song builds and Drive jobs, which run on the same pass. Check-ins and manual manager actions still work.

---

## CORS error in browser (`Access-Control-Allow-Origin`)

**Symptom:** Browser console blocks a fetch to the API; preflight or response missing CORS headers.

**Cause:** The frontend origin is not in the API's `DEEJAYTOOLS_CORS_ORIGINS`. Unset, it allows only `http://localhost:5173`. The legacy unprefixed `CORS_ORIGINS` is **not** read.

**Fix:**

1. Set `DEEJAYTOOLS_CORS_ORIGINS` in Doppler to a comma-separated list including every frontend origin (production domain, `www`, Cloudflare preview URLs if needed).
2. Redeploy the API.
3. Ensure `DEEJAYTOOLS_API` (or `DEEJAYTOOLS_API_DEV` on previews) points at the same API host the browser calls.

---

## `GET /internal/tick` returns 403 `Admin access required`

**Symptom:** HTTP **403** `FORBIDDEN` with message `Admin access required` when calling `/internal/tick`.

**Cause:** The `x-tick-secret` header is missing or does not match `TICK_SECRET`, **or `TICK_SECRET` is unset**: the route fails closed and refuses every call when no secret is configured. An empty `TICK_SECRET` counts as a set secret, so leave it unset rather than blank.

**Fix:** Set `TICK_SECRET` to a long random string in Doppler and send `x-tick-secret: <exact value>` from whatever calls the route. The in-process scheduler does not use the route; it is an operator override.

---

## Useful log events

The API logs plain-text lines through the shared `mini_app_polis.logger`: an event name, then `key=value` details or `: <error>`. Grep the Railway log stream for these:

| Event | Meaning |
|-------|---------|
| `api-deejaytools starting (env=…, sentry=on\|off)` | Process start; confirms the environment and whether Sentry is configured. |
| `scheduler_started interval_ms=<n>` | In-process scheduler running. **Should appear once per process start** if enabled. |
| `scheduler_disabled disable_scheduler=… env=…` | Scheduler off (`DISABLE_SCHEDULER=1` or `ENVIRONMENT=test`). |
| `scheduler_stopped` | Scheduler stopped at shutdown. |
| `api-deejaytools shutting down` | Graceful shutdown. |
| `tick_completed` | Status pass finished; `sessions_checked`, `sessions_updated`. Confirms the loop is alive even when nothing changed. |
| `tick_failed` | Session status / auto-fill step threw; the pass goes on to Drive work. |
| `session_status_updated` | DB session row moved (e.g. `scheduled` → `checkin_open`); `session_id`, `status`. |
| `auto_fill_completed` | Queue auto-fill sweep finished; `sessions_checked`, `entries_promoted`. |
| `auto_fill_failed` | Auto-fill failed for one session; `session_id`. |
| `drive_work_skipped` | Drive not configured; builds and Drive jobs wait. Logged once per process. |
| `song_builds_tick_failed` / `drive_jobs_tick_failed` | The song-build or Drive-job step of a pass threw. |
| `auth_failed` | `missing_token`, unset Clerk issuer/JWKS, or the verifier's error. |
| `auth_sync_email_conflict` | `/v1/auth/sync` refused: email belongs to another account. |
| `unhandled <Type> on <METHOD> <path>` | Uncaught exception in a route; answered 500, reported to Sentry and Discord. |
| `handler failed after its deadline` | A handler that already got a 503 later raised. |
| `song_background_upload_failed` | A song's Drive build failed; the song is removed or retried (see above). |
| `song_build_retrying` / `song_build_exhausted` | Build kept for retry / gave up after 10 attempts. |
| `song_cleanup_delete_failed` | Song could not be removed after a failed build (usually because it is referenced); the build will retry. |
| `song_drive_share_failed` | Could not share the Drive file with the uploader/partner emails. |
| `song_drive_share_partial_failure` | Some share emails failed; see `failed=`. |
| `chunk_readdir_failed` | Could not list the temp chunk directory during finalize. |
| `feedback brevo_error` | Brevo refused a feedback email. |
| `discord notifications off: no webhook for channel=…` | A Discord channel has no webhook configured (logged once per channel). |

### Route-level events (grep when a specific action breaks)

| Event | Route / area |
|-------|----------------|
| `admin_event_song_submission_list_failed` | Admin event submissions list |
| `admin_checkin_inject_failed` | Admin test check-in inject |
| `admin_self_demote_blocked` | Admin tried to change their own role |
| `checkin_create_failed` | Check-in POST |
| `checkin_self_withdraw_failed` | Self withdraw from queue |
| `checkin_song_not_submitted` | Check-in rejected: song not submitted to event |
| `event_entity_list_failed` | Event entities list |
| `event_song_submission_list_failed` | List own submissions |
| `event_song_submission_create_failed` | Submit song to event |
| `event_song_submission_delete_failed` | Delete submission |
| `managed_partnership_create_failed` | Create managed partnership |
| `managed_partnership_update_failed` | Update managed partnership |
| `managed_partnership_delete_failed` | Delete managed partnership |
| `queue_promote_failed` | Manager/admin queue promote |
| `queue_promote_blocked` | Promote rejected (business rule) |
| `queue_complete_failed` | Mark queue entry complete |
| `queue_incomplete_failed` | Mark entry incomplete |
| `queue_move_down_failed` | Move down in queue |
| `queue_withdraw_failed` | Withdraw from queue |
| `session_divisions_put_failed` | Admin session divisions update |
| `song_delete_failed` | Song delete |
| `team_create_failed` | Team create |
| `drive_jobs_list_failed` / `drive_jobs_summary_failed` | Admin Drive jobs views |
| `drive_rename_backfill_failed` | Admin rename backfill |

Faults (5xx, unhandled exceptions, background failures) also go to Sentry, through the Python SDK with the `SENTRY_DSN_APIS` DSN (the shared `apis` project; events tagged `service=api-deejaytools`), and to the Discord `errors` channel. The browser app reports to its own Sentry project via `SENTRY_DSN_DEEJAYTOOLS` (see [`DEPLOYMENT.md`](./DEPLOYMENT.md)).

---

## Related docs

- [`DEPLOYMENT.md`](./DEPLOYMENT.md): Cloudflare Pages, CI, web app env vars, first-deploy runbook
- [`api-deejaytools` README](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md): endpoints and their scopes, running locally, migrations, deployment
- [`api-deejaytools` docs/OPERATIONS.md](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/OPERATIONS.md): retrying failed song builds, Discord notifications
- [`ARCHITECTURE.md`](ARCHITECTURE.md): frontend upload and auth sync behaviour
