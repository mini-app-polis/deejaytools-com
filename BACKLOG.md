# Backlog

Deferred features and known gaps. Not bugs — things that were intentionally
left out of the initial build and need to come back.

---

## Floor trial UX — full revisit

The events, sessions, and queue flows were migrated from the old platform
but not redesigned. The whole floor trial experience needs a UX pass once
there is real usage to react to. This includes:

- Session creation and management UI
- Check-in flow from the user's perspective
- Queue display and slot management for admins
- Railway cron for automatic session status transitions
  (`GET /internal/tick` — `TICK_SECRET` is already configured)

Priority: when floor trial work resumes.

---

## Admin-configurable divisions list

Song upload uses a hardcoded list of 15 WCS divisions in the frontend.
The right solution is an admin-managed divisions table with a CRUD UI.

Defer until floor trial UX revisit — session divisions and song divisions
should be managed from the same place.

---

## Contract test coverage

Current coverage: ~68% statements, 70% functions.
Remaining gaps: slots happy paths, checkins business logic branches,
optional-user helper, middleware JWT verification path.

Target: 75% statements.

---

## common-typescript-utils versioning

Generic utilities are consumed from the published `common-typescript-utils`
npm package. When adding or changing shared helpers, coordinate releases there
and bump the dependency in this repo.

---

## Song upload — Spotify URL field

Store a Spotify playlist/track URL directly on the `Song` model.
Add a `spotify_url` column and a `PATCH /v1/songs/:id` field for it.
Display in the songs table as a link.

Deferred from initial build.

---

## Doppler development config

The `development` config in Doppler is not populated. Local dev currently
requires manually maintaining `apps/api/.env`. Populate the development
config and document the `doppler run` local dev workflow in the README.
