# Handoff: LFG Vote-Grid Redesign (Matrix / 1c) + Phase-4 screens

## Overview
This package redesigns the **participant vote grid** for LFG ("Looking For Group") and re-draws every supporting screen and email around it. The chosen direction is **1c "Matrix"**: the `AvailabilityGrid` becomes a radio-style grid (rows = dates, three columns = the three vote states) with persistent, icon+text column headers — mirroring the admin `ResultsGrid` so the participant and organizer surfaces share one mental model.

This is an **evolution of the shipped app, not a greenfield redesign.** It targets the existing repo (`davesienkowski/LFG`, branch `master`) and must merge back into it.

## About the design files
The files in `designs/` are **design references authored in HTML** (Design Components — they open in a browser via the sibling `support.js`). They are prototypes of the intended look and behavior — **not production code to paste in.** Your job is to **recreate them in the existing LFG environment**: Next.js 16 App Router (React 19 RSC + Server Actions), **Tailwind CSS v4**, **shadcn/ui "new-york"** (neutral preset), **lucide-react** icons. Reuse the shipped components and tokens; do not introduce a new UI library, CSS approach, or font.

Each option/screen in the HTML carries a small id badge (`1c`, `2a`…`2e`, `3a`…`3h`, and `-m` mobile variants) — those are the reference handles used below.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and states. Recreate pixel-accurately using the repo's existing primitives (`Card`, `Button`, `Input`, `Textarea`, `Label`) and the tokens in `src/app/globals.css`. Everything here reuses shipped values verbatim except the one grid rewrite below.

---

## ⚠️ The one breaking change (everything else is additive or visual)
**`src/components/availability-grid.tsx` — click-to-cycle → radio matrix.**
- Today: one `<button>` per date that cycles `no → yes → ifneedbe → no`.
- New: per date row, a `role="radiogroup"` of three `role="radio"` cells (Available / If-need-be / Not available), exactly one selected. Default/untouched = **Not available** selected (preserve the "an unclicked date reads Not available, never blank" invariant).
- **Desktop (≥640px):** icon-**only** cells; the icon+text label lives in the persistent column header (a11y is satisfied at the column level).
- **Mobile (<640px):** collapse to stacked full-width segments (each ≥48px) that carry their own icon **+** text — so no icon-only cells exist at mobile width.
- This also **breaks `src/components/availability-grid.test.tsx`** (it asserts click-to-cycle). Rewrite it: assert radio semantics + the mobile-fallback + column-header association.
- Do **not** rename the states or their labels (`Available` / `If-need-be` / `Not available`) — Doodle parity + shipped tests depend on them. Keep icon-or-color-never-alone (WCAG AA).

Nothing else requires a structural rewrite. `ResultsGrid`, `InviteByEmailForm`, `BookItControl`, the three email templates, and the `event.ics` route already exist in Phase 4 — the boards here are **pixel targets** against that shipped structure.

---

## Design tokens (verbatim from `src/app/globals.css` — do not change)
OKLCH, shadcn CSS-variable names. Full `@theme` block is in `DESIGN.md`. Key values:

- `--background: oklch(1 0 0)` · `--foreground: oklch(0.145 0 0)`
- `--primary: oklch(0.205 0 0)` · `--primary-foreground: oklch(0.985 0 0)`
- `--muted: oklch(0.97 0 0)` · `--muted-foreground: oklch(0.556 0 0)`
- `--border` / `--input: oklch(0.922 0 0)` · `--ring: oklch(0.708 0 0)`
- `--destructive: oklch(0.577 0.245 27.325)` (reserved for admin "keep private" + finalize)
- `--radius: 0.625rem` (10px)

**Vote-state palette (from `src/lib/vote-state.ts` — Tailwind utilities, unchanged):**
| State | Label | lucide icon | bg | text | border |
|---|---|---|---|---|---|
| `yes` | Available | `Check` | `emerald-50` #ecfdf5 | `emerald-700` #047857 | `emerald-300` #6ee7b7 |
| `ifneedbe` | If-need-be | `CircleHelp` | `amber-50` #fffbeb | `amber-700` #b45309 | `amber-300` #fcd34d |
| `no` (default) | Not available | `X` | `muted` | `muted-foreground` | `border` |

