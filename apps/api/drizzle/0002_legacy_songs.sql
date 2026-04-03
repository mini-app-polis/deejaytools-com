CREATE TABLE "legacy_songs" (
	"id" text PRIMARY KEY NOT NULL,
	"partnership" text NOT NULL,
	"division" text,
	"routine_name" text,
	"descriptor" text,
	"version" text,
	"submitted_at" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_legacy_songs_division" ON "legacy_songs" ("division");
