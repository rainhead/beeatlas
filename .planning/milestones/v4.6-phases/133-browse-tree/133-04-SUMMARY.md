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
  created:
    - src/species-tree.ts
  modified:
    - src/entries/species-index.ts
    - src/tests/species-index.test.ts
    - _pages/species.njk
    - src/styles/taxon-pages.css
    - src/tests/arch.test.ts
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

- `VITEST_SKIP_BUILD=1 npx vitest run src/tests/species-index.test.ts` — 32/32 green
  (after gap closure; see below).
- `npm run build` — green (bundle size within budget).
- **Human-verify checkpoint: APPROVED 2026-06-03 (round 3, post gap-closure).**
  The first approval was premature — code review (133-REVIEW.md) and two rounds of
  interactive re-verify caught a broken default view and several UI defects that the
  source-grep-only tests had not. After the fixes below, the operator confirmed:
  default depth shows family→genus→species via disclosure triangles; "Show all ranks"
  reveals intermediate ranks and persists across reload without reflow; type-to-filter
  narrows to matches (non-matches hide) and auto-expands ancestors; empty-state echoes
  the query safely; species nest under their genus; links and focus rings work.

## Gap Closure (post-checkpoint, 2026-06-03)

Code review + re-verification found the initial implementation broke the core
experience. Root cause: intermediate ranks were hidden with the `hidden` attribute
(display:none), which buried the genera/species nested inside. Fixes:

| Issue | Fix | Commit |
|-------|-----|--------|
| CR-01 default view empty below family | Skip intermediate ranks via `display:contents` + forced-open (new `src/species-tree.ts`), markup ships all ranks visible (no-JS) | 220a502 |
| CR-02 auto-expand left toggle-hidden ancestors hidden | `openAncestors` un-hides AND opens ancestors | 220a502 |
| CR-03 filter reset left rows hidden | Reset clears `hidden` on every rank then re-applies the toggle | 220a502 |
| WR-03 source-grep tests passed while broken | Real happy-dom executable tests over `src/species-tree.ts` | af750e8 |
| No expand affordance (`display:flex` dropped the native marker) | Unicode `::before` disclosure triangle (▸/▾) | (round 2) |
| "Show all ranks" reflowed the page | Reserve border space; checked state only changes border color | (round 2) |
| Filter did not hide rows (`[hidden]` outranked by `.species-list li{display:flex}`) | Scoped `.species-index [data-rank][hidden]{display:none}` | (round 3) |
| Species outdented left of genus; triangle too small | Indent `.species-list` one depth; enlarge triangle | (round 3) |

Behavior logic now lives in `src/species-tree.ts` (pure DOM, unit-tested); the entry
`src/entries/species-index.ts` is a thin wrapper.

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
