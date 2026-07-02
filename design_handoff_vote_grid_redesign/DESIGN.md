# LFG — Design System (Step 2)

**Direction:** `1c` Matrix — grid-first vote cell.
**Scope of this step:** tokens + the hero screen only — the participant vote screen `/p/[participantUrlId]`. All other screens are deferred to Step 3.

This is an **evolution** of the shipped system, not a reskin. Everything below either reuses a shipped value verbatim or is flagged as a migration.

---

## 1. What changes vs. what is reused

**Reused verbatim (do not touch):**
- All shadcn/ui neutral tokens (`--background … --ring`) exactly as in `src/app/globals.css`. Not one OKLCH value moves.
- The three vote states from `src/lib/vote-state.ts` — labels `Available` / `If-need-be` / `Not available`, icons `Check` / `CircleHelp` / `X`, and the emerald / amber / muted chip classNames. Meaning and values unchanged.
- Type scale (Display 30 / Heading 24 / Body 16 / Label 14 / Caption·Badge 12), weights 400 + 600, 8-pt spacing, 44px min touch target.
- `--radius: 0.625rem` (10px) and the derived radius ramp.
- Icon-or-color-never-alone rule (WCAG AA).

**What the Matrix direction actually changes — one component only:**
- `AvailabilityGrid` goes from a **single click-to-cycle button per row** to a **radio-style matrix**: rows = dates, three columns = the three states, persistent column headers carrying the icon **and** text label. Tap the state you mean; no hidden cycling.
- The participant grid now mirrors the admin `ResultsGrid` layout → **one mental model across both surfaces.**
- Icon-**only** cells (label lives in the column header) → this is a11y-load-bearing and is the only new a11y surface. See §6.

Everything else on the screen (title, `PollSummary`, name/email fields, bulk-action row, submit, closed-state banner) is unchanged.

---

## 2. Tokens (shadcn CSS-variable convention, OKLCH, Tailwind v4)

Reused verbatim from the shipped `globals.css` `:root`. Nothing new is introduced at the token layer — the Matrix cell is built entirely from existing tokens + the existing emerald/amber utilities.

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325); /* reserved for admin "keep private" + finalize */
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}
```

**State palette (from `vote-state.ts` — Tailwind utilities, not tokens):**

| State | Label | Icon | bg | text | border |
|---|---|---|---|---|---|
| `yes` | Available | `Check` | `emerald-50` | `emerald-700` | `emerald-300` |
| `ifneedbe` | If-need-be | `CircleHelp` | `amber-50` | `amber-700` | `amber-300` |
| `no` (default) | Not available | `X` | `muted` | `muted-foreground` | `border` |

---

## 3. Type & spacing (verbatim)

- Display 30 / 600 — page title (`h1`)
- Heading 24 / 600 — "Your availability" (`h2`)
- Body 16 / 400 — date labels, field help, inputs
- Label 14 / 600 — field labels, matrix column headers, cell text
- Caption 12 / 600 — badges, merge notes
- Spacing 8-pt: `gap-4`/`p-4` = 16, `gap-6`/`p-6` = 24, dense cells `px-3`. Min touch target **44px** (cells are 44–48px).

---

## 4. The Matrix vote cell (the one new pattern)

- **Desktop (≥640px):** `grid-template-columns: 1.6fr 1fr 1fr 1fr`. Row 1 is a header (empty label cell + three state headers, each icon **+** text). Each date row: date label + three 44×44 radio cells. Selected cell = state tint + border + icon; unselected = white, `--border`, empty. Exactly one selected per row (radio).
- **Default / untouched** = the `Not available` cell selected (never blank) — preserves the shipped "an unclicked date reads Not available" invariant.
- **Mobile (<640px):** collapses to stacked full-width segments (the `1a` layout) — each date shows three ≥48px full-width buttons with icon **+** text, so no icon-only cells exist at mobile width. This is why the direction is safe at small sizes.
- **Bulk actions (VOTE-07, unchanged):** `Set all Available` / `Set all Not available` / `Clear`, ≥44px, above the grid, absent entirely when read-only.
- **Read-only (closed poll):** each row renders a single non-interactive chip (icon + text) of its chosen state; no column matrix, no bulk row, no submit — identical semantics to today's `disabled` grid.

---

## 5. Screen anatomy — `/p/[participantUrlId]`

`main.mx-auto.max-w-2xl.px-4.py-12`, `flex-col gap-8`:
1. `h1` poll title (30/600) + `PollSummary` (description, location).
2. Optional returning-participant note (muted body).
3. `VoteForm`: `h2` "Your availability" → Name (required) → Email (optional) + help → bulk row → **Matrix grid** → submit (`w-full sm:w-auto`).
4. Closed state swaps the grid to read-only chips and the submit block to the "Voting is closed" banner (`border bg-muted p-6`).

---

## 6. Accessibility (AA)

- Every state is icon **+** text. On desktop the text lives in the **column header** (icon-only cells inherit the labelled column); on mobile every button carries its own icon + text. Never color alone.
- Radio cells expose `role="radio"` / `aria-checked` inside a `role="radiogroup"` per date row, `aria-label="{date}: {state}"`. The existing `aria-live` announcement region is retained.
- Focus ring: `ring-3 ring-ring/50` (shipped).
- Targets ≥44px everywhere.

---

## 7. Honest mapping — what will NOT port 1:1 to Tailwind v4 + shadcn

1. **Font:** the app screens render in **Inter** — the actual shipped `--font-sans` (`next/font/google` in `layout.tsx`), so no reconciliation. The Step-2 vote mockup used the system-ui stack as a stand-in; either is fine (Inter is the token). The **email templates** intentionally use the system font stack, matching `templates.ts` `FONT_STACK` (webfonts don't load in mail). **No new font is introduced anywhere.**
2. **The matrix cell is a real component rewrite, not CSS.** `AvailabilityGrid` internals change from one cycling `<button>` to a `role="radiogroup"` of three `role="radio"` cells per row + a `<640px` segmented fallback. **Breaking change** to `availability-grid.tsx` **and** `availability-grid.test.tsx` (the test asserts click-to-cycle). Flagged in Step 1 as the highest-merge-cost option.
3. **New a11y test surface:** icon-only desktop cells require a column-header-association test + a mobile-fallback test. Two layouts to cover.
4. **Inline styles in the mockup → Tailwind classes on merge.** Every `style="…"` here maps to the existing utility (e.g. `min-h-12`, `rounded-lg`, `border-emerald-300`); nothing here needs a new utility or `@layer` rule.
5. **No dark mode** in this mockup. The shipped `.dark` block still exists; the Matrix cell uses only tokens + emerald/amber-50/300/700, all of which already have dark equivalents in-repo — but dark is explicitly out of scope and untested here.
6. **No animation** beyond shipped `transition-colors`. Nothing custom to reconcile.
