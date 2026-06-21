---
phase: 156
slug: separate-spatial-bounds-filter-from-per-record-selection-bac
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-21
---

# Phase 156 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.8 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~30 seconds (792-test baseline from Phase 153) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (792-test baseline preserved)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> No formal REQ-IDs on this backlog phase — requirements are the locked decisions D-01..D-08 in `156-CONTEXT.md`. Threat refs: none (pure client-side refactor; no new attack surface — `bbox=`/`sel=` floats are range-validated exactly as today; no string interpolation into SQL).

| Behavior | Decision | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| `FilterState.bounds` field exists; `emptyFilter()` includes it | D-01 | unit | `npm test filter.test.ts` | ✅ | ⬜ pending |
| `isFilterActive` returns true when bounds set | D-01 | unit | `npm test filter.test.ts` | ✅ | ⬜ pending |
| `buildFilterSQL` includes the bounds clause | D-01 | unit | `npm test filter.test.ts` | ✅ | ⬜ pending |
| `buildParams` writes `bbox=` from `filter.bounds` | D-02 | unit | `npm test url-state.test.ts` | ✅ | ⬜ pending |
| `parseParams` reads `bbox=` into `filter.bounds` | D-02 | unit | `npm test url-state.test.ts` | ✅ | ⬜ pending |
| `parseParams` reads legacy `sel=` into `filter.bounds` (back-compat) | D-03 | unit | `npm test url-state.test.ts` | ✅ | ⬜ pending |
| `parseParams` never yields `selection.type === 'bounds'` | D-03 | unit | `npm test url-state.test.ts` | ✅ | ⬜ pending |
| `_filterState.bounds` initialized to null; restore wires `initFilter.bounds` | D-01 | structural | `npm test bee-atlas.test.ts` | ✅ | ⬜ pending |
| `_applyBoundsFilter` writes `_filterState.bounds` (not `_selectionBounds`) | D-01 | structural | `npm test bee-atlas.test.ts` | ✅ | ⬜ pending |
| `_applyBoundsFilter` does NOT set `_paneState = 'list'` | D-04 | structural | `npm test bee-atlas.test.ts` | ✅ | ⬜ pending |
| `_applyBoundsFilter` does NOT null `_selectedOccIds`/`_selectedCluster` | D-05 | structural | `npm test bee-atlas.test.ts` | ✅ | ⬜ pending |
| `_onFilterChanged` preserves `bounds` through the spread | D-05 | structural | `npm test bee-atlas.test.ts` | ✅ | ⬜ pending |
| `_onMapClickEmpty` clears selection only, leaves bounds | D-06 | structural | `npm test bee-atlas.test.ts` | ✅ | ⬜ pending |
| `intendedFilterActive` true when `_filterState.bounds` set | D-01 | structural | `npm test bee-atlas.test.ts` | ✅ | ⬜ pending |
| bounds + record selection coexist (both active) | D-05 | unit/structural | `npm test bee-atlas.test.ts` | ✅ | ⬜ pending |
| `near-me-cleared` still dispatched; clears bounds only | D-07 | structural | `npm test bee-pane.test.ts` | ✅ | ⬜ pending |
| 792 total tests green | regression | `npm test` | ✅ | ⬜ pending |

---

## Wave 0 Requirements

No new test files. All gaps are updates to existing test files (covered as in-wave tasks, not a separate Wave 0 install):

- [ ] `src/tests/filter.test.ts` — update `emptyFilter()` helper; add `isFilterActive`/`buildFilterSQL` bounds cases
- [ ] `src/tests/url-state.test.ts` — migrate `bounds selection (SEL-06)` block from `sel=`/`SelectionState{type:'bounds'}` to `bbox=`/`filter.bounds`; add legacy-`sel=` back-compat + the no-`selection.type==='bounds'` guard
- [ ] `src/tests/bee-atlas.test.ts` — migrate `SEL-06 + SEL-07 wiring` block; add D-04/D-05/D-06 assertions + a coexistence case
- [ ] `src/tests/bee-pane.test.ts` — update prop-name assertions if `selectionBoundsActive`/`selectionBoundsLabel` are renamed; keep the `near-me-cleared` regression guard

*Existing Vitest infrastructure covers all phase requirements — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Existing `?sel=…` shared link still restores bounds and renders the filtered set | D-03 | End-to-end URL restore + map render is browser-only | Open a saved `?sel=west,south,east,north` link in the running app; confirm the map shows only in-bounds dots, the label appears in the 'where' input, and the URL rewrites to `bbox=` on next interaction |
| Bounds + selection coexist visibly (filtered map dots AND a record selection list) | D-05 | Visual composition across map + list panes | Apply a shift-drag box, then click a cluster; confirm both the bounds filter and the record selection remain active |

---

## Validation Sign-Off

- [ ] All tasks have automated verify (unit or source-text structural) or are listed as Manual-Only above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (none — all test files exist)
- [ ] No watch-mode flags (`npm test` = `vitest run`, single-shot)
- [ ] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
