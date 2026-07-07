// Pure lazy-close rule for voting (DEAD-01).
//
// No DB, no I/O, never writes status — the SINGLE place the "is voting open?"
// rule lives, evaluated fresh on each server-side poll access. There is
// deliberately no cron and no read-triggered write: a poll whose deadline has
// passed reads as voting-closed via this comparison alone (avoids serverless
// read/write races). "Booked" stays keyed on a real finalize (status ===
// "closed") — a mere deadline-passed poll is voting-closed but NOT booked, so a
// closed poll is always closed regardless of its deadline.
//
// The `poll` param is typed STRUCTURALLY (not the full Poll row) so it accepts
// both the admin poll row and the participant-safe row that plan 02 wires in.
// `poll.deadline` is the JS Date Drizzle returns for a timestamptz; `Date >
// Date` compares instants correctly regardless of process timezone.
export function isVotingOpen(
  poll: { status: string; deadline: Date | null },
  now: Date,
): boolean {
  return poll.status === "open" && (poll.deadline == null || poll.deadline > now);
}
