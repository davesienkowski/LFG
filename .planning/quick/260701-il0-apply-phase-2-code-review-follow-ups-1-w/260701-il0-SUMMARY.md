---
task: 260701-il0
title: Apply Phase 2 code-review follow-ups (findings #1 & #2) + remove stale checkpoint
status: complete
type: quick
requirements: [REVIEW-1, REVIEW-2]
key-files:
  created:
    - src/instrumentation.ts
  modified:
    - src/components/availability-grid.tsx
  deleted:
    - .planning/phases/02-participant-voting/.continue-here.md
commits:
  - 6591c57: fix(quick) activate env validation via instrumentation register hook
  - 1570165: fix(quick) pure setState updater in AvailabilityGrid + remove stale checkpoint
completed: 2026-07-01
---

# Quick Task 260701-il0: Phase 2 Code-Review Follow-ups Summary

Wired the previously-dead `@/lib/env` validation guard into an always-executed Next.js `register()` hook and made `AvailabilityGrid.cycleCell`'s `setState` updater pure, then removed one stale Phase 2 checkpoint file.

## What Was Done

### Task 1 — Activate env validation (REVIEW finding #1)
- Created `src/instrumentation.ts` (correctly under `src/`, not repo root) exporting an async `register()`.
- Guarded with `if (process.env.NEXT_RUNTIME === "nodejs")` and used a dynamic `await import("@/lib/env")` so validation runs once at Node server startup only (edge runtime skips it).
- `src/lib/env.ts` was dead code (`grep -rln "lib/env" src/` = 0 hits before this change); it is now activated. `next.config.ts` left untouched (Next 16 ships instrumentation as stable — no `experimental.instrumentationHook` needed).
- Intended new failure mode: `next build`/`dev`/`start` now hard-fail on a missing or empty `DATABASE_URL`/`NEXT_PUBLIC_BASE_URL`. `.env.local` supplies both non-empty, so the build passes here — this is the point of finding #1.

### Task 2 — Pure cycleCell updater + stale checkpoint removal (REVIEW finding #2)
- Rewrote `cycleCell` in `src/components/availability-grid.tsx`: `current`/`next` are now computed from the render-time `cellState` snapshot, `setCellState((prev) => ({ ...prev, [opt.id]: next }))` keeps the `prev` merge (concurrent updates to other keys preserved), and `setAnnouncement(...)` is called OUTSIDE the updater — mirroring how `setAll` already works.
- The `?? "no"` fallback and single-cell override semantics are preserved. Click-to-cycle order (no → yes → ifneedbe → no) and the announcement string are unchanged; only the updater's purity changed, removing the Strict/concurrent-render double-invoke risk on the `aria-live` region.
- Deleted `.planning/phases/02-participant-voting/.continue-here.md` via `git rm` — a leftover checkpoint with no consumers (Phase 2 complete, both plans have SUMMARYs, project already on Phase 3).

## Verification

Full whole-plan gate run clean:
- `npx tsc --noEmit` — no errors
- `npm run lint` — no issues
- `npm run build` — succeeds (activated env guard passes; both required vars present in `.env.local`)
- `DATABASE_URL=... npm test` — 81/81 passing (baseline held); the 6 `availability-grid.test.tsx` cases stay green, locking the prev-merge / single-cell-override behavior

## Deviations from Plan

None — plan executed exactly as written.

**Note (not a deviation):** The first `npm test` run showed a single failure in `src/lib/actions/create-poll.test.ts:119` (`pollCount()` expected 17, got 4). This is a pre-existing test-isolation race in the shared docker DB (parallel `create-poll` test files mutating rows between the `before` capture and the assertion) — unrelated to this task's UI/instrumentation changes. An immediate re-run returned 81/81 green, confirming the flake. No code touched by this task affects `create-poll` DB counts.

## Self-Check: PASSED

- FOUND: `src/instrumentation.ts`
- FOUND: `src/components/availability-grid.tsx` (pure updater)
- CONFIRMED GONE: `.planning/phases/02-participant-voting/.continue-here.md`
- FOUND commit: 6591c57
- FOUND commit: 1570165