Best-day highlight uses `emerald-100` #d1fae5 / `emerald-800` #065f46 with a literal **"Best"** text badge.

## Type & spacing (verbatim)
Display 30 / Heading 24 / Body 16 / Label 14 / Caption·Badge 12 — weights **400 + 600 only**. Font = **Inter** (`--font-sans`, already loaded via `next/font/google` in `layout.tsx`). 8-pt spacing (`gap-4`=16, `gap-6`=24, dense cells `px-3`). Min touch target **44px** (vote cells 44–48px).

---

## Screens

### Vote screen — `/p/[participantUrlId]` (`designs/Vote Screen.dc.html`)
The hero. Reference ids `2a`–`2e`.
- **2a Desktop / filled** — the Matrix grid (headers + 3 date rows), bulk-action row above (`Set all Available` / `Set all Not available` / `Clear`, ≥44px), name + email fields, `Submit availability`.
- **2b Desktop / empty** — every row pre-selects **Not available**; name placeholder `e.g. Alex`.
- **2c Desktop / closed (read-only)** — one non-interactive chip per row (icon+text of the chosen state); **no matrix, no bulk row, no submit**; "Voting is closed" banner (`border bg-muted p-6`).
- **2d Mobile / filled** & **2e Mobile / closed** — stacked segments; a **fixed-height viewport whose list scrolls with the submit / closed banner pinned to the bottom** (so a long date list never buries the button). This is exposed as two tweaks in the prototype (`mobileScroll`, `mobileViewportH`) purely to demonstrate the pattern — in the app it is just: content scrolls, primary action is `position: sticky` (or a pinned footer) at the bottom of the viewport.

### Create poll — `/` (`designs/App Screens.dc.html`, id `3a` / `3a-m`)
"Create a poll" (Display). Fields: Poll title\* (`PollCreateForm`), Description (Textarea), Location, then "Candidate dates" (`CalendarDatePicker` — month calendar `mode="multiple"`, past days disabled; right pane = Default start time + Apply to all + sorted Selected-dates list with per-row time + remove). `Create poll` button. Mobile stacks the two panes and pins `Create poll`.

### Thanks — `/p/[…]/thanks` (id `3b` / `3b-m`)
"Thanks for responding!" + "Your availability has been saved." Personal-edit-link `Card` with the **amber bearer-credential warning** ("Don't share this link — anyone who has it can change your answer."), mono link, `Copy link`. Footer: "No email was sent — save this link now."

### Edit — `/p/[…]/edit/[editToken]` (id `3c` / `3c-m`)
Identical to the vote screen but heading **"Edit your availability"**, values prefilled, submit **"Save changes"**. Uses the same Matrix grid.

### Results / Admin — `/a/[adminUrlId]` (ids `3d`, `3e`, `3d-m`)
- **3d Open:** title, chronological dates list, **Share your poll** (Participant-link `Card`; Admin-link `Card` with amber **"Keep private"** badge + do-not-share copy; **Invite by email** card = Textarea + `Send invites` + per-recipient chips `Sent`/`Rate limited`/`Failed`, each icon+text). **Results** = `ResultsGrid` (participants×dates, best-day column tinted emerald + "Best" badge + `N yes · N if-need-be` tallies, Date/Status filter + Clear, horizontal scroll-edge fade on narrow widths). **Book it** = `BookItControl`: radio over candidate dates (computed best day pre-checked, "Suggested" badge) + a **two-step confirm** — `Book this date` (`type="button"`, only reveals the amber panel, never submits) → amber panel with `Confirm and close poll` (`type="submit"`, the only control that closes) spatially separated from the ghost `Keep poll open`.
- **3e Finalized (status=closed):** title gains an emerald **"Booked"** pill; a **"Poll finalized"** emerald card ("… is booked. Everyone who voted and gave an email should get a confirmation."). Invite card and Book-it picker are **hidden**; Results stays visible.

