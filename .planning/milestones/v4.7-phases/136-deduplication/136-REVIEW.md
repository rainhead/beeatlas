---
phase: 136-deduplication
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - data/checklist_dedup.py
  - data/dbt/models/intermediate/int_checklist_collapsed.sql
  - data/dbt/models/intermediate/int_checklist_dedup_status.sql
  - data/dbt/models/intermediate/int_dedup_candidates.sql
  - data/dbt/seeds/dedup_decisions.csv
  - data/dbt/seeds/schema.yml
  - data/run.py
  - data/tests/test_checklist_dedup.py
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 136: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the cross-source deduplication implementation: exact-match checklist
collapse (`int_checklist_collapsed`), candidate-pair generation with lat-first
`ST_Distance_Sphere` proximity (`int_dedup_candidates`), the curator-decision
suppression view (`int_checklist_dedup_status`), the Python collector-matching /
build-gate layer (`checklist_dedup.py`), and `run.py` STEPS wiring.

The core conservative invariant — no suppression without a curator-confirmed
`dedup_decisions` row — holds: the suppression view uses an inner-chain LEFT JOIN
where an orphaned/stale `pair_key` simply fails to match (no accidental
suppression), and the build gate fails loudly on orphaned confirmed pair_keys.
STEPS ordering is correct (`dbt-build` -> `dedup-candidates` -> `dedup-gate`, all
before any consumer of the suppression view). The lat-first axis-order convention
for `ST_Distance_Sphere` is implemented correctly and consistently. All 11 tests
pass.

No BLOCKERs found. However there are five WARNINGs worth fixing, the most
important being an empty/punctuation-only collector that matches **every** other
collector (latent false-positive candidate generation that undermines the
conservative invariant) and a hard bounding-box prefilter that silently drops
valid sub-1km pairs above ~58 deg latitude.

## Warnings

### WR-01: Empty / punctuation-only collector matches every collector

**File:** `data/checklist_dedup.py:71-106`
**Issue:** `_collectors_match` guards only against `None` (D-08), not against
strings that normalize to an empty token set. `_normalize_collector('')`,
`_normalize_collector('  ')`, and `_normalize_collector('.')` all return
`frozenset()`. When the "smaller" set is empty, the `for tok in smaller` loop
never executes and the function falls through to `return True`. Verified:

```
_collectors_match('', 'John Smith')   -> True   # should be False
_collectors_match('  ', 'John Smith') -> True   # should be False
_collectors_match('.', 'John Smith')  -> True   # should be False
_collectors_match('.', '-')           -> True
```

This means a checklist or Ecdysis record whose `recordedBy` is blank, whitespace,
or punctuation-only would pair with **every** same-name/date/location specimen,
producing spurious candidate pairs. A curator could then confirm one, suppressing
a real record — a direct violation of the conservative no-suppression invariant.
The bug is currently latent (no empty-string `recordedBy` in committed checklist
data) but the Ecdysis side and future loads are not guaranteed clean. The
docstring's claim that empty string is treated like NULL (D-03/D-08) is not
backed by the code.

**Fix:** Reject empty token sets explicitly, before the equality/initials logic:
```python
ts_a = _normalize_collector(a)
ts_b = _normalize_collector(b)
if not ts_a or not ts_b:        # blank/punctuation-only -> ineligible (D-08 intent)
    return False
if ts_a == ts_b:
    return True
```

### WR-02: Bounding-box prefilter is a hard filter that drops valid pairs above ~58 deg lat

**File:** `data/dbt/models/intermediate/int_dedup_candidates.sql:86-89`
**Issue:** The comment calls the `ABS(cl.lon - ec.ecdysis_lon) <= 0.016` /
`ABS(cl.lat - ...) <= 0.012` box an "advisory performance guard," but it is a hard
`AND` in the join `ON` clause, not advisory. A constant 0.016-deg longitude box
covers fewer meters as latitude increases. At lat 47 (data max is 49) a sub-1km
E-W pair stays within 0.016 deg, but above ~58 deg latitude a genuine sub-1km E-W
pair exceeds 0.016 deg and is silently excluded by the prefilter **before** the
exact `ST_Distance_Sphere <= 1000` test runs:

