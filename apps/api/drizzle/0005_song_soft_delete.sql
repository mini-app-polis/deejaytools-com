-- Add soft-delete support to songs
ALTER TABLE "songs" ADD COLUMN "deleted_at" bigint;
