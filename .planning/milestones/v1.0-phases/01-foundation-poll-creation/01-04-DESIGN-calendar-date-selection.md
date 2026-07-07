# Design — Calendar Date Selection (Phase 1 Revision)

**Status:** Approved (design) — ready for GSD planning
**Created:** 2026-06-30
**Type:** Revision to a shipped phase (Phase 1: Foundation & Poll Creation) + one Phase 2 spec input
**Origin:** User request to let the organizer pick many candidate dates from a calendar (e.g. "all of July through August"), set a time per date or one time for all; participants then vote per-date or several at a time. Reference UX: Doodle "Group Poll / Add your times" (screenshots reviewed in the brainstorming session).

---

## 1. Problem

Phase 1 ships a creation form where candidate dates are entered as a list of repeating rows ("Add date", one `<input type=date>` + optional time per row). For a D&D organizer proposing many candidate days across a month or two, adding them one row at a time is tedious. The organizer wants a **month calendar** to click days, a **side list** of the selected dates each with an optional start time, and a way to **apply one start time to all** of them at once.

## 2. Confirmed Scope

**In (this revision):**
- Month calendar multi-select on the creation form (`/`), replacing the repeating date-row UI.
- A "Selected dates" side list, auto-sorted chronologically, each entry with an **optional start time** and a remove control.
- A **"Default start time → Apply to all"** control (the "set all to the same time" ask). Per-date times still override individually.
- Past days disabled in the calendar.
- Participant **per-row quick actions** (`Set all Yes` / `Set all No` / `Clear`) — **captured as a Phase 2 input only; not built in this revision.**

**Out (explicitly, this round):**
- Week view drag-to-paint time blocks (Doodle Image 2). Deferred; Month view covers the need.
- Duration / end-time (no `8h` → `12:00 PM – 8:00 PM` ranges). Time model stays **start-time-only**.
- Timezone selector. Times are wall-clock as entered, shown identically to everyone (preserves PLAT-04; same-timezone group per existing REQUIREMENTS out-of-scope list).
- "Connect your calendar" (calendar OAuth), "Vote on behalf" (v2 ORG-01), "Custom duration (Pro)".

## 3. Key Decision: No Data-Model Change

The current `options` table stores one row per `(date, optional start_time, position)` with a `NULLS NOT DISTINCT` dedup constraint. A calendar multi-select simply **produces more of those same rows**. Because the user chose **start-time-only (no duration)** and **no timezone**, there is:

- **No schema change** to `polls` or `options`.
- **No change** to the `createPoll` server action or its Zod validation.
- **No change** to the serialized submit payload: the form still posts a hidden `dates` input containing `[{ date: "YYYY-MM-DD", startTime: "HH:MM" | null }, ...]`.

This revision is **almost entirely a client-component UI swap** inside the creation form. The existing min-1-date validation, duplicate collapse (app-layer + DB constraint), and chronological/position ordering all keep working unchanged.

## 4. Creation Form Design (`/`)

Title / description / location fields are unchanged. The **"Candidate dates"** section is replaced by a two-pane picker (stacks vertically on mobile):

```
┌─ Candidate dates ─────────────────────────────────────────┐
│  ‹  October 2026  ›        │  Default start time            │
│  Su Mo Tu We Th Fr Sa      │  [ 12:00 PM ]  [Apply to all]  │
│         1  2  3 [4]        │  ────────────────────────────  │
│   5  6  7  8  9 10[11]     │  Selected dates (3)            │
│  12 13 14 15 16 17 18      │  Sat, Oct 4   [12:00 PM]   ×   │
│  19 20 21 22 23 24 25      │  Sun, Oct 5   [12:00 PM]   ×   │
│  26 ...                    │  Sat, Oct 11  [12:00 PM]   ×   │
│  (past days disabled)      │                                │
└───────────────────────────────────────────────────────────┘
```

**Behavior:**
- Click a calendar day → toggles it into the **Selected dates** list (kept sorted chronologically). Click again, or the row's ×, → removes it. The calendar shows currently-selected days as selected.
- Month navigation (‹ ›). Past days are disabled (cannot be selected).
- Each selected date has an **optional start time** input. Blank = all-day / date-only (valid).
- **Default start time + "Apply to all"**: writes the chosen time into every selected date's time field at once. Individual per-date edits afterward still win. An "all day / clear times" affordance sets them all back to blank.
- Empty state copy: *"Pick days on the calendar to add candidate dates."*
- Submit serializes the list to the existing hidden `dates` input. Untouched form → `[]` → existing "Add at least one candidate date" error.

**Component choice:** shadcn/ui `calendar` (wraps `react-day-picker`, `mode="multiple"`), `date-fns` for month label formatting only. These are new dependencies (calendar + react-day-picker + date-fns) added via `npx shadcn@latest add calendar`.

## 5. The Timezone Landmine (must-fix, gets a prohibition test)