```
lat=55: 1km E-W = 0.01566 deg  (ok, within 0.016)
lat=60: 1km E-W = 0.01797 deg  (EXCLUDED by 0.016 box)
lat=65: 1km E-W = 0.02126 deg  (EXCLUDED)
```

Current checklist latitude range is 45.6-49.0, so this is **latent, not
triggered**. But it is a correctness landmine: a future northern dataset would
silently miss valid duplicate candidates with no error.

**Fix:** Either widen the longitude box to be latitude-safe for the project's max
plausible latitude (e.g. `0.016 / cos(radians(lat))` is awkward in pure SQL, so a
conservative constant like `<= 0.030` would cover up to ~65 deg), or drop the box
entirely and rely on the exact `ST_Distance_Sphere` test (correctness over the
advisory speedup, which is out of v1 scope anyway). Minimum: change the comment so
it does not claim "advisory" for a hard filter.

### WR-03: Collapse survivor mixes columns from different physical rows

**File:** `data/dbt/models/intermediate/int_checklist_collapsed.sql:34-55`
**Issue:** The survivor row's `ObjectID` is `MIN(ObjectID)`, but `verbatim_name`,
`locality`, `family`, `coord_flag`, and `taxon_id` are computed by **independent**
`MIN()` aggregates that are not correlated to the surviving ObjectID. When group
members differ in those columns, the emitted row is a composite that does not
correspond to any single source record. Verified against live data: 25 collapse
groups have more than one distinct `verbatim_name`. So the survivor can carry
`ObjectID` from one row and `verbatim_name`/`locality` from another. Within a
shared `canonical_name` group `taxon_id` should be constant (it is derived from
`canonical_name`), but `verbatim_name`/`locality` provenance is genuinely lost.
The `GROUP BY` key intentionally excludes these columns; the `MIN()` choice was
likely "pick something deterministic," but it silently fabricates a row identity.

**Fix:** If provenance matters, carry the non-key columns from the surviving row
explicitly, e.g. via `arg_min(verbatim_name, ObjectID)` (DuckDB supports
`arg_min`/`min_by`) so all carried fields come from the `MIN(ObjectID)` row:
```sql
arg_min(verbatim_name, ObjectID) AS verbatim_name,
arg_min(locality, ObjectID)      AS locality,
...
```
If the divergence is known-harmless, document that the survivor is a synthetic
projection (not a real record) so downstream consumers do not assume row identity.

### WR-04: Unclosed file handles and DuckDB connection

**File:** `data/checklist_dedup.py:136-182, 208, 222`
**Issue:** `check_dedup_gate` opens files inline without `with` and without
closing them — `DEDUP_DECISIONS_CSV.open(newline="")` (line 208) and
`DEDUP_CANDIDATE_CSV.open(newline="")` (line 222) leak file objects that rely on
CPython refcount finalization. Similarly `write_dedup_candidates` opens the DuckDB
connection at line 136 and never calls `con.close()`. The project targets Python
3.14 and runs in a long-lived nightly process; leaked DuckDB handles can hold a
lock on `beeatlas.duckdb` and interfere with later steps.

**Fix:** Use context managers / explicit close:
```python
with DEDUP_DECISIONS_CSV.open(newline="") as fh:
    decisions = list(csv.DictReader(fh))
...
with DEDUP_CANDIDATE_CSV.open(newline="") as fh:
    candidate_keys = {row["pair_key"] for row in csv.DictReader(fh)}
```
and wrap the connection in `with duckdb.connect(DB_PATH) as con:` (or
`try/finally: con.close()`).

### WR-05: `DISTINCT ON` without `ORDER BY` relies on undefined row selection

