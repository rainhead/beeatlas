---
phase: 082-hardening
plan: "02"
subsystem: species-page-layout
tags: [css, responsive-layout, perf, cls, carry-in]
dependency_graph:
  requires: []
  provides: [species-page-layout, cls-reservations]
  affects: [species-page, perf-02, perf-03]
tech_stack:
  added: []
  patterns: [css-grid, sticky-nav, aspect-ratio-reservation, content-visibility]
key_files:
  created:
    - src/styles/species.css
  modified:
    - src/entries/species.ts
decisions:
  - "Used Vite entry side-effect import (D-02) rather than global base.njk link to scope CSS to species page only"
  - "Vite bundles species CSS into index-DXE_rPaG.css (shared CSS chunk) — CSS is present in the build output despite no species-named CSS file being emitted separately"
  - "All selectors scoped under bee-species-page to avoid bleeding into SPA (D-01)"
metrics:
  duration: "~10 min"
  completed: "2026-05-04"
  tasks_completed: 2
  files_changed: 2
---

# Phase 82 Plan 02: Species Page Layout CSS Summary

Minimal responsive CSS for `/species/` — carry-in T2 from Phase 081 UAT. Single-column mobile layout with native `<details>` nav plus two-column sticky-rail grid at >=768px, with explicit aspect-ratio reservations on hero photo (4:3) and SVG occurrence map (15:8) to eliminate CLS under lazy-load.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author src/styles/species.css with responsive grid + image aspect rules | 81c9864 | src/styles/species.css (new, 176 lines) |
| 2 | Import species.css from species Vite entry | 68ebd98 | src/entries/species.ts |

## Deviations from Plan

### Observation: Vite CSS bundling behavior

The plan's Task 2 automated verify script expected a `species-named` CSS file in `_site/assets/` (e.g. `species-*.css`). In practice, Vite bundles the CSS from the species entry into a shared `index-DXE_rPaG.css` asset rather than emitting it as a separate file.

The species CSS IS fully present in the build output (confirmed by grep on the output file — all `bee-species-page` selectors present). The acceptance criteria that matter are all satisfied:
- `npm run build` exits 0
- `_site/assets/` contains at least one `.css` file
- No global link in base.njk / default.njk

This is not a deviation from the design intent (D-02) — only from the verify script's specific glob assumption. No fix required; the CSS is correctly included.

## Self-Check

### Created files exist
- src/styles/species.css: FOUND
- src/entries/species.ts (modified): FOUND

### Commits exist
- 81c9864 (Task 1): FOUND
- 68ebd98 (Task 2): FOUND

## Self-Check: PASSED

## Known Stubs

None. The CSS provides full layout rules — no placeholder values or TODO comments in the output CSS.

## Threat Flags

None. CSS-only change with no new network endpoints, auth paths, or file access patterns.
