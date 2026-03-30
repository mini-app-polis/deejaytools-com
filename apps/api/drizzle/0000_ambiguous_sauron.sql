CREATE TYPE "public"."checkin_status" AS ENUM('waiting', 'on_deck', 'running', 'completed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('upcoming', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."queue_type" AS ENUM('priority', 'standard');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'checkin_open', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"event_registration_id" text,
	"pair_id" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"song_id" text,
	"division" text DEFAULT 'Other' NOT NULL,
	"queue_type" "queue_type" NOT NULL,
	"queue_position" integer NOT NULL,
	"status" "checkin_status" DEFAULT 'waiting' NOT NULL,
	"checked_in_at" bigint NOT NULL,
	"last_run_at" bigint
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"partner_id" text,
	"song_id" text,
	"division" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"date" text,
	"status" "event_status" DEFAULT 'upcoming' NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floor_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"slot_number" integer NOT NULL,
	"checkin_id" text,
	"assigned_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_a_id" text NOT NULL,
	"partner_b_id" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"linked_user_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_divisions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"division_name" text NOT NULL,
	"is_priority" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"name" text NOT NULL,
	"date" text,
	"checkin_opens_at" bigint NOT NULL,
	"floor_trial_starts_at" bigint NOT NULL,
	"floor_trial_ends_at" bigint NOT NULL,
	"max_slots" integer DEFAULT 7 NOT NULL,
	"max_priority_runs" integer DEFAULT 3 NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"partner_id" text,
	"display_name" text,
	"original_filename" text,
	"drive_file_id" text,
	"drive_folder_id" text,
	"processed_filename" text,
	"division" text,
	"routine_name" text,
	"personal_descriptor" text,
	"season_year" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"first_name" text,
	"last_name" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_registration_id_event_registrations_id_fk" FOREIGN KEY ("event_registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_slots" ADD CONSTRAINT "floor_slots_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_slots" ADD CONSTRAINT "floor_slots_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_partner_b_id_partners_id_fk" FOREIGN KEY ("partner_b_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_divisions" ADD CONSTRAINT "session_divisions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_checkins_session_id" ON "checkins" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_checkins_pair_id" ON "checkins" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX "idx_checkins_submitted_by" ON "checkins" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_checkins_unique_active" ON "checkins" USING btree ("session_id","pair_id") WHERE "checkins"."status" IN ('waiting', 'on_deck', 'running');--> statement-breakpoint
CREATE INDEX "idx_event_registrations_event_id" ON "event_registrations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_event_registrations_user_id" ON "event_registrations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_floor_slots_session_slot" ON "floor_slots" USING btree ("session_id","slot_number");--> statement-breakpoint
CREATE INDEX "idx_floor_slots_session_id" ON "floor_slots" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pairs_user_partner" ON "pairs" USING btree ("user_a_id","partner_b_id");--> statement-breakpoint
CREATE INDEX "idx_partners_user_id" ON "partners" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_partners_linked_user_id" ON "partners" USING btree ("linked_user_id");--> statement-breakpoint
CREATE INDEX "idx_partners_email" ON "partners" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_sessions_event_id" ON "sessions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_songs_user_id" ON "songs" USING btree ("user_id");