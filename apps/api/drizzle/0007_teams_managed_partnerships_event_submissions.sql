CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"identifier" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_partnerships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"leader_first_name" text NOT NULL,
	"leader_last_name" text NOT NULL,
	"follower_first_name" text NOT NULL,
	"follower_last_name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_song_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"song_id" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "managed_partnerships" ADD CONSTRAINT "managed_partnerships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_song_submissions" ADD CONSTRAINT "event_song_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_song_submissions" ADD CONSTRAINT "event_song_submissions_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_song_submissions" ADD CONSTRAINT "event_song_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "managed_partnership_id" text;
--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_managed_partnership_id_managed_partnerships_id_fk" FOREIGN KEY ("managed_partnership_id") REFERENCES "public"."managed_partnerships"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_teams_user_identifier" ON "teams" USING btree ("user_id","identifier");
--> statement-breakpoint
CREATE INDEX "idx_teams_user_id" ON "teams" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_managed_partnerships_user_id" ON "managed_partnerships" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_event_song_submissions_event_song" ON "event_song_submissions" USING btree ("event_id","song_id");
--> statement-breakpoint
CREATE INDEX "idx_event_song_submissions_event_id" ON "event_song_submissions" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX "idx_event_song_submissions_submitted_by_user_id" ON "event_song_submissions" USING btree ("submitted_by_user_id");
