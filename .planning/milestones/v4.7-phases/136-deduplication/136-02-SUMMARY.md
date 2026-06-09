---
phase: 136-deduplication
plan: "02"
subsystem: data-pipeline
status: complete
completed_date: "2026-06-08"
duration_minutes: 12
tags: [tdd, green, dedup, dbt, sql, python]
requirements_completed: [DUP-01]

dependency_graph:
  requires:
    - 136-01 (RED scaffold — stub module + placeholder models)
  provides:
    - int_checklist_collapsed.sql: DUP-01 lowest-ObjectID survivor + collapsed_count
    - checklist_dedup._normalize_collector: token frozenset normalizer (D-05)
    - checklist_dedup._collectors_match: token-set + initials-awareness (D-05)
  affects:
    - data/dbt/models/intermediate/int_checklist_collapsed.sql (implementation replaces placeholder)
    - data/checklist_dedup.py (_normalize_collector and _collectors_match stubs replaced)

tech_stack:
  added: []
  patterns:
    - CTE collector_key: COALESCE(recordedBy, CAST(ObjectID AS VARCHAR)) for NULL-safe GROUP BY
    - MIN(ObjectID) survivor with COUNT(*) aggregate for collapsed_count
    - Token-set frozenset with single-char initial matching (no fuzzy scoring)

key_files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_checklist_collapsed.sql
    - data/checklist_dedup.py

key_decisions:
  - "CTE keyed pattern chosen over inline COALESCE in GROUP BY — cleaner and explicit about the NULL-safe grouping key without expression-mismatch risk between SELECT and GROUP BY"
  - "MIN(recordedBy) preserves NULL correctly in single-collector groups: for groups where all rows share the same NULL recordedBy, MIN returns NULL (correct); for groups with a real name, returns the name"
  - "Single-alpha initial check uses tok.isalpha() guard so numeric tokens (which could technically be length-1) never spuriously match as initials"

metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 136 Plan 02: GREEN — DUP-01 Collapse + Collector Normalization Summary

Wave 2 of Phase 136 deduplication: implement the `int_checklist_collapsed` dbt model (DUP-01 internal collapse, D-03 lowest-ObjectID survivor, D-04 `collapsed_count`) and the token-set collector normalization helpers (`_normalize_collector` / `_collectors_match`, D-05) in `checklist_dedup.py`. Turns the three DUP-01 tests and the collector-normalization test GREEN.

## What Was Built

### Task 1: int_checklist_collapsed.sql — DUP-01 collapse (commit 409d1a4)

`data/dbt/models/intermediate/int_checklist_collapsed.sql` — replaces the 136-01 `SELECT * FROM stg_checklist__records_full` passthrough with a full GROUP BY collapse:

- **CTE `keyed`**: adds `collector_key = COALESCE(recordedBy, CAST(ObjectID AS VARCHAR))` — ensures each NULL-recordedBy row gets a unique key (its own ObjectID), so NULL-collector rows form individual groups and are never collapsed together (D-03 / T-136-03).
- **GROUP BY** `canonical_name, lat, lon, year, month, day, date_quality, collector_key` — five-key exact match plus NULL-safe collector.
- **`MIN(ObjectID) AS ObjectID`** — lowest ObjectID in the group survives (D-03).
- **`COUNT(*) AS collapsed_count`** — group size; 1 for unique rows (D-04).
- **Non-key fields** carried via `MIN(...)` — `verbatim_name`, `locality`, `family`, `coord_flag`, `taxon_id`, `recordedBy`. Since rows in a group are exact-match duplicates on all content fields, MIN is equivalent to FIRST.
- **`materialized='table'`** — expensive full-table aggregate; materialized once so downstream `int_dedup_candidates` and `int_checklist_dedup_status` read the result cheaply.
- No `ST_Distance_Sphere` (no spatial in collapse — verified by grep).

### Task 2: _normalize_collector / _collectors_match (commit 453a771)

`data/checklist_dedup.py` — two stub functions replaced with implementations:

**`_normalize_collector(name)`:**
- `None` → `frozenset()`
- `re.sub(r"[^\w\s]", " ", name.lower())` — strip punctuation
- Collapse whitespace, strip, split → `frozenset` of tokens

**`_collectors_match(a, b)`:**
- Either arg `None` → `False` (D-08: NULL ineligible)
- Normalize both; if token-sets equal → `True`
- Initials rule: identify smaller set; for each token, either exact match in larger set OR single-alpha character whose value is the initial of some token in the larger set (`tok.isalpha()` guard prevents numeric tokens matching)
- No `rapidfuzz` or fuzzy scoring (D-05 — grep confirms 0 occurrences)

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| test_no_exact_duplicates_after_collapse | GREEN | Duplicate tuple assertion passes |
| test_collapsed_count_correct | GREEN | collapsed_count=3 for group, 1 for unique |
| test_lowest_objectid_survives | GREEN | ObjectID=5 (MIN) survives over 7 and 10 |
| test_collector_normalization | GREEN | initials match, different-initial no-match, None=False |

7 remaining failures are DUP-02 / DUP-03 stubs (waves 3–4, expected RED). 1 pre-existing `test_resolve_offline_fallbacks.py` failure unrelated to this plan (out of scope, logged below).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

Stubs remaining from 136-01 (not yet this plan's scope):

| Stub | File | Wave |
|------|------|------|
| `write_dedup_candidates()` — raises NotImplementedError | data/checklist_dedup.py | 136-03 |
| `check_dedup_gate()` — raises NotImplementedError | data/checklist_dedup.py | 136-04 |
| `int_dedup_candidates.sql` — WHERE false shell | data/dbt/models/intermediate/ | 136-03 |
| `int_checklist_dedup_status.sql` — NULL dedup_status | data/dbt/models/intermediate/ | 136-04 |

## Deferred Items

Pre-existing test failure (not introduced by this plan, not in scope to fix):
- `test_resolve_offline_fallbacks.py::test_committed_curated_seed_matches_expected_mappings` — fails before and after this plan's changes; curated_taxon_ids.csv likely drifted from the committed expected mapping snapshot. Logged to `deferred-items.md` in the phase directory.

## Threat Flags

None. The COALESCE NULL-isolation key directly mitigates T-136-03 (NULL-collector rows wrongly merged). No new network endpoints, auth paths, or schema trust boundaries introduced.

## Self-Check: PASSED
