---
phase: 160
slug: overlap-capable-place-model-many-to-many-membership
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-23
---

# Phase 160 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 160-RESEARCH.md "Validation Architecture". Per-task map filled by
> the planner (2026-06-23).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (data pipeline)** | pytest (`data/tests/`) via `uv run pytest` |
| **Framework (dbt contract)** | `bash data/dbt/run.sh build` (was 33-col; now 32 + new `occurrence_places` contract) |
| **Framework (frontend)** | Vitest (`npm test`) |
| **Config file** | `data/pyproject.toml` (pytest) · `vitest.config` (frontend) |
| **Quick run command** | `cd data && uv run pytest tests/test_places_validation.py tests/test_places_export.py tests/test_occurrence_places.py` |
| **Full suite command** | `cd data && uv run pytest && cd .. && npm test && bash data/dbt/run.sh build` |
| **Estimated runtime** | pytest ~tens of s; npm test ~hundreds of tests; dbt build longer |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (pytest place tests OR `npm test -- <pattern>` for frontend tasks)
- **After every plan wave:** Run the full suite (pytest + npm test + dbt build)
- **Before `/gsd-verify-work`:** Full suite + `bash data/dbt/run.sh build` must be green (the dbt contract is the gate), plus a local `cd data && uv run python run.py` (through `places-maps`) producing an `occurrences.db` that `node scripts/validate-db.mjs` accepts
- **Max feedback latency:** quick < ~30s; full suite is the wave gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 160-01 | 0 | SC-5, SC-2 | — | n/a (test authoring) | unit (py) | `cd data && uv run pytest tests/test_occurrence_places.py -x` | ❌→✅ new (self-contained, GREEN on author) | ⬜ pending |
| 01-T1b | 160-01 | 0 | SC-2 | — | overlaps load (no raise); other validation rejects hold | unit (py) | `cd data && uv run pytest tests/test_places_validation.py::test_overlapping_polygons -x` | ✅ invert (RED until 160-02) | ⬜ pending |
| 01-T2 | 160-01 | 0 | SC-3, SC-1 | — | fixtures key on identity cols, not place_slug | unit (py+ts) | `cd data && uv run pytest tests/test_places_export.py -x ; cd .. && npm test -- filter` | ✅ update (RED until 160-03/04) | ⬜ pending |
| 02-T1 | 160-02 | 1 | SC-1, SC-5 | T-160-03 | occ_id CASE = occIdFromRow; contract gate | contract (dbt) | `bash data/dbt/run.sh build` | ✅ build is the gate | ⬜ pending |
| 02-T2 | 160-02 | 1 | SC-2 | T-160-02 | only overlap check removed; WKT/WGS84/slug/permit retained | unit (py) | `cd data && uv run pytest tests/test_places_validation.py -x` | ✅ (turns GREEN here) | ⬜ pending |
| 02-T3 | 160-02 | 1 | SC-1 | T-160-SC | bridge shipped + CI whitelist sees occurrence_places | integration | `cd data && uv run python run.py && cd .. && node scripts/make-local-manifest.js && node scripts/validate-db.mjs` | ✅ (whitelists updated) | ⬜ pending |
| 03-T1 | 160-03 | 2 | SC-3 | T-160-04 | double-count via bridge JOIN (D-05) | unit (py) | `cd data && uv run pytest tests/test_places_export.py -x` | ✅ (turns GREEN here) | ⬜ pending |
| 03-T2 | 160-03 | 2 | SC-3 | — | per-place SVG point per membership (D-05) | unit (py) | `cd data && uv run pytest tests/test_places_export.py tests/test_occurrence_places.py -x` | ✅ | ⬜ pending |
| 04-T1 | 160-04 | 3 | SC-4, SC-1 | T-160-01 | EXISTS membership clause keeps slug escaping; place_slug removed | unit (ts) | `npm test -- filter` | ✅ (turns GREEN here) | ⬜ pending |
| 04-T2 | 160-04 | 3 | D-04 | T-160-01 | member-place names; fetch in state owner; occ_id bound | component (ts) | `npm test -- bee-occurrence-detail` | ❌→✅ new test | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** every task has an `<automated>` verify; no 3 consecutive tasks lack automated feedback. RED-by-design assertions (01-T1b/01-T2) are bounded to ≤1 wave before their producing plan turns them GREEN (160-02/03/04).

---

## Validation Architecture (from research — the behaviors that MUST be proven)

1. **Multi-membership resolves to a SET.** A point inside the overlap of place A
   and place B produces TWO `occurrence_places` rows (occ_id→A, occ_id→B),
   deterministically (stable across builds). → 01-T1, 02-T1.
2. **Overlap guard removed.** `places_validation.py` accepts a places fixture
   containing two partially-overlapping polygons (previously rejected). The old
   "rejects overlap" assertion is inverted to "loads cleanly". WKT-validity +
   WGS84-bounds + slug + permit checks still reject their bad inputs. → 01-T1b, 02-T2.
3. **Occurrences contract is 32 cols, bridge contract exists.**
   `bash data/dbt/run.sh build` green: `place_slug` absent from
   `marts/occurrences` contract; new `occurrence_places` mart builds under its
   own contract; `occ_id` join key matches `occIdFromRow` priority. → 02-T1.
4. **Counts double-count by membership.** `places_export.py` `_query_counts`:
   an occurrence in A∩B increments BOTH A and B specimen/sample counts
   (`places.json`). Per-place SVG maps include the point for every place it's in. → 01-T2, 03-T1, 03-T2.
5. **Frontend filter via membership.** Selecting place A finds an occurrence
   whose membership includes A even if it also belongs to B (wa-sqlite EXISTS
   subquery against the in-`occurrences.db` `occurrence_places` table). → 01-T2, 04-T1.
6. **Occurrence detail lists all places (D-04).** Sidebar renders every member
   place name for a multi-place occurrence (reusing the places.json name source). → 04-T2.

---

## Wave 0 Requirements

- [x] Overlapping-places test fixture (two partially-overlapping polygons) for
      `data/tests/test_places_validation.py` (invert) and an occurrence-in-overlap
      fixture for the bridge test (`data/tests/test_occurrence_places.py`, new) →
      160-01 Task 1.
- [x] `data/tests/test_places_export.py` fixtures rewritten to identity columns +
      a `(occ_id, place_slug)` bridge fixture asserting double-count → 160-01 Task 2.
- [x] Frontend test for the membership filter rewrite (`filter.ts` EXISTS) →
      160-01 Task 2.
- [x] `occurrence_places` added to BOTH hardcoded `occurrences_db_tables` lists
      (`scripts/make-local-manifest.js`, `scripts/validate-db.mjs`) → 160-02 Task 3
      (production nightly derives the list dynamically; only the two JS lists need editing).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar lists multiple place names for a real multi-place occurrence | D-04 | Visual render | Load an occurrence in a known overlap (e.g. one of the 16 WDFW↔existing overlaps once Phase 161 lands); confirm the detail pane lists both place names and selecting either place finds it |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test_occurrence_places.py, filter.test.ts, bee-occurrence-detail.test.ts; the two JS whitelists in 160-02)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved 2026-06-23 (per-task map filled; Nyquist continuity satisfied).
