---
phase: 164
slug: sidebar-list-ignores-src-source-filter
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 164 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Behaviors derive from RESEARCH.md §"Validation Architecture" and CONTEXT.md D-01..D-05.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts / vitest config (existing) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~existing suite (800+ tests) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` (full)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** full-suite runtime

---

## Per-Task Verification Map

> Populated by the planner / executor once PLAN.md task IDs exist. Behaviors to cover:

| Behavior (from CONTEXT) | Decision | Test Type | Automated Command |
|---|---|---|---|
| `buildFilterSQL` emits a source predicate when `hiddenSources` is set | D-01/D-02 | unit | `npm test` (filter SQL test) |
| All four consumers (list, filter-result count, CSV, table) honor `src=` | D-01 | unit/integration | `npm test` |
| `isFilterActive` returns true when a source is hidden | D-02 | unit | `npm test` |
| All 4 sources hidden → SQL views return zero rows (honest empty) | D-05 | unit | `npm test` |
| `src=` URL round-trip (parse → FilterState → buildParams → `src=`) unchanged | D-02 | unit | `npm test` (url-state round-trip) |
| Map still receives `hiddenSources` + `_visibleBySource` retained (no ghost regression) | D-04 | unit | `npm test` (bee-map / bee-atlas) |
| Headline summary stats (`_loadSummaryFromSQLite`) NOT source-filtered | D-01 note | unit | `npm test` |

---

## Wave 0 Requirements

- Existing vitest infrastructure covers all phase requirements (no new framework). New cases added to existing `src/tests/filter.test.ts` / `src/tests/url-state.test.ts` and bee-atlas/bee-map tests.

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Visual parity: map and sidebar list agree under `?…&pane=list&src=ecdysis,waba_sample` | End-to-end visual UAT | Load the URL, confirm the sidebar list shows only ecdysis + waba_sample occurrences, matching the map. |
