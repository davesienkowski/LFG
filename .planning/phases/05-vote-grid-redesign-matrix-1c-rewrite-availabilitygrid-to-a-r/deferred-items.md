# Deferred Items — Phase 05

Out-of-scope discoveries logged during execution (NOT fixed — see SCOPE BOUNDARY).

## 05-01

- **Pre-existing ESLint errors in `design_handoff_vote_grid_redesign/designs/support.js`**
  (2 errors, 8 warnings: `no-unused-vars`, `no-unused-expressions`,
  `no-assign-module-variable`, `react/no-deprecated`, `react-hooks/exhaustive-deps`).
  This is a design-handoff artifact, not application code, and is unrelated to the
  AvailabilityGrid rewrite. It surfaces in `npm run lint` because ESLint globs the
  design_handoff directory. Consider adding the handoff directory to `.eslintignore`
  (or `eslint.config` ignores) in a separate housekeeping task. Both files changed by
  05-01 (`availability-grid.tsx`, `availability-grid.test.tsx`) are lint-clean.
