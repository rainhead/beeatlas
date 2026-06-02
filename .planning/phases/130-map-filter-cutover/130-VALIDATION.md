---
phase: 130
slug: map-filter-cutover
status: draft
nyquist_compliant: false
wave_0_complete: false
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

> Populated by the planner against the actual task IDs. Rows below are the verifiable
> behaviors that MUST map to at least one automated test or a justified manual entry.

| Behavior | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|----------|-------------|------------|-----------|-------------------|-------------|--------|
| `buildFilterSQL` emits descendant `taxon_id` WHERE (`instr(lineage_path,'/N/')`) intersecting `occurrences.taxon_id`, not string columns | MFILT-01 | — | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| Selecting a taxon at family/subfamily/tribe/genus/subgenus/complex/species yields exactly its descendant occurrences | MFILT-01 | — | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| Autocomplete enumeration includes subfamily/tribe/subgenus/complex (+subtribe) and excludes bycatch (`is_anthophila=0`) | MFILT-02 | — | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| D-03 labels (plain higher ranks; `(genus)`/`(subgenus)`; `X complex`; plain binomial) + D-05 broader-first ordering | MFILT-02 | — | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| `taxon=` encodes integer `taxon_id`; URL round-trip preserves selection | MFILT-03 | — | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| Legacy `taxon=<name>&taxonRank=<rank>` resolves to `taxon_id` with twin disambiguation | MFILT-03 | — | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| Clear-filters, region/boundary, selection-rectangle still round-trip unchanged | MFILT-03 | — | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |
| Detail card resolves name from taxon cache by `taxon_id`; `taxon_id IS NULL` → "No determination", never blank/undefined | MFILT-03 | — | unit | `npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Confirm Vitest harness can stand up a wa-sqlite (or fixture) `taxa` + `occurrences` table for filter/enumeration SQL assertions — reuse any existing SQLite test fixture; if none, add a minimal in-memory fixture.
- [ ] Runtime sanity checks the researcher flagged (cheap, gate the D-01 SQL assumption):
  - `SELECT DISTINCT rank FROM taxa` — confirm `subtribe` is present (D-03/D-05 ordering).
  - `EXPLAIN QUERY PLAN` for the descendant filter — confirm `occurrences.taxon_id` lookup is acceptable.
  - `SELECT COUNT(*)` cross-check that every `is_anthophila=1` taxon has ≥1 renderable descendant occurrence (validates the simplified D-01 enumeration vs. the EXISTS form).
- [ ] `'taxon_id'` added to `OCCURRENCE_COLUMNS` (required for D-07 detail-card resolution).

*If the existing SQLite test fixture already covers taxa+occurrences, "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lazy taxon-cache load stays OFF the `tablesReady` boot path (no boot-path regression) | MFILT-02 | Boot timing is a wall-clock property best confirmed in the running app | Load the app; in devtools confirm `tablesReady` resolves (~250 ms) before the taxon-cache query fires; autocomplete still populates on focus/background |
| Twin disambiguation reads correctly to a human (e.g. `Bombus (genus)` vs `Bombus (subgenus)`, `Bombus fervidus complex` vs species) | MFILT-02 | Label legibility/ordering is a perceptual judgment | Type `bomb`; confirm order `Bombini` → `Bombus (genus)` → `Bombus (subgenus)` → `Bombus fervidus complex` → species… |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
