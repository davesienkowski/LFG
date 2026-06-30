// Drizzle schema (D-05 / D-06 / RESEARCH.md Pattern 2).
//
// Two critical details:
//  - `date("date", { mode: "string" })` makes Drizzle return 'YYYY-MM-DD'
//    strings directly from Postgres, never a JS Date — this is how D-11 / P3
//    (no timezone drift) is enforced at the data layer.
//  - the composite unique constraint uses `.nullsNotDistinct()` so two
//    date-only options (start_time = NULL) on the same date collide as
//    duplicates (Postgres 15+; Pitfall 1). Without it, NULL != NULL would let
//    duplicate date-only options through.
import {
  pgTable,
  uuid,
  text,
  integer,
  time,
  date,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const polls = pgTable("polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  participantUrlId: text("participant_url_id").notNull().unique(),
  adminUrlId: text("admin_url_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const options = pgTable(
  "options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    // mode: "string" => returns 'YYYY-MM-DD', never a JS Date (D-11 / P3).
    date: date("date", { mode: "string" }).notNull(),
    // nullable — date-only options are valid (POLL-04).
    startTime: time("start_time"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    // NULLS NOT DISTINCT: treats two NULL start_times as equal, so duplicate
    // date-only options on the same date are rejected (POLL-03 / Pitfall 1).
    unique("options_dedup").on(t.pollId, t.date, t.startTime).nullsNotDistinct(),
    index("options_poll_id_idx").on(t.pollId),
  ],
);

export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;
