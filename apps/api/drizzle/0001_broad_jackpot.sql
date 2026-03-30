CREATE TYPE "public"."partner_role" AS ENUM('leader', 'follower');--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "partner_role" "partner_role" DEFAULT 'follower' NOT NULL;