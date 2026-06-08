---
phase: 137
slug: promotion-into-occurrences
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 137 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (data pipeline) + Vitest (frontend `src/`) |
| **Config file** | `data/pyproject.toml` (pytest) · `vitest.config.ts` / `vite.config.ts` (Vitest) |
| **Quick run command** | `cd data && uv run pytest tests/test_dbt_scaffold.py -q` · `npm test -- src/features` (or `build-geojson`) |
| **Full suite command** | dbt: `bash data/dbt/run.sh build` (enforces the 34-col contract) · JS: `npm test` |
| **Estimated runtime** | dbt build minutes; scoped pytest seconds; Vitest seconds |

> **Host constraint (project memory):** the maderas orchestrator SIGKILLs long Bash runs. Run data pytest **scoped per-file** in the fast tier — never the whole suite or `-m integration` in one go. Contract enforcement happens in `bash data/dbt/run.sh build`; treat that as the authoritative gate, not a duplicate JS validator (none exists — see CLAUDE.md).

---

## Sampling Rate

- **After every task commit:** Run the scoped quick command for the file touched (e.g. `tests/test_dbt_scaffold.py` for the contract/test changes; `build-geojson`/`features` Vitest for the decode change).
- **After every plan wave:** Run `bash data/dbt/run.sh build` (dbt contract) and `npm test` (JS) as appropriate to what the wave touched.
- **Before `/gsd:verify-work`:** dbt build green at 34 columns + scoped pytest green + Vitest green.
- **Max feedback latency:** seconds for scoped pytest/Vitest; minutes for the full dbt build.

---

## Per-Task Verification Map

> Plan IDs are illustrative — the planner assigns real task IDs. The point is that every success criterion has an observable, automated signal.

| Success criterion | Requirement | Observable signal | Test Type | Automated Command | Status |
|-------------------|-------------|--------------------|-----------|-------------------|--------|
| ARMs 1–3 emit `NULL::INTEGER AS checklist_id`; UNION ALL type-aligns; dbt build zero type errors | PRO-02 | `bash data/dbt/run.sh build` exits 0; `checklist_id` NULL for non-checklist rows | integration (dbt) | `bash data/dbt/run.sh build` | ⬜ pending |
| `occurrences.parquet` has `source='checklist'` rows; contract passes at 34 cols; no-coord excluded | PRO-01 | `DESCRIBE`/`COUNT` over `occurrences.parquet`: 34 columns, `source='checklist'` count > 0, 0 rows with NULL lat/lon among checklist | integration (dbt + pytest) | scoped `pytest tests/test_dbt_scaffold.py` | ⬜ pending |
| Phase 111 isolation test retired → positive `source='checklist'` existence assertion + v4.7 comment | PRO-03 | `test_dbt_scaffold.py` no longer asserts checklist exclusion; new assertion `source='checklist'` rows exist; greppable v4.7-reversal comment present; re-baselined ceiling guard | integration (pytest) | scoped `pytest tests/test_dbt_scaffold.py -q` | ⬜ pending |
| `_GEO_COLS` + `features.ts` change atomically; Vitest decodes `checklist:<N>`; `_buildGeoJSONFromRaw` drops no checklist point | PRO-04 | one commit touches both files; Vitest: a checklist row (NULL ecdysis/observation/specimen ids, non-null `checklist_id`) → `occId === 'checklist:<N>'`, feature emitted | unit (Vitest) | `npm test -- build-geojson` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. `data/tests/test_dbt_scaffold.py` (dbt scaffold assertions) and `src/*.test.ts` (`build-geojson.test.ts`) already exist; this phase modifies them.
- **Note (research finding):** `build-geojson.test.ts` factory helpers (`toRow`, `RowOverride`) use a 7-field row and must migrate to 8 fields (append `checklist_id`). Make `checklist_id` optional with a `null` default so existing factory callsites don't all need editing.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual confirmation that checklist points render on the live map | (Phase 138, not 137) | No styling/detail-card in this phase | Out of scope here — Phase 137 ends at decode correctness (Vitest), not map render |

*Phase 137's own behaviors all have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have an automated verify (dbt build / scoped pytest / Vitest) or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (none — infra exists)
- [ ] No watch-mode flags (Vitest run, not watch; pytest scoped, not `-m integration` whole-suite)
- [ ] Feedback latency acceptable (scoped seconds; dbt build minutes)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
