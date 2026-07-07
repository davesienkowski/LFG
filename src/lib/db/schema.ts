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
import { sql } from "drizzle-orm";
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
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const polls = pgTable(
  "polls",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  participantUrlId: text("participant_url_id").notNull().unique(),
  adminUrlId: text("admin_url_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  status: text("status").notNull().default("open"),
  // Additive, NULLABLE finalize FK (04-02 / FNL-01 / D-04). A poll has no winner
  // until the organizer "Book it"s — NULL is the legitimate "open, undecided"
  // state, not accidental debt. References the chosen date option; ON DELETE SET
  // NULL so deleting the winning option (never wired in v1) degrades cleanly
  // rather than cascade-deleting the poll. The `() => options.id` forward-thunk
  // is required because `options` is declared AFTER `polls` (same pattern Drizzle
  // uses for options.pollId -> () => polls.id). Reuses the existing `status`
  // text column for the open->closed transition — no new status vocabulary.
  // The `(): AnyPgColumn` return annotation is REQUIRED (not stylistic): because
  // `options` also references `polls` (options.pollId), the two tables form a
  // mutual/circular type reference. Without an explicit annotation TypeScript
  // reports "'polls' implicitly has type 'any' ... referenced directly or
  // indirectly in its own initializer" and the build fails. AnyPgColumn breaks
  // the inference cycle — the Drizzle-documented fix for circular FKs.
  winningOptionId: uuid("winning_option_id").references(
    (): AnyPgColumn => options.id,
    { onDelete: "set null" },
  ),
  // Organizer identity (LD-1). NULLABLE text — a browser's polls group under one
  // unguessable `lfg_organizer` cookie token so the calendar feed can list every
  // finalized poll for that organizer. NOT unique: many polls deliberately share
  // one organizer token (that shared grouping IS the feed). Legacy polls created
  // before this column simply have NULL and never appear in any feed.
  organizerId: text("organizer_id"),
  // Persisted creator email (quick task t7e). NULLABLE text — stored when the
  // creator opts in at creation so both participant actions can notify them on
  // EACH response (first submit + every edit) with the participant's name and
  // the /a/ admin results link. Legacy polls (created before this column, or
  // created without an email) have NULL and are NEVER notified (D-02). Read
  // ONLY server-side via getPollAdminNotifyTargets — never selected by any
  // participant-facing query.
  creatorEmail: text("creator_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  },
  (t) => [index("polls_organizer_id_idx").on(t.organizerId)],
);

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

// Phase 2 (D2-01 / D2-02). Added additively — polls/options above are untouched.
//
//  - `email` is nullable: collected for Phase 4 (organizer confirmation), not
//    sent this phase. `edit_token` is a THIRD independent nanoid(21) token
//    (D2-11), never derived from participantUrlId/adminUrlId (extends P1).
//  - `votes.state` is stored as text constrained to 'yes'|'ifneedbe'|'no' by Zod
//    at the action boundary (D2-03) — matches the polls.status text precedent,
//    NOT a Postgres enum, so there is no enum-alter migration friction.
//  - `poll_id` is denormalized onto votes (D2-02) so Phase 3 can aggregate by
//    poll through votes_poll_id_idx with a single index.
//  - the votes_participant_option_unique constraint enforces exactly one vote per
//    (participant, option); 02-02's updateResponse upsert targets it exactly
//    (RESEARCH Pitfall 1).
export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  pollId: uuid("poll_id")
    .notNull()
    .references(() => polls.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  editToken: text("edit_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => options.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
  },
  (t) => [
    unique("votes_participant_option_unique").on(t.participantId, t.optionId),
    index("votes_poll_id_idx").on(t.pollId),
    index("votes_participant_id_idx").on(t.participantId),
  ],
);

// Phase 7 (RESP-03). Added additively — polls/options/participants/votes above
// are untouched (v1.0 prod-safe pattern). Persists WHO was actually emailed a
// participant link so respondent tracking (RESP-01) and nudging (RESP-02) have a
// source of truth. A row is written by sendInvites ONLY on a successful send
// (invited = they actually got a link); rate_limited/failed sends record nothing.
//
//  - `pollId` cascades on poll delete (matches the options/participants FK idiom).
//  - `email` stores the address AS ENTERED (original casing from the first
//    successful send) — the invited list is displayed to the organizer as typed.
//  - `invitedAt` mirrors the existing `createdAt` timestamptz-default-now columns.
//  - the functional unique index over (poll_id, lower(email)) enforces
//    case-insensitive per-poll uniqueness so a re-invite (any casing) is a no-op
//    via a target-less onConflictDoNothing() on insert. The composite leads with
//    poll_id, so the admin-only tracking read's `where poll_id = $1` lookups use
//    it — no separate plain poll_id index is needed (would be redundant).
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_poll_lower_email_unique").on(
      t.pollId,
      sql`lower(${t.email})`,
    ),
  ],
);

export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
