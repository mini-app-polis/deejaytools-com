DROP TABLE IF EXISTS "floor_slots" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "checkins" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "checkin_status";--> statement-breakpoint
ALTER TABLE "session_divisions" ADD COLUMN "priority_run_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_divisions" ADD CONSTRAINT "uq_session_divisions_session_division" UNIQUE ("session_id","division_name");--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "max_slots";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "max_priority_runs";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_priority_max" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_non_priority_max" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "ck_sessions_active_caps" CHECK ("active_non_priority_max" <= "active_priority_max" AND "active_priority_max" >= 0);--> statement-breakpoint
DROP TYPE IF EXISTS "queue_type" CASCADE;--> statement-breakpoint
CREATE TYPE "public"."queue_type" AS ENUM('priority', 'non_priority', 'active');--> statement-breakpoint
CREATE TYPE "public"."queue_event_action" AS ENUM('checked_in', 'promoted_to_active', 'run_completed', 'run_incomplete_rotated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."initial_queue" AS ENUM('priority', 'non_priority');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"division_name" text NOT NULL,
	"entity_pair_id" text,
	"entity_solo_user_id" text,
	"song_id" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"event_registration_id" text,
	"initial_queue" "initial_queue" NOT NULL,
	"notes" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "ck_checkins_entity_xor" CHECK (("entity_pair_id" IS NOT NULL AND "entity_solo_user_id" IS NULL) OR ("entity_pair_id" IS NULL AND "entity_solo_user_id" IS NOT NULL))
);--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_entity_pair_id_pairs_id_fk" FOREIGN KEY ("entity_pair_id") REFERENCES "public"."pairs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_entity_solo_user_id_users_id_fk" FOREIGN KEY ("entity_solo_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_registration_id_event_registrations_id_fk" FOREIGN KEY ("event_registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "fk_checkins_session_division" FOREIGN KEY ("session_id", "division_name") REFERENCES "public"."session_divisions"("session_id", "division_name") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"checkin_id" text NOT NULL,
	"session_id" text NOT NULL,
	"entity_pair_id" text,
	"entity_solo_user_id" text,
	"queue_type" "queue_type" NOT NULL,
	"position" integer NOT NULL,
	"entered_queue_at" bigint NOT NULL,
	CONSTRAINT "ck_queue_entries_entity_xor" CHECK (("entity_pair_id" IS NOT NULL AND "entity_solo_user_id" IS NULL) OR ("entity_pair_id" IS NULL AND "entity_solo_user_id" IS NOT NULL)),
	CONSTRAINT "ck_queue_entries_position_positive" CHECK ("position" >= 1),
	CONSTRAINT "queue_entries_checkin_id_unique" UNIQUE("checkin_id")
);--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_entity_pair_id_pairs_id_fk" FOREIGN KEY ("entity_pair_id") REFERENCES "public"."pairs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_entity_solo_user_id_users_id_fk" FOREIGN KEY ("entity_solo_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_queue_entries_session_queue_position" ON "queue_entries" USING btree ("session_id","queue_type","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_queue_entries_session_pair_live" ON "queue_entries" USING btree ("session_id","entity_pair_id") WHERE "queue_entries"."entity_pair_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_queue_entries_session_solo_live" ON "queue_entries" USING btree ("session_id","entity_solo_user_id") WHERE "queue_entries"."entity_solo_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_queue_entries_session_id" ON "queue_entries" USING btree ("session_id");--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"checkin_id" text NOT NULL,
	"session_id" text NOT NULL,
	"event_id" text,
	"division_name" text NOT NULL,
	"entity_pair_id" text,
	"entity_solo_user_id" text,
	"song_id" text NOT NULL,
	"completed_at" bigint NOT NULL,
	"completed_by_user_id" text NOT NULL,
	CONSTRAINT "ck_runs_entity_xor" CHECK (("entity_pair_id" IS NOT NULL AND "entity_solo_user_id" IS NULL) OR ("entity_pair_id" IS NULL AND "entity_solo_user_id" IS NOT NULL)),
	CONSTRAINT "runs_checkin_id_unique" UNIQUE("checkin_id")
);--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_entity_pair_id_pairs_id_fk" FOREIGN KEY ("entity_pair_id") REFERENCES "public"."pairs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_entity_solo_user_id_users_id_fk" FOREIGN KEY ("entity_solo_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_runs_session_id" ON "runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_runs_event_id" ON "runs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_runs_pair_division" ON "runs" USING btree ("entity_pair_id","division_name");--> statement-breakpoint
CREATE INDEX "idx_runs_solo_division" ON "runs" USING btree ("entity_solo_user_id","division_name");--> statement-breakpoint
CREATE TABLE "queue_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"checkin_id" text,
	"action" "queue_event_action" NOT NULL,
	"from_queue" "queue_type",
	"from_position" integer,
	"to_queue" "queue_type",
	"to_position" integer,
	"actor_user_id" text NOT NULL,
	"reason" text,
	"created_at" bigint NOT NULL
);--> statement-breakpoint
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_queue_events_session_created" ON "queue_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE TABLE "event_division_run_limits" (
	"event_id" text NOT NULL,
	"division_name" text NOT NULL,
	"priority_run_limit" integer NOT NULL
);--> statement-breakpoint
ALTER TABLE "event_division_run_limits" ADD CONSTRAINT "event_division_run_limits_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_event_division_run_limits_pk" ON "event_division_run_limits" USING btree ("event_id","division_name");--> statement-breakpoint
CREATE INDEX "idx_checkins_session_id" ON "checkins" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_checkins_entity_pair_id" ON "checkins" USING btree ("entity_pair_id");--> statement-breakpoint
CREATE INDEX "idx_checkins_entity_solo_user_id" ON "checkins" USING btree ("entity_solo_user_id");--> statement-breakpoint
