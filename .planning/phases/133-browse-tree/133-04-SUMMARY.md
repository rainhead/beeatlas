---
phase: 133-browse-tree
plan: "04"
subsystem: frontend-entry
tags: [typescript, dom, localstorage, filter, accessibility, browse-tree]
dependency_graph:
  requires: [species-index-controls, tree-node-styles]
  provides: [rank-toggle, localstorage-persistence, tree-filter, ancestor-auto-expand]
  affects:
    - src/entries/species-index.ts
    - src/tests/species-index.test.ts
tech_stack:
  added: []
  patterns: [strict-string-coercion, try-catch-localstorage, textContent-xss-guard, open-ancestors-walk]
key_files:
  created: []
  modified:
    - src/entries/species-index.ts
    - src/tests/species-index.test.ts
decisions:
  - "localStorage read uses strict `=== '1'` coercion (no eval/JSON.parse); access wrapped in try/catch so disabled/quota-exceeded store degrades to default-OFF (T-133-08, T-133-09)"
  - "Filter respects the rank toggle — hidden intermediate ranks are not pierced (D-09 lean)"
  - "Empty-state query echoed via `#filter-query.textContent`, never innerHTML (T-133-07 XSS guard)"
  - "Auto-expand sets `.open = true` on each ancestor <details> so filter matches are visible without manual expansion (TREE-03)"
metrics:
  duration_minutes: 3
  completed: "2026-06-03"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
requirements_completed: [TREE-01, TREE-03]
---

# Phase 133 Plan 04: Browse Tree Client Behavior Summary

## One-liner

Extended `src/entries/species-index.ts` with the "Show all ranks" toggle (localStorage-persisted), a rank-aware filter, and ancestor auto-expand — completing the interactive `/species` browse tree.

## What Was Built

**Rank toggle (D-03 / TREE-01):** `applyRankToggle(showAll)` sets `hidden = !showAll` on every `[data-rank="subfamily"|"tribe"|"subgenus"]` node and syncs `#show-all-ranks.checked`. The `change` listener applies + persists; the persisted state is applied on load.

**localStorage persistence (D-04):** Exactly one key — `beeatlas.speciesTree.showAllRanks`. `loadToggleState()` returns true only for stored `"1"` via strict `=== '1'` compare (no eval/parse); `saveToggleState()` writes `"1"`/`"0"`. All access is try/catch-guarded so a disabled/quota-exceeded store degrades to default-OFF without throwing (T-133-08, T-133-09).

**Filter + auto-expand (D-09 / TREE-03):** The `#species-filter` input listener lowercases the trimmed query and compares each `[data-rank]` node's `dataset.name`, showing/hiding via `hidden`. It matches across the currently-displayed rank set only (does not pierce toggle-hidden ranks). On a positive match, ancestor `<details>` elements are set `.open = true`. Empty query restores the rank-toggle-driven visibility and hides `#filter-empty`.

**Empty state (T-133-07):** A non-empty query with zero matches un-hides `#filter-empty` and sets `#filter-query.textContent = rawQuery` — textContent only, never innerHTML.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED source assertions for toggle/localStorage/filter/auto-expand | 2ce52f7 | src/tests/species-index.test.ts |
| 2 | Implement toggle + localStorage + filter + auto-expand | c8b0a9d | src/entries/species-index.ts |
| 3 | Human-verify the interactive /species browse tree | — (verification checkpoint, no source change) | — |

## Verification

- `VITEST_SKIP_BUILD=1 npx vitest run src/tests/species-index.test.ts` — 20/20 green.
- `npm run build` — green (bundle size within budget).
- **Human-verify checkpoint: APPROVED 2026-06-03.** Operator confirmed: default depth (family→genus→species, intermediate ranks hidden); "Show all ranks" toggle reveals intermediate ranks and persists across reload (ON and OFF); type-to-filter narrows the tree and auto-expands match ancestors; empty-state echoes the query safely; name links → taxon pages, 🗺 → filtered map; visible keyboard focus rings; no-JS fallback expandable.

## Self-Check

- [x] `src/entries/species-index.ts` modified with toggle + localStorage + filter + auto-expand
- [x] `src/tests/species-index.test.ts` updated with tree-behavior source assertions
- [x] Exactly one localStorage key (`beeatlas.speciesTree.showAllRanks`); strict `=== '1'`, try/catch-guarded
- [x] `#filter-query` set via `.textContent`, never `.innerHTML` (T-133-07)
- [x] Task 1 commit 2ce52f7 + Task 2 commit c8b0a9d exist
- [x] 20/20 species-index tests green; `npm run build` succeeds; no new npm deps
- [x] Human-verify checkpoint approved

## Deviations from Plan

None — plan executed as written; Task 3 human-verify approved by operator.
