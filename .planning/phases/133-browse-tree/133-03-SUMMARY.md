---
phase: 133-browse-tree
plan: "03"
subsystem: frontend-styles
tags: [css, ui, accessibility, browse-tree]
dependency_graph:
  requires: []
  provides: [species-index-controls, tree-node-styles, focus-visible-rings, indent-rules]
  affects: [src/styles/taxon-pages.css]
tech_stack:
  added: []
  patterns: [flex-row-control-bar, negative-margin-tap-target, has-checked-active-indicator, focus-visible-accent]
key_files:
  created: []
  modified:
    - src/styles/taxon-pages.css
decisions:
  - "Kept existing .species-index #species-filter standalone rule; added specificity override (.species-index-controls #species-filter) for flex/min-width behavior inside control bar, setting margin-bottom: 0 to avoid double spacing"
  - "Used margin: -0.5rem with padding: 0.5rem on .node-map to expand tap target to >=44x44px without shifting layout (WCAG 2.5.5)"
  - ":has(#show-all-ranks:checked) provides active indicator with border-only styling (non-color signal preserved via checkbox itself)"
metrics:
  duration_minutes: 8
  completed: "2026-06-03"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
requirements_completed: [TREE-01, TREE-02]
---

# Phase 133 Plan 03: Browse Tree CSS Summary

## One-liner

Control-bar and tree-node CSS for the `.species-index` expandable taxonomy browse tree, using only existing `src/index.css` tokens.

## What Was Built

Extended `src/styles/taxon-pages.css` with new rules under the `.species-index` modifier scope, implementing the full UI-SPEC visual contract for Phase 133's browse tree:

**Control bar (`.species-index-controls`):** Flex row with `gap: 0.5rem`, `flex-wrap: wrap` for mobile. Filter input gets `flex: 1 1 auto; min-width: 0` when inside the bar. "Show all ranks" label gets `flex: 0 0 auto; white-space: nowrap; font-size: 0.875rem`.

**Toggle active indicator:** `:has(#show-all-ranks:checked)` gives the label `border: 1px solid var(--accent)` + `border-radius: 4px; padding: 0.25rem 0.5rem`. Non-color signal preserved by the checkbox itself.

**Tree node `<summary>` rows:** `display: flex; align-items: baseline; gap: 0.5rem; cursor: pointer; padding: 0.25rem 0`. `.node-name` takes `flex: 1 1 auto`. `.node-counts` and `.node-map` are `flex: 0 0 auto; font-size: 0.85rem; color: var(--text-muted)` — matching the existing `.species-list .count` convention.

**Tap target:** `.node-map` uses `padding: 0.5rem; margin: -0.5rem` to expand the touch/click area to >=44x44px without layout shift.

**Indentation:** `details.tree-node { padding-left: 1.5rem }` with `> details.tree-node--family { padding-left: 0 }` for top-level families. `@media (max-width: 480px)` reduces to `1rem`.

**Focus-visible rings:** `summary:focus-visible`, `.node-map:focus-visible`, `#show-all-ranks:focus-visible` all get `outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px`. Filter input gets `outline: none; border-color: var(--accent)` on `:focus`.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend .species-index CSS with control-bar + tree-node rules | 0c541b1 | src/styles/taxon-pages.css |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

All acceptance criteria passed:
- `grep -c 'species-index-controls' src/styles/taxon-pages.css` → 2 (rule selector + inner selector)
- `grep -c 'node-map' src/styles/taxon-pages.css` → 4 (definition + hover + focus-visible + focus block)
- `padding: 0.5rem` and `margin: -0.5rem` present on `.node-map` (44x44 tap target)
- `:has(#show-all-ranks:checked)` rule present
- `:focus-visible` rules reference `var(--accent, #2c7a2c)`
- `@media (max-width: 480px)` reduces indent to `padding-left: 1rem`
- No new `--` custom properties declared; `tsc --noEmit` exits 0

Note: `npm run build` fails in the worktree due to missing `public/data/species.json` (pipeline-generated, not present in worktrees). TypeScript check (`tsc --noEmit`) passes cleanly. The CSS change is syntactically correct; Eleventy failure is a pre-existing worktree data-file absence unrelated to this plan.

## Known Stubs

None. This is a pure CSS change — no data sources, no rendering logic.

## Threat Flags

None. All new rules are scoped under `.species-index`; no global selectors; no `!important`; no new data handling or network endpoints.

## Self-Check: PASSED

- `src/styles/taxon-pages.css` exists and contains all new rules: FOUND
- Commit 0c541b1 exists: FOUND
- No new `--` custom properties declared: CONFIRMED