### Emails (`designs/Email Templates.dc.html`, ids `3f`–`3h`)
Mirror `src/lib/email/templates.ts` exactly: one shared shell, single outer `<table>`, **600px** max width, inline styles only, **system font stack**, **hex approximations** of the OKLCH tokens (`#171717` FG, `#ffffff` BG, `#737373` muted, `#e5e5e5` border, `#fafafa` card). No images, no `<link>`/webfont, no `<script>`. A plain-text fallback link is **always** present; **admin URLs never appear** in any template.
- **3f Invite** (`renderInviteEmail`) — CTA = participant link, "View the poll & vote".
- **3g Confirmation / edit-link** (`renderConfirmationEmail`) — CTA = edit link, "View or edit my response".
- **3h Finalization** (`renderFinalizationEmail`) — event-details block, **no primary button**, then two **add-to-calendar** buttons and the fallback link.

---

## The calendar feature (finalization email)
Backed by the shipped `GET /p/[participantUrlId]/event.ics` route (`buildIcs`, participant-token-keyed, serves only a **closed** poll, identical bare 404 for unknown/open/undecided). `renderFinalizationEmail` now renders two links above the fallback:
- **Add to Google Calendar** → `googleCalendarUrl` (a `calendar.google.com` render URL)
- **Add to Apple / Outlook Calendar** → `icsUrl` (the hosted `/p/…/event.ics`, never an `/a/` path)

Both are omitted cleanly when the calendar build fails.

**Proposed visual change (small code edit):** the prototype colors the two buttons differently so a reader can tell them apart — **Google `#1a73e8`** vs neutral **`#171717`** for Apple/Outlook. Email clients can't be trusted with SVG/PNG icons (Gmail strips them; the template forbids images), so **color is the only reliable per-provider signal**. Implementing this means `calLink()` in `templates.ts` takes a per-provider `background` argument. If you'd rather stay strictly neutral, make Apple/Outlook an outlined (white) button so they differ by shape instead.

---

## Won't port 1:1 / reconciliation notes
1. **`AvailabilityGrid` rewrite** + its test (the breaking change above) — the only structural change.
2. **New a11y tests** for the grid: icon-only desktop cells need a column-header-association test; the `<640px` segmented fallback needs its own test.
3. **Prototype inline styles → Tailwind utilities** on merge (`min-h-12`, `rounded-lg`, `border-emerald-300`, etc.). Nothing here needs a new utility or `@layer` rule.
4. **Mobile "scroll + pinned action"** is real CSS (`sticky`/pinned footer), not a component — the tweak knobs in the prototype are demo-only.
5. **Calendar-button color** = the one proposed change to `templates.ts` (see above).
6. **No dark mode** in these mocks (out of scope). The `.dark` block stays; the Matrix cell uses only tokens + emerald/amber-50/300/700, all of which already have dark equivalents in-repo — but dark is untested here.
7. **No custom animation** beyond the shipped `transition-colors`.

## Files in this bundle
- `DESIGN.md` — the full token set (`@theme` block) + system spec.
- `designs/Vote Screen.dc.html` — hero vote screen, states 2a–2e.
- `designs/App Screens.dc.html` — create / thanks / edit / admin (open + finalized), desktop + mobile, ids 3a–3e (+ `-m`).
- `designs/Email Templates.dc.html` — invite / confirmation / finalization, ids 3f–3h.
- `designs/Vote Grid Directions.dc.html` — the original three grid directions (1a/1b/1c); **1c was chosen**.
- `designs/support.js` — runtime so the `.dc.html` files render in a browser (design reference only; not for production).

## Screenshots (`screenshots/`)
Full-board overviews of each design file (the live HTML in `designs/` is the source of truth for exact detail):
- `01-vote-screen.png` — vote screen states 2a–2e (desktop + mobile).
- `02-app-screens.png` — create / thanks / edit / admin (open + finalized), desktop + mobile.
- `03-email-templates.png` — invite / confirmation / finalization emails.
- `04-grid-directions-1a-1b-1c.png` — the three original grid directions; 1c was chosen.

## Source files to touch in the LFG repo
- `src/components/availability-grid.tsx` (+ `.test.tsx`) — the rewrite.
- `src/app/globals.css`, `src/lib/vote-state.ts` — tokens/vocabulary (reference only; unchanged).
- `src/components/results-grid.tsx`, `invite-by-email-form.tsx`, `book-it-control.tsx`, `poll-create-form.tsx`, `calendar-date-picker.tsx` — pixel targets (already implemented; adjust visuals only if they drift from these mocks).
- `src/lib/email/templates.ts` — optional calendar-button color change.
