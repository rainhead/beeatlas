---
phase: 077-lineage-coverage-expansion
plan: 01
subsystem: testing

tags: [pytest, duckdb, fixtures, conftest, lineage]

requires:
  - phase: 076-canonicalize-and-bartholomew
    provides: existing _zero_inat_pacing autouse fixture and Phase 76 seed rows
provides:
  - canonical_to_taxon_id bridge table DDL in conftest fixtures
  - 20-row LIN-05 coverage fixture (19 resolvable, 1 unresolved)
  - resolve_taxon_ids module-aware _zero_inat_pacing autouse extension
affects:
  - 077-02 (resolve_taxon_ids module — UPSERT and rank ladder tests)
  - 077-03 (LIN-05 ≥95% threshold assertion + run.py STEPS reorder tests)

tech-stack:
  added: []
  patterns:
    - "Bridge table DDL inside _create_tables (analog to taxon_lineage_extended)"
    - "Multi-row INSERT VALUES seed appended to _seed_data with explicit column lists"
    - "Layered try/except ImportError fixture extension (forward-compat for un-shipped modules)"

key-files:
  created: []
  modified:
    - data/tests/conftest.py

key-decisions:
  - "Skip 'Lasioglossum zonulum' from new checklist INSERT to avoid scientificName PRIMARY KEY conflict with existing Phase 76 seed; existing row already supplies that canonical_name"
  - "Trim plan's 11-row occurrences seed to 8 rows (drop apis mellifera and bombus terrestris) so the union of canonical_names is exactly 20 once the 3 existing seed names are accounted for"
  - "Use new taxon_ids 200001..200019 (not 100001/100002) for the LIN-05 lineage rows so the fixture is self-contained and does not commingle with existing waba_data taxon_lineage rows"

patterns-established:
  - "When a new pipeline module is referenced by an autouse fixture but does not yet exist, wrap import in try/except ImportError: pass so the fixture is a no-op until the module ships"
  - "LIN-05 coverage assertions can be backed deterministically by a 20-name union with an explicit unresolved 'zzzzz nonexistensia' row that mirrors a real iNat 404"

requirements-completed: [LIN-01, LIN-05]

duration: 6min
completed: 2026-05-04
---

# Phase 077 Plan 01: Bridge Table & LIN-05 Fixture Scaffolding Summary

**Adds `inaturalist_data.canonical_to_taxon_id` DDL, a 20-row union fixture (19 resolvable + 1 iNat-404-style unresolvable, coverage = 0.95 exactly), and a forward-compatible `_zero_inat_pacing` extension to `data/tests/conftest.py`.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-04T04:39:02Z
- **Completed:** 2026-05-04T04:44:54Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Phase 76 fixtures untouched; all 84 existing tests still pass (no regression).
- LIN-05 coverage SQL — `count(*) FILTER (WHERE tle.family IS NOT NULL) * 1.0 / count(*)` over the FULL OUTER union of canonical_names — returns exactly `0.95` against the seeded fixture, ready for plan 03's `assert coverage >= 0.95` threshold check.
- `_zero_inat_pacing` will transparently zero pacing for `resolve_taxon_ids` once plan 02 lands the module — no per-test setup required.

## Task Commits

1. **Task 1: Add canonical_to_taxon_id bridge table DDL** — `8295ce0` (feat)
2. **Task 2: Seed 20-row LIN-05 coverage fixture** — `58352da` (feat)
3. **Task 3: Extend _zero_inat_pacing autouse to also patch resolve_taxon_ids** — `da581d4` (feat)

## Edit Locations (final line numbers in `data/tests/conftest.py`)

| Edit | Lines | Description |
|------|-------|-------------|
| Bridge DDL inside `_create_tables` | 146–152 | `CREATE TABLE inaturalist_data.canonical_to_taxon_id` (immediately after `taxon_lineage_extended` DDL) |
| Checklist seed extension | 392–411 | 14-row `INSERT INTO checklist_data.species` (skips 'lasioglossum zonulum' — see Deviations) |
| Occurrences seed extension | 425–435 | 8-row `INSERT INTO ecdysis_data.occurrences` |
| Bridge seed (NEW) | 443–466 | 19-row `INSERT INTO inaturalist_data.canonical_to_taxon_id` |
| Lineage seed extension | 469–489 | 19 new rows (taxon_ids 200001..200019) appended to `inaturalist_data.taxon_lineage_extended` |
| `_zero_inat_pacing` extension | 525–535 | New `try: import resolve_taxon_ids; ... except ImportError: pass` block |

