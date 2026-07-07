ALTER TABLE "participants" ADD COLUMN "is_organizer" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "deadline" timestamp with time zone;