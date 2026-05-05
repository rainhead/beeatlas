---
phase: 082-hardening
plan: "06"
subsystem: testing
tags: [accessibility, aria, vitest, lit, web-components, a11y]

# Dependency graph
requires:
  - phase: 081-filter-ux-nav
    provides: "bee-taxon-nav light-DOM component + SSR taxon tree (taxon-tree.njk)"
provides:
  - "role=tree / role=treeitem / role=group ARIA attributes on SSR taxon tree"
  - "aria-expanded synced from <details> open state onto li[data-taxon] via capture toggle listener"
  - "Native Enter/Space keyboard disclosure preserved (summary click skips preventDefault)"
  - "Hand-rolled vitest a11y test suite (PERF-05 / D-11 coverage)"
affects:
  - species page UAT
  - any future plan modifying bee-taxon-nav.ts or taxon-tree.njk

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capture-mode toggle listener for non-bubbling <details> events"
    - "aria-expanded mirrored from <details>.open onto enclosing li[data-taxon]"
    - "Hand-rolled a11y gate: tabindex=-1 source-file grep before mounting"

key-files:
  created:
    - src/species/tests/a11y.test.ts
  modified:
    - _includes/taxon-tree.njk
    - src/species/bee-taxon-nav.ts

key-decisions:
  - "No jest-axe or vitest-axe dependency (D-11 / CONTEXT D-04 minimal-deps stance)"
  - "toggle listener uses capture=true because <details> toggle does not bubble per spec"
  - "Summary clicks skip preventDefault so native Enter/Space keyboard disclosure fires"
  - "Filter focusability tested with lightweight hand-rolled fixture, not full component mount"

patterns-established:
  - "Capture-mode event delegation pattern for non-bubbling DOM events in Lit light-DOM components"

requirements-completed: [PERF-05]

# Metrics
duration: 15min
completed: 2026-05-04
---

# Phase 082 Plan 06: PERF-05 D-11 Hand-Rolled A11y Summary

**ARIA tree pattern (role=tree/treeitem/aria-expanded) added to SSR taxon tree with JS sync via capture toggle listener, native keyboard disclosure preserved, and vitest a11y test suite covering nav roles, img alt, and filter focusability**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-04T23:43:00Z
- **Completed:** 2026-05-04T23:48:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- SSR taxon tree now emits `role="tree"` on outer ul, `role="treeitem"` on every li[data-taxon], `role="group"` on inner ul children inside details, and `aria-expanded="false"` (default) on all non-species li elements; species leaves get `role="treeitem"` without `aria-expanded`
- `bee-taxon-nav` now adds a capture-mode `toggle` event listener that mirrors `<details>.open` onto the enclosing `li[data-taxon]` `aria-expanded` attribute; initial SSR sync runs in `connectedCallback`
- Fixed pre-existing bug: summary clicks previously called `e.preventDefault()` which blocked the native browser disclosure toggle (Enter/Space on `<summary>`) — now summary clicks skip `preventDefault` while still dispatching `taxon-selected`
- Hand-rolled vitest a11y test suite (9 tests) covers: nav tree roles + aria-expanded, species leaf shape, toggle sync, photo/map img alt + loading=lazy, filter source-file tabindex gate, and per-select programmatic focus

## Task Commits

Each task was committed atomically:

1. **Task 1: Add role + aria-expanded to SSR taxon tree** - `5579d71` (feat)
2. **Task 2: Sync aria-expanded on details toggle and fix preventDefault for summary clicks** - `f793c81` (feat)
3. **Task 3: Add hand-rolled vitest a11y test** - `6c3152f` (test)

## Files Created/Modified

- `_includes/taxon-tree.njk` - Added role=tree/treeitem/group and aria-expanded="false" to all rank macros; species leaves get role=treeitem without aria-expanded
- `src/species/bee-taxon-nav.ts` - Added _onToggle (capture listener), _syncAllAria (initial sync), inSummary gate for preventDefault; header comment updated for D-11
- `src/species/tests/a11y.test.ts` - New: 9 hand-rolled a11y assertions (PERF-05 / D-11 coverage)

## Decisions Made

- Used `addEventListener('toggle', handler, true)` (capture=true) rather than adding listeners to each `<details>` individually — more resilient to dynamically added tree nodes, matches the existing click delegation pattern
- Filter focusability test uses a hand-rolled `<select>` fixture rather than mounting the full `<bee-species-filter>` component — avoids dragging in the filter store while still validating what D-11 cares about
- The `tabindex="-1"` source-file gate strips JS line comments before matching to avoid self-invalidating: a comment saying "// no tabindex=-1 per D-11" won't trip the gate

## Deviations from Plan

None — plan executed exactly as written, with one note:

The pre-existing `e.preventDefault()` on summary clicks was flagged in the plan as a "bug surface" to investigate. Confirming: the bug was real — the existing `_onClick` handler called `preventDefault()` on ALL clicks inside `li[data-taxon]`, including `<summary>` clicks, which blocked the native keyboard disclosure. Fixed in Task 2 as specified (Rule 1 - Bug auto-fix, discovered and specified by the planner).

## Issues Encountered

Two pre-existing test files fail in this worktree environment due to missing `public/data/` files (`build-output.test.ts`, `data-species.test.ts`) — these require local parquet + species.json pipeline output that the worktree doesn't have. These failures pre-date this plan and are not introduced by any change here. All other 314 tests pass.

## Known Stubs

None — no stub patterns introduced.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Next Phase Readiness

- PERF-05 requirement satisfied: hand-rolled aria + keyboard a11y for species page nav tree
- D-11 coverage complete: nav tree roles, aria-expanded sync, native keyboard disclosure, img alt, filter focusability
- Test suite at `src/species/tests/a11y.test.ts` runs in CI via `npm test`

---
*Phase: 082-hardening*
*Completed: 2026-05-04*
