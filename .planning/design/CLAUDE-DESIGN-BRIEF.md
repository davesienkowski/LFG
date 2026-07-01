# Claude Design Brief — LFG UI/UX

**Purpose:** A ready-to-paste prompt for Anthropic's Claude Design workspace
(claude.ai/design) to lead the overall UI/UX design of LFG. Claude Design builds a
*persistent design system* (tokens, components, a working HTML UI kit, a reusable
DESIGN.md/SKILL.md) rather than one-off screens, and can read this repo.

**Status:** v2 — hardened via an adversarial pass + the laws-of-software lenses
(hyrum's, gall's, zawinski's, leaky-abstractions, fitts's, choose-boring-technology,
cunningham's). v2 changes vs. the first draft: hard-locked the shipped invariants,
staged the deliverable (prove tokens on the vote screen first), demoted dark mode to
optional, fenced off new fonts/component libraries, added an honest "what won't map"
clause, and inlined the verified tokens as fallback grounding.

**Usage:** paste the block below into a fresh Claude Design project. If Claude Design
offers a GitHub connector, also attach the repo (https://github.com/davesienkowski/LFG)
so it can read `src/` and `.planning/`. When it returns a DESIGN.md / token set, hand
it back to the build agent to wire into Tailwind v4 `@theme` + shadcn variables and
reconcile against the Phase 4 UI-SPEC before execution.

---

## Prompt

```
You are leading UI/UX design for LFG ("Looking For Group"), a live, open-source
web app. Read the repo, but treat the design as an EVOLUTION of a shipped system,
not a greenfield redesign.

REPO (read code AND .planning/ docs):
https://github.com/davesienkowski/LFG

WHAT LFG IS
A free, self-hostable clone of Doodle.com's "Group Poll", scoped to ONE job:
help a group agree on which day(s) to meet (built for a D&D group). An organizer
proposes candidate dates, shares a link (or emails it); each participant marks
every date Available / If-need-be / Not available; a results grid highlights the
best day(s). No participant accounts — access is via unguessable links. Behavioral
reference: Doodle group polls.

⚠️ THIS APP IS ALREADY SHIPPED (live on Vercel; Phases 1–3 built + tested; Phase 4
in progress). So this is a redesign that must MERGE BACK, not replace. Read these
first — they are the current design contract, and the .planning UI-SPECs were
already design-reviewed and approved:
- .planning/PROJECT.md, REQUIREMENTS.md, ROADMAP.md
- .planning/phases/*/**-UI-SPEC.md   (locked tokens + states, phases 1–4)
- src/app/**/page.tsx, src/components/**   (the real screens today)

HARD-LOCKED INVARIANTS — any direction you propose MUST preserve these; if a change
would touch one, call it out explicitly as a breaking change with a migration note:
- The three vote states and their EXACT labels: "Available", "If-need-be",
  "Not available". Never rename them (Doodle parity + shipped tests depend on them).
- Every state/status is conveyed by icon + text, NEVER color alone (WCAG AA).
- The participant link and the admin link must stay visually distinct; the admin
  link keeps a clear "keep private" warning treatment.
- The current type scale and spacing (below) — reuse verbatim unless you justify a
  change as a system-wide migration.

CURRENT FOUNDATION (evolve; do not throw away)
- Next.js 16 App Router (React 19 Server Components + Server Actions), Tailwind CSS
  v4, shadcn/ui "new-york" (base-nova / neutral preset), lucide-react icons.
- Type scale (VERBATIM): Display 30 / Heading 24 / Body 16 / Label 14 / Caption·Badge
  12 px; weights 400 + 600 only. No new sizes/weights without a migration rationale.
- Spacing: 8-point scale (16px = gap-4/p-4, 24px = gap-6/p-6; dense table cells px-3;
  min touch target 44px; email content width ~600px).
- Color: 60/30/10 neutral base with amber reserved for the admin "keep private"
  warning; the shipped vote-state colors — read their exact values from the code /
  UI-SPEC and keep their MEANING; do not invent new ones.

FENCES (this is a deliberately tiny single-purpose app — respect that at the design layer too)
- No new fonts unless you justify it against "$0 / fast / lightweight" — prefer the
  system stack or fonts already in use. No new component library or CSS approach:
  Tailwind v4 + shadcn only.
- Dark mode is OPTIONAL / stretch — do NOT treat it as a requirement or let it double
  the deliverable. Light mode is the product.
- Limit the UI kit to the components these 5 screens actually use (card, button,
  input, label, textarea, the vote cell, badges/chips, the results grid). No
  speculative components.

DELIVER INCREMENTALLY (prove it merges before expanding — do NOT dump everything at once):
  STEP 1 — Summarize the product and the existing design language back to me, then
    propose 2–3 visual directions WITH a recommendation. I believe the vote grid is
    the only screen that truly needs design love and the rest are mostly fine — tell
    me where I'm wrong.
  STEP 2 — After I pick a direction: produce (a) a DESIGN.md + the token set, named
    using shadcn's EXACT CSS-variable convention (--background, --foreground,
    --primary, --muted, --destructive, --border… in OKLCH) inside Tailwind v4 @theme
    blocks, and (b) ONLY the hero screen — the vote screen (/p/[link]) with the
    3-state grid + per-row bulk actions — as a working, mergeable mockup in its key
    states (empty, filled, closed/read-only), mobile + desktop. Then PAUSE.
  STEP 3 — After I confirm the tokens merge cleanly, generate the remaining screens:
    create-poll (/), thanks + edit, results/admin (/a/[link]: participants×dates grid,
    tallies, best-day highlight, filter, plus the new "Invite by email" card and the
    "Book it" finalize control), and the 3 email templates (invite / edit-link /
    finalization) as standalone inline-styled ~600px HTML.

FITTS / INTERACTION REQUIREMENTS
- Vote cells stay ≥44px thumb targets even in a dense grid; the grid is the primary
  action, so make it the biggest, most obvious target.
- "Book it" finalize is destructive and one-way: its confirm action ("Confirm and
  close poll") must be visually + spatially separated from the safe dismiss ("Keep
  poll open") and from routine controls.

HONEST-MAPPING CLAUSE
Your HTML/CSS won't map 1:1 onto Tailwind v4 + shadcn. Explicitly list what WON'T
port cleanly (custom animations, fonts, any component that isn't a shadcn primitive,
dark-mode strategy) so I can plan the reconciliation instead of discovering leaks later.

CONSTRAINTS: $0 to run, no participant login, mobile-first + fully responsive, WCAG
AA, lightweight. Audience is non-technical friends; the D&D origin is welcome as
personality but clarity and speed-to-answer win.
```

---

## Reconciliation checklist (for when Claude Design returns output)

- [ ] Token names match shadcn's CSS-variable convention (OKLCH `--background`,
      `--foreground`, `--primary`, `--muted`, `--destructive`, `--border`, …).
- [ ] Type scale unchanged (30/24/16/14/12; weights 400/600) OR a migration note
      accompanies any change (would ripple across shipped Phases 1–3).
- [ ] Three vote-state labels unchanged; every state still icon + text (not color-only).
- [ ] No new runtime font / component library introduced (or explicitly justified).
- [ ] Vote cells ≥44px; finalize confirm separated from safe/dismiss actions.
- [ ] Anything flagged in the "honest-mapping" list has a reconciliation plan before
      it lands in `src/`.
- [ ] Output does not contradict the approved Phase 4 UI-SPEC
      (`.planning/phases/04-email-finalization/04-UI-SPEC.md`).
