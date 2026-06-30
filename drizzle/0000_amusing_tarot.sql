CREATE TABLE "options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "options_dedup" UNIQUE NULLS NOT DISTINCT("poll_id","date","start_time")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_url_id" text NOT NULL,
	"admin_url_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "polls_participant_url_id_unique" UNIQUE("participant_url_id"),
	CONSTRAINT "polls_admin_url_id_unique" UNIQUE("admin_url_id")
);
--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "options_poll_id_idx" ON "options" USING btree ("poll_id");