**File:** `data/dbt/models/intermediate/int_checklist_dedup_status.sql:20-31`
**Issue:** `SELECT DISTINCT ON (cl.ObjectID) cl.*, <window> ...` has no `ORDER BY`.
In DuckDB (and Postgres) `DISTINCT ON` without a matching `ORDER BY` picks an
arbitrary row per group. It is safe **today** only because every fanned-out row
for a given `ObjectID` carries identical `cl.*` values and the window function
(`bool_or`/`MAX OVER PARTITION BY cl.ObjectID`) computes the same `dedup_status`
for all rows in the partition — so any pick is equivalent. This correctness rests
on an implicit invariant (the candidate fan-out never changes `cl.*`). If a future
edit adds a candidate-side column to the projection, the result becomes
non-deterministic with no test catching it.

**Fix:** Add an explicit `ORDER BY cl.ObjectID` (DuckDB requires the `DISTINCT ON`
expression to lead the `ORDER BY`) to make the row selection deterministic, or
restructure as `GROUP BY cl.ObjectID` with the aggregates pulled out of window
form. At minimum, keep a regression test asserting one row per ObjectID with the
confirmed-wins value (the existing `test_confirmed_pair_suppressed` covers the
single-candidate case but not multi-candidate fan-out determinism).

## Info

### IN-01: Distance test only exercises N-S movement

**File:** `data/tests/test_checklist_dedup.py:422-484`
**Issue:** `test_distance_1km_window` moves the candidate point purely along
latitude (constant `lon = -120.0`). The "independent axis-order" assertions
(lines 437-450) hardcode `ST_Point(lat, lon)`, so they test DuckDB's geometry, not
the model's axis order. The model-execution part happens to still fail if the
model's axis were swapped (under a `(lon, lat)` swap the 47.011 "outside" pair
compresses to ~612 m, becoming a candidate and tripping `assert 2 not in
obj_ids`), so the test is not broken — but it catches the documented axis trap only
by geometric luck. An E-W test pair (constant lat, varying lon) would target the
trap directly.

**Fix:** Add a second candidate pair displaced purely in longitude at a known
sub-1km / super-1km offset so an axis swap fails deterministically rather than
incidentally.

### IN-02: Docstring claims the status view mirrors `int_synonyms`'s LEFT JOIN pattern; it does not

**File:** `data/dbt/models/intermediate/int_checklist_dedup_status.sql:3-4`
**Issue:** The header says it "Mirrors the int_synonyms.sql LEFT JOIN view
pattern," but `int_synonyms.sql` is a 3-arm `UNION ALL` with anti-joins, not a
LEFT-JOIN chain. The reference is misleading to future maintainers.

**Fix:** Remove or correct the analogy (the relevant precedent for a curated-seed
LEFT JOIN is the taxon-bridge join in `stg_checklist__records_full.sql`, not
`int_synonyms`).

### IN-03: Dead `cl.day IS NULL` branch given current data

**File:** `data/dbt/models/intermediate/int_dedup_candidates.sql:79-83`
**Issue:** The day-matching branch `cl.day IS NULL OR ec.day IS NULL OR cl.day =
ec.day` includes a `cl.day IS NULL` arm, but live checklist data has zero
`date_quality='full'` rows with NULL day (the `'full'` quality guarantees a day),
and the only `date_quality` values present are `'full'` and `'none'` — never
`'year-only'` referenced in the comment and the test. The `cl.day IS NULL` arm is
effectively dead. Not a bug (the `ec.day IS NULL` arm is live and intentional via
the `TRY_CAST` day derivation), but the comment over-describes a case that does not
occur on the checklist side.

**Fix:** None required; optionally trim the comment's `'year-only'` reference to
match the actual data, or keep it as defensive future-proofing and note it is
defensive.

### IN-04: `INSTALL spatial` at runtime can fail offline

**File:** `data/checklist_dedup.py:138`
**Issue:** `write_dedup_candidates` runs `INSTALL spatial; LOAD spatial` on every
invocation. `INSTALL` reaches the DuckDB extension repository on first install; in
an offline/sandboxed nightly environment this is a failure point. Most pipeline
steps already ensure spatial is present via the dbt build, so the `INSTALL` here is
usually redundant.

**Fix:** Prefer `LOAD spatial` alone (extension is already installed by the dbt
build / prior steps), or wrap `INSTALL` so a no-network environment degrades to
`LOAD` of the already-installed extension.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
