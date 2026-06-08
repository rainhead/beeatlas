---
phase: 136-deduplication
verified: 2026-06-08T00:00:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Phase 136: Deduplication Verification Report

**Phase Goal:** Internal exact duplicates are collapsed and checklist records that duplicate an Ecdysis specimen are conservatively flagged for human sign-off — no record is suppressed without explicit curator confirmation.
**Verified:** 2026-06-08
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Exact internal duplicate groups (canonical_name, lat, lon, year, month, day, recordedBy) collapse to one survivor | VERIFIED | `int_checklist_collapsed.sql` GROUP BY these keys; `test_no_exact_duplicates_after_collapse` passes |
| 2 | The survivor carries collapsed_count = group size, 1 if unique (D-04) | VERIFIED | `COUNT(*) AS collapsed_count` in model; `test_collapsed_count_correct` passes |
| 3 | The survivor's ObjectID is the lowest in its group (D-03) | VERIFIED | `MIN(ObjectID) AS ObjectID` in model; `test_lowest_objectid_survives` passes |
| 4 | NULL-date and NULL-coord checklist rows are never cross-source candidates (DUP-02) | VERIFIED | `date_quality = 'full'` AND `cl.lat IS NOT NULL AND cl.lon IS NOT NULL` join predicates; `test_null_date_excluded_from_candidates` and `test_null_coord_excluded_from_candidates` both pass |
| 5 | Cross-source candidates use 1.0 km proximity with lat-first ST_Distance_Sphere axis order (D-07) | VERIFIED | `ST_Point(cl.lat, cl.lon)` explicit lat-first in `int_dedup_candidates.sql` with mandatory comment; `test_distance_1km_window` passes |
| 6 | An unreviewed candidate (no seed row) yields dedup_status NULL — it does NOT suppress a point (DUP-03) | VERIFIED | LEFT JOIN through `int_dedup_candidates` to `dedup_decisions`; no seed row = NULL dedup_status; `test_unreviewed_pair_not_suppressed` passes (three-part test) |
| 7 | Only a curator-confirmed pair ever sets dedup_status='confirmed'; gate blocks stale seeds | VERIFIED | `bool_or(dd.dedup_status = 'confirmed') OVER (PARTITION BY cl.ObjectID)` in view; `check_dedup_gate()` sys.exits on orphaned confirmed pair_keys; `test_confirmed_pair_suppressed` and `test_dedup_gate` both pass |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `data/checklist_dedup.py` | Module with constants + four implemented functions | VERIFIED | All four functions implemented (no NotImplementedError); `DEDUP_DISTANCE_THRESHOLD_M = 1000.0`; `_csv_safe()` present; no rapidfuzz import |
| `data/tests/test_checklist_dedup.py` | 11 tests covering DUP-01/02/03 | VERIFIED | 11 tests collected; 11 pass; 0 skipped; no @pytest.mark.integration |
| `data/dbt/models/intermediate/int_checklist_collapsed.sql` | DUP-01 collapse model | VERIFIED | `materialized='table'`; MIN(ObjectID) survivor; collapsed_count; COALESCE NULL-safe collector key; refs `stg_checklist__records_full` |
| `data/dbt/models/intermediate/int_dedup_candidates.sql` | DUP-02 spatial candidate join | VERIFIED | `materialized='table'`; lat-first ST_Distance_Sphere; date_quality='full' guard; refs `int_checklist_collapsed`; pair_key present |
| `data/dbt/models/intermediate/int_checklist_dedup_status.sql` | DUP-03 dedup_status view | VERIFIED | `materialized='view'`; LEFT JOIN chain through candidates to decisions; bool_or window; Phase 137 consumption comment present |
| `data/dbt/seeds/dedup_decisions.csv` | Header-only committed seed | VERIFIED | 1 line: `pair_key,dedup_status,note` — no data rows |
| `data/dbt/seeds/schema.yml` | dedup_decisions entry with tests | VERIFIED | Entry present with not_null/unique on pair_key, accepted_values ['confirmed','rejected'] on dedup_status |
| `data/run.py` | dedup-candidates + dedup-gate STEPS between dbt-build and generate-sqlite | VERIFIED | `from checklist_dedup import write_dedup_candidates, check_dedup_gate` at line 49; steps at lines 109–110, between dbt-build and generate-sqlite |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `test_checklist_dedup.py` | `checklist_dedup.py` | `import checklist_dedup` | WIRED | Line 22 of test file |
| `int_checklist_collapsed.sql` | `stg_checklist__records_full` | `ref('stg_checklist__records_full')` | WIRED | Line 31 |
| `int_dedup_candidates.sql` | `int_checklist_collapsed` | `ref('int_checklist_collapsed')` | WIRED | Line 73 |
| `int_checklist_dedup_status.sql` | `int_checklist_collapsed` + `int_dedup_candidates` + `dedup_decisions` | LEFT JOIN chain via ref() | WIRED | Lines 27–31 |
| `run.py` | `checklist_dedup.py` | `from checklist_dedup import` | WIRED | Line 49; steps at lines 109–110 |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase produces intermediate dbt tables and a curator-facing CSV. No dynamic UI rendering; data flow terminates at the committed decisions seed + dedup_status column. Phase 137 (PRO-01) is the downstream consumer.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 11 dedup tests pass | `cd data && uv run pytest tests/test_checklist_dedup.py -q` | 11 passed in 3.38s | PASS |
| Module imports cleanly with constant | `uv run python -c "import checklist_dedup; print(checklist_dedup.DEDUP_DISTANCE_THRESHOLD_M)"` | `1000.0` (confirmed by test suite import) | PASS |
| dedup_decisions.csv is header-only | `wc -l data/dbt/seeds/dedup_decisions.csv` | 1 line | PASS |
| run.py step order correct | `grep -n "dedup-candidates\|dedup-gate" data/run.py` | Lines 109–110, between dbt-build and generate-sqlite | PASS |

