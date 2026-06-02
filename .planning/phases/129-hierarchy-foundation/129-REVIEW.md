---
phase: 129-hierarchy-foundation
reviewed: 2026-06-02T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - data/sqlite_export.py
  - data/tests/test_sqlite_export.py
  - src/bee-atlas.ts
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 129: Code Review Report

**Reviewed:** 2026-06-02
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 129 adds `_build_taxon_hierarchy` and `_assert_no_orphan_taxon_ids` to
`data/sqlite_export.py`, plus hierarchy tests. The `src/bee-atlas.ts` net diff is
trivial (a single `.then(() =>` → `.then(async () =>` change); the temporary
benchmark was reverted and the surviving `[BENCHMARK]` `console.log` at line 939
predates this phase, so it is out of scope.

The Python hierarchy build is the substance of the review. The 14 hierarchy/export
tests pass, but the test fixtures do not exercise the cases that break the logic.
I reproduced **two correctness defects that silently mislabel real bee data** and
that the orphan gate does **not** catch:

1. Anthophila occurrences identified to ranks below species (subspecies / variety /
   form) fall through the PASS 1 rank filter and are inserted as **bycatch**
   (`is_anthophila=0`, `lineage_path=NULL`). iNat observations are routinely
   identified to subspecies, so this will mislabel bees in production.
2. Checklist seed taxa are loaded **without** the `ancestry LIKE '%630955%'` guard
   that the occurrence seed uses. A checklist `canonical_name` that resolves to a
   non-Anthophila (or otherwise off-tree) taxon is inserted as `is_anthophila=1`
   with a malformed `lineage_path = '//'` — and the `//` path slips past the
   missing-parent gate because its segments strip to empty.

Both are demonstrated below with runnable reproductions. The remaining findings are
robustness/maintainability concerns around the over-broad ancestor unnest, the
catch-all checklist exception, nondeterministic dedup, and concurrent SQLite access.

## Critical Issues

### CR-01: Anthophila taxa below species rank are misclassified as bycatch

**File:** `data/sqlite_export.py:192` (PASS 1 rank filter), `:201-217` (PASS 2 bycatch fallthrough)
**Issue:**
The PASS 1 (Anthophila) load restricts to
`rank IN ('family','subfamily','tribe','subtribe','genus','subgenus','complex','species')`.
Any occurrence whose `taxon_id` is an Anthophila taxon at a **finer** rank —
`subspecies`, `variety`, `form`, `infrahybrid`, etc. — does not match PASS 1, so it
is not inserted there. PASS 2 then inserts every occurrence `taxon_id` "NOT already
in out.taxa" with `is_anthophila=0` and `lineage_path=NULL`. The bee subspecies
therefore lands in the bycatch arm and is permanently flagged as a non-bee.

iNat community IDs frequently reach subspecies, and `occurrences.taxon_id` derives
from those IDs, so this is reachable with real data — not a theoretical edge.

Reproduced (subspecies occurrence 999001 under Apis mellifera):
```
(999001, 'subspecies', 'Apis mellifera ligustica', None, 0)   # WRONG: should be is_anthophila=1
```
The orphan gate does **not** catch this: the taxon *is* present in `taxa`, just with
the wrong flag and a NULL lineage, so `_assert_no_orphan_taxon_ids` reports success.

**Fix:** Decide the intended rank handling for sub-species Anthophila and make PASS 1
own them. Either (a) widen the PASS 1 rank list to include sub-species ranks, or
(b) before PASS 2, exclude occurrence taxon_ids whose `taxa.csv.gz` ancestry contains
`/630955` so genuine bees never reach the bycatch arm. Option (b) is the more robust
guard because it does not require enumerating every iNat infraspecific rank:
```python
# PASS 2 — exclude anything that is actually Anthophila (any rank).
WHERE t.taxon_id IN (
    SELECT DISTINCT taxon_id FROM out.occurrences
    WHERE taxon_id IS NOT NULL AND taxon_id NOT IN (SELECT taxon_id FROM out.taxa)
)
AND NOT (t.ancestry LIKE '%/630955/%' OR t.ancestry LIKE '%/630955' OR t.taxon_id = 630955)
```
Whichever path is chosen, add a fixture row at `subspecies` rank under Anthophila and
assert `is_anthophila=1`.

