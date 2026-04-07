---
phase: 37-sidebar-decomposition
plan: "01"
subsystem: frontend
tags: [lit, components, decomposition, controlled-input, tests]
dependency_graph:
  requires:
    - "36-02: bee-atlas coordinator, bee-map pure presenter"
  provides:
    - "bee-filter-controls: controlled filter input sub-component"
    - "bee-specimen-detail: pure specimen render sub-component"
    - "bee-sample-detail: pure sample event render sub-component"
    - "bee-sidebar.test.ts: structural invariant tests DECOMP-01/02/03/04"
  affects:
    - "frontend/src/bee-sidebar.ts (Plan 02 will wire these in)"
    - "frontend/src/bee-atlas.ts (Plan 02 will update coordinator bindings)"
tech_stack:
  added: []
  patterns:
    - "Controlled-input pattern: @property filterState drives all render; only transient text @state"
    - "Source-analysis tests: readFileSync + elementProperties for structural invariants (established in Phase 36)"
    - "Partial emit pattern: _emit(partial) merges with current filterState for full FilterChangedEvent"
key_files:
  created:
    - frontend/src/bee-filter-controls.ts
    - frontend/src/bee-specimen-detail.ts
    - frontend/src/bee-sample-detail.ts
    - frontend/src/tests/bee-sidebar.test.ts
  modified: []
decisions:
  - "_taxonInputText, _countyInputText, _ecoregionInputText are acceptable @state in bee-filter-controls — they are transient UI text, not filter state; DECOMP-01 'no filter state internally' refers to yearFrom, months, selectedCounties etc."
  - "updated() in bee-filter-controls syncs _taxonInputText from filterState+taxaOptions when filterState property changes — same pattern as old bee-sidebar.updated() for URL/popstate restore"
  - "DECOMP-04 tests written as failing red targets; 10 tests all fail correctly until Plan 02 refactors bee-sidebar"
  - "sample-dot-detail test uses /sample-dot-detail/ (no class= prefix) to match both CSS definition and HTML usage in bee-sidebar"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-04T21:24:05Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 0
---

# Phase 37 Plan 01: Sidebar Sub-Component Creation Summary

Three new Lit custom elements extracted from bee-sidebar.ts as standalone files, plus a structural invariant test file covering DECOMP-01 through DECOMP-04.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create bee-filter-controls, bee-specimen-detail, bee-sample-detail | d7e1b01 |
| 2 | Create structural invariant test file (bee-sidebar.test.ts) | 93c3e1e |

## What Was Built

### bee-filter-controls.ts (`@customElement('bee-filter-controls')`)

Controlled input component implementing the full filter UI extracted from bee-sidebar.ts:

- Six `@property({ attribute: false })` inputs: `filterState`, `taxaOptions`, `countyOptions`, `ecoregionOptions`, `boundaryMode`, `summary`
- Three `@state()` fields for transient text: `_taxonInputText`, `_countyInputText`, `_ecoregionInputText`
- `_emit(partial)` merges partial changes over current `filterState` to produce full `FilterChangedEvent`
- `updated()` syncs `_taxonInputText` from `filterState + taxaOptions` when `filterState` changes (URL/popstate restore)
- Renders: boundary mode toggle, taxon input + datalist, year range inputs, month checkbox grid, county/ecoregion autocomplete + chips, "Clear filters" button
- All chip remove buttons carry `aria-label="Remove ${name}"`, taxon clear button carries `aria-label="Clear taxon filter"`
- CSS migrated from bee-sidebar.ts for all filter and chip-related classes

### bee-specimen-detail.ts (`@customElement('bee-specimen-detail')`)

Pure render component for specimen cluster detail:

- `@property({ attribute: false }) samples: Sample[] = []`
- No `@state` fields
- Emits `CustomEvent('close', { bubbles: true, composed: true })` on Back button click
- Renders back button + sample list with species, Ecdysis links, iNat links

### bee-sample-detail.ts (`@customElement('bee-sample-detail')`)

Pure render component for sample event detail:

- `@property({ attribute: false }) sampleEvent!: SampleEvent`
- No `@state` fields
- Emits `CustomEvent('close', { bubbles: true, composed: true })` on Back button click
- Does NOT contain `this.selectedSampleEvent = null` (anti-pattern eliminated)
- Renders back button + date, observer, specimen count, iNat link

### bee-sidebar.test.ts

Structural invariant test file with 26 tests across 4 describe blocks:

- **DECOMP-01** (4 tests): elementProperties check + source analysis for filter-controls — all PASS
- **DECOMP-02** (2 tests): elementProperties check + no @state for specimen-detail — all PASS
- **DECOMP-03** (3 tests): elementProperties check + no @state + no selectedSampleEvent mutation — all PASS
- **DECOMP-04** (10 tests): bee-sidebar thin shell invariants — all FAIL (red target for Plan 02)

Test result: 16 pass, 10 fail (all 10 failures are DECOMP-04, expected and correct).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness] sample-dot-detail test pattern fixed to match CSS too**
- **Found during:** Task 2
- **Issue:** The plan specified `class="sample-dot-detail"` as the test pattern, but bee-sidebar.ts uses `class="panel-content sample-dot-detail"` in HTML — the exact string `class="sample-dot-detail"` would not match, causing the test to pass when it should fail (bee-sidebar still has the sample-dot-detail CSS definition `.sample-dot-detail {`)
- **Fix:** Used `/sample-dot-detail/` (no `class=` prefix) to match both CSS selector and HTML usage
- **Files modified:** `frontend/src/tests/bee-sidebar.test.ts`
- **Commit:** 93c3e1e (included in same commit)

## Known Stubs

None. All three components render from properties with no hardcoded placeholder data.

## Threat Flags

None. Pure structural decomposition — no new network endpoints, auth paths, or data storage introduced. All rendered data is typed Lit properties. SQL injection path unchanged (filter values still flow through buildFilterSQL() in filter.ts).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| frontend/src/bee-filter-controls.ts exists | FOUND |
| frontend/src/bee-specimen-detail.ts exists | FOUND |
| frontend/src/bee-sample-detail.ts exists | FOUND |
| frontend/src/tests/bee-sidebar.test.ts exists | FOUND |
| commit d7e1b01 (Task 1) exists | FOUND |
| commit 93c3e1e (Task 2) exists | FOUND |