---

### Probe Execution

No probe scripts declared or required for this phase.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DUP-01 | 136-02 | Exact internal duplicates collapse to single record | SATISFIED | `int_checklist_collapsed.sql` GROUP BY collapse; 3 tests green |
| DUP-02 | 136-03 | Cross-source candidates detected conservatively, flagged not silently merged | SATISFIED | `int_dedup_candidates.sql` + `write_dedup_candidates()`; `dedup_candidate_pairs.csv` produced; 4 tests green |
| DUP-03 | 136-04 | Flagged pairs suppressed only after human sign-off; unreviewed = not suppressed | SATISFIED | `int_checklist_dedup_status.sql` LEFT JOIN; `check_dedup_gate()`; HUMAN-REVIEW GATE reached and approved (0 pairs, curator confirmed); 3 tests green; `dedup-gate` wired into run.py |

---

### Anti-Patterns Found

No debt markers (TBD, FIXME, XXX), no NotImplementedError stubs, no placeholder SQL remaining in any of the seven modified files. No `rapidfuzz` import in `checklist_dedup.py`. No hardcoded empty returns in gate or writer functions.

The only "placeholder" comment present is in `int_checklist_dedup_status.sql`: it documents Phase 137's consumption pattern (`WHERE dedup_status IS DISTINCT FROM 'confirmed'`) — this is forward-documentation, not a stub.

---

### Human Verification Required

**HUMAN-REVIEW GATE — explicitly satisfied.** Per the verification instructions, the curator review gate was reached and approved: `dedup_candidate_pairs.csv` contained 0 candidate pairs (the current dataset has no cross-source matches meeting all four AND criteria). The `dedup-gate` step prints `"dedup-gate: OK (0 confirmed, 0 rejected)"`. Phase 137 may proceed.

---

### Gaps Summary

No gaps. All must-haves verified at all four levels (exists, substantive, wired, data-flow appropriate). The three requirement IDs (DUP-01, DUP-02, DUP-03) are fully satisfied. The HUMAN-REVIEW GATE was satisfied by explicit curator approval.

---

_Verified: 2026-06-08_
_Verifier: Claude (gsd-verifier)_