`react-day-picker` yields JavaScript `Date` objects. Converting a selected day with the obvious `date.toISOString().slice(0, 10)` formats in **UTC** and silently shifts to the **previous calendar day** for any user whose local offset crosses midnight relative to UTC — the exact bug **PLAT-04 / P3** exists to prevent.

**Rule:** the picker→string boundary MUST build `YYYY-MM-DD` from **local** `getFullYear()` / `getMonth()+1` / `getDate()`, never `toISOString()` / `toJSON()` / UTC getters. Conversely, when seeding the calendar's selected `Date`s from stored `YYYY-MM-DD` strings (if ever needed), construct via local `new Date(y, m-1, d)`, never `new Date("YYYY-MM-DD")` (which parses as UTC).

This is the **third surface** of the same timezone bug: Phase 1 fixed storage (`date` mode:string) and display (`Date.UTC` formatting); this revision fixes **input** (clicked `Date` → string). A dedicated test must assert a clicked day produces the same `YYYY-MM-DD` under at least two extreme timezones (reuse the Phase 1 `TZ=Pacific/Kiritimati` UTC+14 / `TZ=Etc/GMT+12` UTC−12 harness).

## 6. Participant Side (Phase 2 input — recorded, not built)

When Phase 2 (Participant Voting) is specced, the voting UI must support, in addition to per-cell click-to-cycle (1 click = Yes, 2 clicks = If-need-be, empty = No):

- **Per-row quick actions**: `Set all Yes`, `Set all No`, `Clear` applied to the participant's whole row, then individual cells adjustable. This satisfies the user's "set availability for each of them or multiple at a time" requirement.

No implementation in this revision. Listed here so the Phase 2 spec picks it up (new requirement **VOTE-07**, below).

## 7. Requirements Delta (apply via GSD in the implementation session)

Add to `.planning/REQUIREMENTS.md`:

- **POLL-05** (Phase 1): "Organizer selects candidate dates from a month calendar (multi-select), with a side list to set an optional start time per date and apply one start time to all selected dates at once." → Phase 1, status Pending until the revision ships.
- **VOTE-07** (Phase 2): "A participant can set availability for multiple dates at once via per-row quick actions (set all available / set all unavailable / clear), in addition to per-date selection." → Phase 2, status Pending.

Update the traceability table and per-phase counts accordingly (Phase 1 → 12 reqs incl. POLL-05; Phase 2 → 6 reqs incl. VOTE-07). POLL-03/POLL-04 remain valid and are satisfied by the new picker.

## 8. GSD Routing Plan (for the implementation session)

Treat as a **Phase 1 revision**, not a new phase:

1. Amend `REQUIREMENTS.md` with POLL-05 and VOTE-07 (section 7).
2. Author a focused **UI-SPEC delta** for the calendar picker (new surface within Surface 1). Run the **edge-probe family at the boundary**: prohibition-probe **and** the full deterministic engine — the chronological ordering of many selected dates and the `Date`→`YYYY-MM-DD` conversion are genuinely new data shapes, which the project's edge-probe policy says warrant the full engine (not prohibition-only). Re-confirm the existing P3 prohibition extends to the input layer (section 5).
3. Create plan **`01-04-PLAN.md`** (single plan, UI-focused, no schema/action change). Tasks roughly: (a) `shadcn add calendar` + deps; (b) build the calendar multi-select + selected-dates list + apply-to-all client component, replacing the repeating-row UI in `poll-create-form.tsx`/`date-row.tsx`; (c) the local-date conversion helper + its dual-TZ prohibition test; (d) wire to the unchanged hidden `dates` input and verify the `createPoll` action + existing tests still pass.
4. Execute, verify (existing Phase 1 tests must stay green; add the new input-layer TZ test), redeploy to Vercel.

## 9. Acceptance Criteria (this revision)

- [ ] Creation form shows a month calendar; clicking days adds/removes them from a chronologically-sorted Selected-dates list.
- [ ] Each selected date accepts an optional start time; "Apply to all" sets every date's time at once; per-date overrides persist.
- [ ] Past days cannot be selected.
- [ ] Submitting produces the same `[{date, startTime}]` payload; `createPoll`, its validation, dedupe, and ordering are unchanged and all existing Phase 1 tests still pass.
- [ ] A clicked calendar day yields the correct `YYYY-MM-DD` with no off-by-one under UTC+14 and UTC−12 (new prohibition test).
- [ ] No schema migration; no change to `polls`/`options`; production redeploy succeeds.

## 10. Out-of-Scope Confirmations (anti-scope-creep)

Week drag-paint, duration/end-time, timezone selection/conversion, calendar OAuth, vote-on-behalf, and the participant bulk-voting *implementation* are all explicitly excluded from this revision. The participant bulk-voting is captured for Phase 2 only.

---
*Design approved 2026-06-30. Next step: GSD planning per section 8, in a fresh session (handover provided).*
