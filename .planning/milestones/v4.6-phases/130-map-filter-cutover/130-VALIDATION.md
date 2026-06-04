---
phase: 130
slug: map-filter-cutover
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-02
---

# Phase 130 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend); pytest via `uv run` (data — not exercised this phase) |
| **Config file** | `vitest.config.ts` (root); see `package.json` `test` script |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run && npm run build` |
| **Estimated runtime** | ~20–40 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green (`tsc --noEmit` clean via `npm run build`)
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

> Each verifiable behavior maps to an automated test (`npm test -- --run`) created in
> the plan that owns it. Plan numbers shown.

| Behavior | Requirement | Plan | Test Type | Automated Command | Status |
|----------|-------------|------|-----------|-------------------|--------|
| `buildFilterSQL` emits descendant `taxon_id` WHERE (`instr(lineage_path,'/N/')`) intersecting `occurrences.taxon_id`, not string columns | MFILT-01 | 130-01 T1 | unit | `npm test -- --run src/tests/filter.test.ts` | ⬜ pending |
| Taxon clause composes with county/year/bounds; `isFilterActive` true on `taxonId` | MFILT-01/03 | 130-01 T1 | unit | `npm test -- --run src/tests/filter.test.ts` | ⬜ pending |
| `OCCURRENCE_COLUMNS` includes `'taxon_id'`; `OccurrenceRow.taxon_id` typed | MFILT-03/D-07 | 130-01 T1 | unit + tsc | `npx tsc --noEmit` | ⬜ pending |
| TaxonOption/FilterChangedEvent on 8-rank `taxonId` shape; suite compiles | MFILT-01/02 | 130-01 T2 | unit + tsc | `npm test -- --run` | ⬜ pending |
| Autocomplete enumeration includes subfamily/tribe/subgenus/complex(+subtribe), excludes bycatch, no dead-ends (D-01) | MFILT-02 | 130-02 T1 | unit | `npm test -- --run` | ⬜ pending |
| D-03 labels + D-05 broader-first ordering | MFILT-02 | 130-02 T1 | unit | `npm test -- --run` | ⬜ pending |
| `taxon=` encodes integer `taxon_id`; URL round-trip preserves selection | MFILT-03 | 130-02 T2 | unit | `npm test -- --run src/tests/url-state.test.ts` | ⬜ pending |
| Legacy `taxon=<name>&taxonRank=<rank>` → pending-legacy → cache-resolved `taxon_id` with twin disambiguation | MFILT-03 | 130-02 T2 | unit | `npm test -- --run src/tests/url-state.test.ts` | ⬜ pending |
| Clear-filters, region/boundary, selection-rectangle still round-trip unchanged | MFILT-03 | 130-02 T2 | unit | `npm test -- --run` | ⬜ pending |
| Detail card resolves name from taxon cache by `taxon_id`; null/cache-miss → "No determination", never blank | MFILT-03/D-07 | 130-03 T1 | render | `npm test -- --run src/tests/bee-sidebar.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements — COMPLETE (runtime checks run 2026-06-02 against public/data/occurrences.db)

- [x] Vitest harness: existing `src/tests/filter.test.ts` mocks `../sqlite.ts` (L6-10) and tests `buildFilterSQL` as a pure string-producing function — no live SQLite needed for the descendant-clause assertions (they assert the generated SQL string). Enumeration/label/sort helpers are pure and unit-testable with fixtures. No new in-memory SQLite fixture required.
- [x] Runtime sanity checks:
  - `SELECT DISTINCT rank FROM taxa` → `subtribe` **IS present** among `is_anthophila=1` taxa (also confirms bycatch ranks order/suborder/superfamily exist only at `is_anthophila=0`). D-03 label builder handles all 8 surfaced ranks.
  - `EXPLAIN QUERY PLAN` for `WHERE taxon_id = N` on occurrences → **`SCAN occurrences`** (NO index on `occurrences.taxon_id`). The descendant filter is acceptable anyway: Bombus-genus descendant filter returns 13,041 occ in ~22 ms. Adding the index is a Phase 131 concern (no pipeline change this phase).
  - **D-01 enumeration — DECISIVE FINDING:** 168 of 834 `is_anthophila=1` taxa are dead-ends (no descendant occurrence). The simplified `SELECT … WHERE is_anthophila=1` form is **WRONG** (would show 168 dead-end entries). The naive correct EXISTS SQL is correct but **~10 s** (no index, double JOIN with `instr`). The efficient form — `SELECT DISTINCT taxon_id FROM occurrences WHERE taxon_id IS NOT NULL` then union each present taxon's `is_anthophila=1` `lineage_path` ancestors — produces the **identical 666-taxon eligible set in ~3.5 ms** and reuses the cache build. Plan 02 mandates this efficient ancestry-expansion form.
- [x] `'taxon_id'` added to `OCCURRENCE_COLUMNS` — assigned to Plan 130-01 Task 1 (the column exists in the shipped DB; change is additive).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lazy taxon-cache load stays OFF the `tablesReady` boot path (no boot-path regression) | MFILT-02 / D-08 | Boot timing is a wall-clock property best confirmed in the running app | Load the app; in devtools confirm `tablesReady` resolves (~250 ms) before the taxon-cache query fires; autocomplete still populates |
| Twin disambiguation reads correctly to a human | MFILT-02 | Label legibility/ordering is a perceptual judgment | Type `bomb`; confirm order `Bombini` → `Bombus (genus)` → `Bombus (subgenus)` → `Bombus fervidus complex` → species… |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (runtime checks done; resolved D-01 strategy)
- [x] No watch-mode flags
- [x] Feedback latency < 40s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-06-02