### CR-02: Checklist seed bypasses the Anthophila ancestry guard, producing is_anthophila=1 rows with `lineage_path='//'`

**File:** `data/sqlite_export.py:144-152`
**Issue:**
The occurrence seed (lines 128-141) requires
`t.ancestry LIKE '%/630955/%' OR ... OR t.taxon_id = 630955`. The checklist seed
inserted immediately after (lines 146-152) applies **no such filter** — it accepts
any `taxon_id IN (checklist_ids)`. Those ids flow into `_bee_taxon_ids` and the PASS 1
Anthophila load, which stamps `is_anthophila=1` and builds the lineage via
`regexp_extract(..., '(630955(?:/[0-9]+)*)$', 1)`. When the ancestry does not contain
`630955`, `regexp_extract` returns the empty string and the lineage becomes `'//'`.

Reproduced (checklist `canonical_name='Vespidae'` resolving to non-bee taxon 52747):
```
(52747, 'family', 'Vespidae', '//', 1)   # WRONG: non-bee flagged Anthophila, broken lineage
```
The missing-parent gate (`_assert_no_orphan_taxon_ids` Check 2) does not catch the
`'//'` path: `'//'.strip('/').split('/')` yields `['']`, which is filtered out, so no
violation is reported. The malformed row ships silently and pollutes any
`instr(lineage_path, '/X/')` descendant query.

**Fix:** Apply the same Anthophila ancestry guard to the checklist seed, so off-tree
resolutions are dropped before they reach the Anthophila arm:
```python
con.execute(f"""
    INSERT INTO _bee_seed
    SELECT DISTINCT t.taxon_id
    FROM read_csv(?, {_TAXA_READ_CSV_OPTS}) t
    WHERE t.taxon_id IN ({placeholders})
      AND (t.ancestry LIKE '%/630955/%' OR t.ancestry LIKE '%/630955' OR t.taxon_id = 630955)
      AND t.taxon_id NOT IN (SELECT taxon_id FROM _bee_seed)
""", [str(taxa_path)] + checklist_ids)
```
Separately, harden Check 2 to flag empty/degenerate lineage paths (a `'//'` or any
path not beginning with `/630955/`) as a build error rather than silently passing.

## Warnings

### WR-01: Over-broad ancestor unnest can emit `'//'` lineage paths for taxa above the Anthophila root

**File:** `data/sqlite_export.py:156-166` (expand), `:178-195` (load + regexp)
**Issue:**
`_bee_taxon_ids` unnests the **entire** ancestry string, including ancestors *above*
630955 (Hexapoda, Insecta, order, etc.). Any such ancestor that also satisfies the
PASS 1 rank filter would be inserted with a `regexp_extract`-anchored lineage that
cannot match 630955, yielding `'//'`. Today this is masked only because, in real iNat
data, every taxon above superfamily Anthophila is at kingdom/phylum/class/order rank
and is excluded by the rank list — a coincidence the code relies on implicitly.
Reproduced directly:
```
regexp on ancestry '48460/1/47120/372739/47158/184884/47157' (id 47157) => '//'
```
**Fix:** Constrain the ancestor expansion to descendants of 630955, e.g. only unnest
the suffix of `ancestry` at and after `630955`, or in PASS 1 reject any row whose
constructed lineage does not start with `'/630955/'`. This also removes the silent
dependency on rank-list coincidence that CR-01/CR-02 expose.

### WR-02: Bare `except Exception` silently disables the entire checklist seed on any error

**File:** `data/sqlite_export.py:103-105`
**Issue:**
The checklist arm wraps the second DuckDB connection in `except Exception: ... = []`.
This is intended for "absent in test context," but it also swallows real failures —
schema drift on `inaturalist_data.canonical_to_taxon_id`, a renamed column, a corrupt
`checklist.parquet`, a lock contention error. In all those cases checklist seeds are
silently dropped and the nightly build proceeds with degraded Anthophila coverage,
with no log line and no gate failure (checklist-only taxa are not occurrence taxa, so
the orphan check stays green).
**Fix:** Narrow the catch to the expected "not found" conditions and log a warning so
unexpected failures are visible:
```python
except duckdb.CatalogException:
    checklist_ids = []  # expected in test contexts
except Exception as e:
    print(f"WARNING: checklist seed failed, proceeding without it: {e}")  # noqa: T201
    checklist_ids = []
```