## Verification one-liner (copy-pasteable)

Confirms 20 distinct canonical_names in the union and exactly 0.95 coverage against the seeded fixture:

```bash
cd data && uv run python -c "
import duckdb, sys
sys.path.insert(0, '.')
from tests.conftest import _create_schemas, _create_tables, _seed_data
con = duckdb.connect(':memory:')
con.execute('INSTALL spatial; LOAD spatial;')
_create_schemas(con); _create_tables(con); _seed_data(con)
print('union:', con.execute('''
    SELECT count(*) FROM (
        SELECT DISTINCT canonical_name FROM checklist_data.species WHERE canonical_name IS NOT NULL
        UNION
        SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences WHERE canonical_name IS NOT NULL
    )
''').fetchone()[0])
print('coverage:', con.execute('''
    SELECT count(*) FILTER (WHERE tle.family IS NOT NULL) * 1.0 / count(*)
    FROM (
        SELECT DISTINCT canonical_name FROM checklist_data.species WHERE canonical_name IS NOT NULL
        UNION
        SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences WHERE canonical_name IS NOT NULL
    ) u
    LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
    LEFT JOIN inaturalist_data.taxon_lineage_extended tle ON tle.taxon_id = b.taxon_id
''').fetchone()[0])
"
# Expected output:
# union: 20
# coverage: 0.95
```

## Files Created/Modified

- `data/tests/conftest.py` — Added bridge table DDL, four new INSERT blocks (checklist, occurrences, bridge, lineage), and a try/except ImportError extension to `_zero_inat_pacing`.

## Decisions Made

- **Use existing seed rows where they overlap with planned canonical_names.** The Phase 76 seed already contributes `'lasioglossum zonulum'`, `'andrena fulva'`, and `'bombus melanopygus'` to the union. Re-inserting `'Lasioglossum zonulum'` into `checklist_data.species` would PK-conflict on `scientificName`, so the new INSERT omits it; the existing row already supplies that canonical_name to the union and is bridged to taxon_id 200001.
- **Trim occurrence-only names to keep union at 20.** The plan asked for 11 occurrence rows including `apis mellifera` and `bombus terrestris`. Keeping all of them would push the distinct union to 22. Dropping those two gives exactly 20, matching the LIN-05 fixture spec.
- **Use disjoint taxon_id range (200001..200019).** Existing fixtures use 100001/100002 via the waba taxon_lineage table. Keeping the new lineage rows in 200001..200019 prevents accidental coupling between LIN-05 fixture rows and Phase 76 disagreement fixtures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] checklist_data.species PK conflict on scientificName**
- **Found during:** Task 2 setup (before writing edit).
- **Issue:** Plan's Step 2a INSERT included `('lasioglossum zonulum', 'Lasioglossum zonulum', ...)`, but the existing Phase 76 seed at line 305 already inserts `scientificName='Lasioglossum zonulum'` and the table declares `scientificName VARCHAR PRIMARY KEY`. Inserting again would raise a constraint error and break every test.
- **Fix:** Dropped that row from the new INSERT (now 14 rows instead of 15). Existing seed already supplies `canonical_name='lasioglossum zonulum'` to the union, and it's bridged via the new bridge seed (taxon_id 200001) so the LIN-05 math still holds.
- **Files modified:** `data/tests/conftest.py`
- **Verification:** Existing 84 tests still pass; coverage SQL returns 0.95.
- **Committed in:** `58352da` (Task 2 commit).

