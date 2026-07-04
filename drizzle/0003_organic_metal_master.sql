ALTER TABLE "polls" ADD COLUMN "organizer_id" text;--> statement-breakpoint
CREATE INDEX "polls_organizer_id_idx" ON "polls" USING btree ("organizer_id");