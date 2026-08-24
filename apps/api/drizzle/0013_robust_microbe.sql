ALTER TABLE "events" ADD COLUMN "season_year" text;--> statement-breakpoint
UPDATE "events"
SET "season_year" = CASE
  WHEN CAST(SUBSTRING("start_date" FROM 6 FOR 2) AS INTEGER) >= 10
    THEN CAST(CAST(SUBSTRING("start_date" FROM 1 FOR 4) AS INTEGER) + 1 AS TEXT)
  ELSE SUBSTRING("start_date" FROM 1 FOR 4)
END
WHERE "season_year" IS NULL;