### WR-03: Nondeterministic row selection for duplicate taxon_ids in taxa.csv.gz

**File:** `data/sqlite_export.py:194` and `:216`
**Issue:**
`QUALIFY ROW_NUMBER() OVER (PARTITION BY t.taxon_id ORDER BY t.taxon_id) = 1` orders
by the partition key itself, which is constant within each partition. If
`taxa.csv.gz` ever contains two rows with the same `taxon_id` but differing
`name`/`rank`/`ancestry` (active duplicates, or an active+inactive pair surviving the
filters), the surviving row is chosen arbitrarily and may vary build-to-build. The
`active='true'` filter in PASS 1 mitigates but does not eliminate this; PASS 2 has no
active filter at all.
**Fix:** Order by a meaningful tiebreaker so selection is stable, e.g.
`ORDER BY (t.active = 'true') DESC, t.rank_level ASC` (prefer active, then finest
rank), and document the tiebreak intent.

### WR-04: Concurrent writers to the same SQLite file (DuckDB ATTACH + stdlib sqlite3)

**File:** `data/sqlite_export.py:59-68`, `:117-123`, `:224-230` vs. the live `out` ATTACH (`:327`)
**Issue:**
While DuckDB holds `out` ATTACHed (TYPE sqlite) inside `_build_taxon_hierarchy`, the
function opens the *same* file via stdlib `sqlite3` to `CREATE TABLE taxa` and the
indexes. Two independent handles writing one SQLite file risks `database is locked`
depending on DuckDB's pending transaction / WAL state. The tests pass today, but this
is timing- and version-dependent rather than guaranteed safe.
**Fix:** Prefer doing the DDL through the DuckDB-attached connection where feasible,
or perform all stdlib-sqlite3 DDL after `DETACH out`. If the NOT NULL DDL must precede
the DuckDB inserts, ensure DuckDB has committed/checkpointed before the stdlib handle
writes, and document the ordering contract.

### WR-05: Orphan gate leaves a partial DB and never validates lineage well-formedness

**File:** `data/sqlite_export.py:233-295`, `:339`
**Issue:**
Two robustness gaps in the "hard gate": (a) `_assert_no_orphan_taxon_ids` runs after
the DuckDB connection is closed, so a raise leaves a partial `occurrences.db`
(occurrences + taxa, no `geo_blob`) on disk; the next run unlinks it, but a manual
inspection mid-failure sees a half-built file. (b) Check 2 only flags lineage
*segments* that miss a `taxa` row — it never flags structurally malformed paths
(`'//'`, paths not starting with `/630955/`, see CR-02/WR-01), which are exactly the
defects this phase can produce.
**Fix:** Add a well-formedness assertion to Check 2 (every non-null `lineage_path`
must match `^/630955/(\d+/)*$`), and consider unlinking `dst_db` in an `except` around
the gate so failures never leave a partial artifact.

## Info

### IN-01: SQL built via f-string/`+` interpolation of paths and constants

**File:** `data/sqlite_export.py:327`, `:329`, plus `_TAXA_READ_CSV_OPTS`/`ANTHOPHILA_ID` concatenation at `:132`, `:161`, `:165`, `:190`, `:209`
**Issue:**
`ATTACH '{dst_db}'` and `read_parquet('{src_parquet}')` interpolate `Path` values
straight into SQL, and the read-CSV options / Anthophila id are concatenated into
query strings. Inputs are internal (constants and caller-supplied paths), so there is
no live injection vector, but a path containing a single quote would break the ATTACH.
**Fix:** Where DuckDB supports it, pass paths as bind parameters (the `read_csv(?, ...)`
calls already do this for `taxa_path`); apply the same to `src_parquet`/`dst_db` or at
minimum escape embedded quotes.

### IN-02: Stale `[BENCHMARK]` console.log retained (pre-existing, flagged for cleanup)

**File:** `src/bee-atlas.ts:939`
**Issue:**
A `console.log('[BENCHMARK] data-loaded ...')` with main-thread heap reporting remains
in `_onDataLoaded`. It predates phase 129 (introduced in commit a734b06), so it is not
a regression from this work, but it is debug output shipping in production.
**Fix:** Remove the benchmark log, or gate it behind a dev-only flag.

---

_Reviewed: 2026-06-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
