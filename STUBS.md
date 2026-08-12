# Stubbed features

Stubbed features awaiting DB schema. Grep `STUB(db)` to find all call sites.

| Feature | Endpoints | Needs | Files |
| --- | --- | --- | --- |
| Managed check-in (DEFERRED) | — | Managed songs to persist + a managed-pair entity on `checkins` / `queue_entries` / `runs` so a manager can check in a managed partnership they own | — (no code yet) |

Check-in gating (DEFERRED): POST `/v1/checkins` must eventually require that the song is submitted to the session's event (`event_song_submissions` row for `(event_id, song_id)`) before a floor-trial check-in is allowed. Marker: `TODO(event-submission-gate)` in `apps/api/src/routes/checkins.ts`.
