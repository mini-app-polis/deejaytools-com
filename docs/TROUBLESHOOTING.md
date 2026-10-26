# Troubleshooting

Symptom-first guide to problems seen in the web app. Headings match **exact error text or observable behaviour**. Each entry: **Cause** → **Fix**.

For the web app's deployment and env vars, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Problems fixed on the API side

These are in [api-deejaytools' troubleshooting guide](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md), since their fix is in that service's deploy, configuration or data:

- [Deploy fails at the migration step: `Neither DEEJAYTOOLS_DATABASE_URL_MIGRATIONS nor DEEJAYTOOLS_DATABASE_URL is set.`](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#deploy-fails-at-the-migration-step-neither-deejaytools_database_url_migrations-nor-deejaytools_database_url-is-set)
- [Every authenticated call returns 401 `Authentication required`](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#every-authenticated-call-returns-401-authentication-required)
- [Postgres unreachable / API 500s on every database route](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#postgres-unreachable--api-500s-on-every-database-route)
- [Missing table / relation errors (`relation "…" does not exist`)](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#missing-table--relation-errors-relation--does-not-exist)
- [`address already in use` on port 3001](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#address-already-in-use-on-port-3001)
- [Uploaded songs never get a Drive file (`drive_work_skipped`)](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#uploaded-songs-never-get-a-drive-file-drive_work_skipped)
- [Google service-account key file](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#google-service-account-key-file)
- [Drive folder not shared with service account](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#drive-folder-not-shared-with-service-account)
- [Song record disappears shortly after a "successful" upload](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#song-record-disappears-shortly-after-a-successful-upload)
- [Feedback form succeeds but no email arrives](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#feedback-form-succeeds-but-no-email-arrives)
- [`Failed to send email. Please try again.`](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#failed-to-send-email-please-try-again)
- [Sessions not advancing status / active queue not filling](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#sessions-not-advancing-status--active-queue-not-filling)
- [CORS error in browser (`Access-Control-Allow-Origin`)](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#cors-error-in-browser-access-control-allow-origin)
- [`GET /internal/tick` returns 403 `Admin access required`](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#get-internaltick-returns-403-admin-access-required)
- [Useful log events](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md#useful-log-events)

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

**Cause:** No HTTP response came back for a chunk while the file itself was still readable: the client went offline, the API was unreachable, or the browser blocked the response (CORS: see "Problems fixed on the API side" above).

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

## Related docs

- [`DEPLOYMENT.md`](./DEPLOYMENT.md): Cloudflare Pages, CI, web app env vars, first-deploy runbook
- [`api-deejaytools` README](https://github.com/mini-app-polis/api-deejaytools/blob/main/README.md): endpoints and their scopes, running locally, migrations, deployment
- [`api-deejaytools` docs/TROUBLESHOOTING.md](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/TROUBLESHOOTING.md): problems fixed on the API side
- [`api-deejaytools` docs/OPERATIONS.md](https://github.com/mini-app-polis/api-deejaytools/blob/main/docs/OPERATIONS.md): retrying failed song builds, Discord notifications
- [`ARCHITECTURE.md`](ARCHITECTURE.md): frontend upload and auth sync behaviour