**2. [Rule 1 - Bug] Plan's union math overshot 20**
- **Found during:** Task 2 design.
- **Issue:** The plan's Step 2a/2b combination (15 + 11 with 5 shared) plus the 3 names already in the existing seed produced a union of 22 distinct canonical_names, not the spec'd 20. The plan called the math out as "(15 + 11 − 5 shared − 1 NULL filter = 20)", which doesn't hold once the existing seed contributes its 3 names.
- **Fix:** Reduced the new occurrence-only rows from 6 (5 net-new + zzzzz) to 3 (`osmia californica`, `xylocopa virginica`, `zzzzz nonexistensia`); dropped `apis mellifera` and `bombus terrestris`. The shared occurrence rows that duplicate canonical_names already in checklist (`bombus impatiens`, `osmia lignaria`, `lasioglossum zonulum`, `megachile rotundata`, `halictus ligatus`) remain in the new seed. Final union: 3 (existing) + 14 (new checklist) + 3 (new occurrence-only) = 20 distinct.
- **Files modified:** `data/tests/conftest.py`
- **Verification:** `SELECT count(*) FROM (... UNION ...)` returns exactly 20.
- **Committed in:** `58352da` (Task 2 commit).

**3. [Rule 1 - Bug] Plan's INSERT column list mismatched checklist_data.species schema**
- **Found during:** Task 2 (writing the INSERT).
- **Issue:** Plan's Step 2a INSERT used columns `(canonical_name, scientific_name, status, family, subfamily, tribe, genus, subgenus, specific_epithet)`. The actual table created in `_create_tables` (line 116) uses `(scientificName, family, subfamily, tribe, genus, subgenus, specific_epithet, status, source_citation, notes, canonical_name)` — the column is `scientificName` (camelCase) not `scientific_name`, there's no `scientific_name` column, and `source_citation` and `notes` exist.
- **Fix:** Rewrote the INSERT with an explicit column list matching the actual schema; supplied `NULL` for `source_citation` and `notes`.
- **Files modified:** `data/tests/conftest.py`
- **Verification:** INSERT executes without column-name errors; tests pass.
- **Committed in:** `58352da` (Task 2 commit).

**4. [Rule 1 - Bug] Plan's INSERT column list mismatched ecdysis_data.occurrences schema**
- **Found during:** Task 2.
- **Issue:** Plan's Step 2b INSERT used `(canonical_name, scientific_name)`. The table has `scientific_name VARCHAR` (snake_case) but also has many other columns; supplying only those two would still work (others default NULL), except `id`, `_dlt_load_id`, `_dlt_id` are routinely populated in the existing seed for joins/dedup. The plan acknowledged this and said "adapt the column list".
- **Fix:** Used `(id, scientific_name, canonical_name, _dlt_load_id, _dlt_id)` with deterministic LIN05-NN ids and `load-lin05` load id.
- **Files modified:** `data/tests/conftest.py`
- **Verification:** Tests pass; no collisions with existing `id` values.
- **Committed in:** `58352da` (Task 2 commit).

---

**Total deviations:** 4 auto-fixed (1 blocking schema-conflict, 1 union-math fix, 2 column-list adaptations the plan explicitly invited)
**Impact on plan:** All four deviations preserve the load-bearing outcome (20-name union, 0.95 coverage, 19 bridge rows, untouched Phase 76 fixtures). Zero scope creep.

## Issues Encountered

None — once the schema mismatches were identified up front, edits proceeded straight through.

## User Setup Required

None — pure test-scaffolding plan.

## Next Phase Readiness

- Plan 02 can `from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS` and write tests against `inaturalist_data.canonical_to_taxon_id` without further conftest setup.
- Plan 03's LIN-05 threshold assertion (`assert coverage >= 0.95`) is backed by a deterministic fixture that returns exactly 0.95 — no flake.
- The autouse `_zero_inat_pacing` will transparently apply zero pacing to the new module the moment plan 02 ships `data/resolve_taxon_ids.py`.

## Self-Check: PASSED

- File `data/tests/conftest.py` exists and is modified (verified).
- Commits exist on main:
  - `8295ce0` — Task 1 bridge DDL
  - `58352da` — Task 2 LIN-05 fixture
  - `da581d4` — Task 3 _zero_inat_pacing extension
- All 84 existing tests pass (`cd data && uv run pytest tests/ -x`).
- Coverage SQL returns exactly `0.95` against the seeded fixture.
- Distinct union count = 20.
- Bridge row count = 19.

---
*Phase: 077-lineage-coverage-expansion*
*Completed: 2026-05-04*
