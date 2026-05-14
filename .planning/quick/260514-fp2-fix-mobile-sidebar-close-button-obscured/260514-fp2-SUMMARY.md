---
id: 260514-fp2
title: Fix mobile sidebar close button obscured by Regions button (issue #12)
status: complete
date: 2026-05-14
issue: https://github.com/rainhead/beeatlas/issues/12
---

# Summary: Fix mobile sidebar close button obscured by Regions button

## What changed

Two edits in `src/bee-atlas.ts`:

1. **CSS — `@media (max-aspect-ratio: 1)` block** (`src/bee-atlas.ts:144-160`):
   - Added `min-height: 0` to `bee-sidebar` so its min-content height does
     not push `bee-map` down to ~0 height.
   - Added `.content.sidebar-open bee-map { height: 3.5rem; flex-grow: 0;
     flex-shrink: 0; min-height: 0; }` so a fixed sliver of map remains visible
     above the sidebar when the sidebar is open. The Regions button
     (`position: absolute; top: 0.5em` inside `bee-map`) lives in that sliver
     instead of overlapping the sidebar's close button.

2. **render() — `.content` class string** (`src/bee-atlas.ts:170-174`):
   - Added a `sidebar-open` modifier class when `_viewMode === 'map' &&
     _sidebarOpen`. Refactored the inline class expression to a
     `[...].filter(Boolean).join(' ')` form for readability with the new
     modifier.

## Why this fixes #12

The responsive layout (`max-aspect-ratio: 1`) switches `.content` to a flex
column with `bee-map` above `bee-sidebar`. Both had `flex-grow: 1`, but default
`min-height: auto` on flex items let the sidebar's tall min-content squeeze
`bee-map` to near-zero height. The absolutely-positioned Regions button at
`top: 0.5em` inside `bee-map` then rendered directly on top of the sidebar's
`.sidebar-header` (close button).

The fix preserves the "sliver of map" referenced in the issue, restoring the
Regions button's original real estate.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — typecheck + Eleventy + Vite build green; bundle 5.3 KB.
- `npm test -- --run` — 335 passed / 4 skipped. The single failing test file
  (`build-output.test.ts`) is a pre-existing parallel-test isolation issue
  where `validate-species.test.ts:127` rigs the species manifest with a bad
  license mid-flight; running `build-output.test.ts` alone passes. Unrelated
  to this change (reproducible on `main` with full parallel suite).
- Manual visual check (mobile sidebar layout) is left to the user — I cannot
  drive a browser from here. Expected: a small strip of map at the top of
  narrow viewports when the sidebar is open, with the Regions button visible
  in that strip and the sidebar `×` button no longer occluded.

## Out of scope (unchanged)

- `speicmenLayer` typo (intentionally deferred per CLAUDE.md).
- Table-mode layout rules.
- Pre-existing parallel-test isolation issue between `validate-species.test.ts`
  and `build-output.test.ts`.
