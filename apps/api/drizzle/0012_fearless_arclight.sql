CREATE TABLE "drive_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"submission_id" text,
	"file_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" bigint NOT NULL,
	"last_error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_song_submissions" ADD COLUMN "drive_copy_file_id" text;--> statement-breakpoint
CREATE INDEX "idx_drive_jobs_due" ON "drive_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_drive_jobs_submission_id" ON "drive_jobs" USING btree ("submission_id");