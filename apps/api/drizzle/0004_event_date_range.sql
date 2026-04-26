-- Add start_date and end_date with a temporary default so existing rows are satisfied
ALTER TABLE "events" ADD COLUMN "start_date" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "end_date" text NOT NULL DEFAULT '';--> statement-breakpoint
-- Copy the existing single date into both columns for all current rows
UPDATE "events" SET "start_date" = COALESCE("date", ''), "end_date" = COALESCE("date", '');--> statement-breakpoint
-- Remove the temporary defaults (new rows must supply explicit values)
ALTER TABLE "events" ALTER COLUMN "start_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "end_date" DROP DEFAULT;--> statement-breakpoint
-- Enforce date ordering
ALTER TABLE "events" ADD CONSTRAINT "ck_events_date_range" CHECK ("start_date" <= "end_date");--> statement-breakpoint
-- Drop the now-replaced columns
ALTER TABLE "events" DROP COLUMN IF EXISTS "date";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
-- Drop the enum type — no longer referenced by any column
DROP TYPE IF EXISTS "public"."event_status";--> statement-breakpoint
-- Remove event registrations (feature removed)
ALTER TABLE "checkins" DROP COLUMN IF EXISTS "event_registration_id";--> statement-breakpoint
DROP TABLE IF EXISTS "event_registrations" CASCADE;
