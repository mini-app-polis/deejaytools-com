-- Add timezone column to events table.
-- All session timestamps for an event are interpreted and displayed in this
-- IANA timezone. Existing events default to "America/Chicago".

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'America/Chicago';
