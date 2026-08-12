ALTER TABLE "checkins" DROP CONSTRAINT "ck_checkins_entity_xor";--> statement-breakpoint
ALTER TABLE "queue_entries" DROP CONSTRAINT "ck_queue_entries_entity_xor";--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "ck_runs_entity_xor";--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "entity_managed_partnership_id" text;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD COLUMN "entity_managed_partnership_id" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "entity_managed_partnership_id" text;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_entity_managed_partnership_id_managed_partnerships_id_fk" FOREIGN KEY ("entity_managed_partnership_id") REFERENCES "public"."managed_partnerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_entity_managed_partnership_id_managed_partnerships_id_fk" FOREIGN KEY ("entity_managed_partnership_id") REFERENCES "public"."managed_partnerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_entity_managed_partnership_id_managed_partnerships_id_fk" FOREIGN KEY ("entity_managed_partnership_id") REFERENCES "public"."managed_partnerships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_checkins_entity_managed_partnership_id" ON "checkins" USING btree ("entity_managed_partnership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_queue_entries_session_managed_live" ON "queue_entries" USING btree ("session_id","entity_managed_partnership_id") WHERE "queue_entries"."entity_managed_partnership_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_runs_managed_division" ON "runs" USING btree ("entity_managed_partnership_id","division_name");--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "ck_checkins_entity_xor" CHECK (("checkins"."entity_pair_id" IS NOT NULL AND "checkins"."entity_solo_user_id" IS NULL AND "checkins"."entity_managed_partnership_id" IS NULL)
           OR ("checkins"."entity_pair_id" IS NULL AND "checkins"."entity_solo_user_id" IS NOT NULL AND "checkins"."entity_managed_partnership_id" IS NULL)
           OR ("checkins"."entity_pair_id" IS NULL AND "checkins"."entity_solo_user_id" IS NULL AND "checkins"."entity_managed_partnership_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "ck_queue_entries_entity_xor" CHECK (("queue_entries"."entity_pair_id" IS NOT NULL AND "queue_entries"."entity_solo_user_id" IS NULL AND "queue_entries"."entity_managed_partnership_id" IS NULL)
           OR ("queue_entries"."entity_pair_id" IS NULL AND "queue_entries"."entity_solo_user_id" IS NOT NULL AND "queue_entries"."entity_managed_partnership_id" IS NULL)
           OR ("queue_entries"."entity_pair_id" IS NULL AND "queue_entries"."entity_solo_user_id" IS NULL AND "queue_entries"."entity_managed_partnership_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "ck_runs_entity_xor" CHECK (("runs"."entity_pair_id" IS NOT NULL AND "runs"."entity_solo_user_id" IS NULL AND "runs"."entity_managed_partnership_id" IS NULL)
           OR ("runs"."entity_pair_id" IS NULL AND "runs"."entity_solo_user_id" IS NOT NULL AND "runs"."entity_managed_partnership_id" IS NULL)
           OR ("runs"."entity_pair_id" IS NULL AND "runs"."entity_solo_user_id" IS NULL AND "runs"."entity_managed_partnership_id" IS NOT NULL));