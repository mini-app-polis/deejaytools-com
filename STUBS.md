# Stubbed features

Stubbed features awaiting DB schema. Grep `STUB(db)` to find all call sites.

| Feature | Endpoints | Needs | Files |
| --- | --- | --- | --- |
| Teams | GET/POST/PATCH/DELETE `/v1/teams` | `teams` table (`id`, `user_id`→users, `identifier`, `created_at`, `updated_at`) + unique(`user_id`, `identifier`) | `packages/schemas/src/index.ts`, `apps/api/src/routes/teams.ts`, `apps/api/src/app.ts`, `apps/app/src/components/TeamsSection.tsx`, `apps/app/src/pages/MyProfilePage.tsx`, `apps/app/src/api/client.ts` |
| Managed Partnerships | GET/POST/PATCH/DELETE `/v1/managed-partnerships` | `managed_partnerships` table (`id`, `user_id`→users, `leader_first_name`, `leader_last_name`, `follower_first_name`, `follower_last_name`, `created_at`, `updated_at`) | `packages/schemas/src/index.ts`, `apps/api/src/routes/managed-partnerships.ts`, `apps/api/src/app.ts`, `apps/app/src/components/ManagedPartnershipsSection.tsx`, `apps/app/src/pages/MyProfilePage.tsx` |
| Managed song upload | POST `/v1/songs/upload/chunk` (optional `managed_partnership_id` field, stubbed to 501) | `songs.managed_partnership_id` column (XOR with `partner_id`) | `apps/api/src/routes/songs.ts`, `apps/app/src/pages/AddSongPage.tsx` |
| Managed check-in (DEFERRED) | — | Managed songs to persist + a managed-pair entity on `checkins` / `queue_entries` / `runs` so a manager can check in a managed partnership they own | — (no code yet) |
| Event song submissions | GET/POST/DELETE `/v1/event-song-submissions` | `event_song_submissions` table (`id`, `event_id`→events, `song_id`→songs, `submitted_by_user_id`→users, `created_at`, unique(`event_id`, `song_id`)) | `packages/schemas/src/index.ts`, `apps/api/src/routes/event-song-submissions.ts`, `apps/api/src/app.ts`, `apps/app/src/pages/EventSubmissionsPage.tsx`, `apps/app/src/pages/MyContentPage.tsx` |
| Per-event division/partnership song aggregate (DEFERRED) | — | Cross-user “per event → per division → partnerships + songs” aggregate view for DJs/admins | — (no code yet; separate from event song submissions) |
