---
phase: 128-occurrence-finest-rank-taxon-backfill
plan: 01
subsystem: database
tags: [dbt, duckdb, taxon_id, inaturalist, taxonomy, genus-backfill]

requires:
  - phase: 126-taxon-ids
    provides: species-level occurrences.taxon_id + canonical_to_taxon_id bridge + 37-col contract
  - phase: 127-inactive-taxon-remapping
    provides: int_synonyms remapping path feeding int_combined's 3 ARMs
provides:
  - "occurrences.taxon_id backfilled for every single-token (genus) named row via genus self-row taxon_id"
  - "stg_inat__genus_taxon_ids staging model (Animalia genus map from taxa.csv.gz)"
  - "re-scoped TID-02 not_null + consistency tests (every named row, not just species-level)"
affects: [milestone-v4.5-close, frontend-taxon-links]

tech-stack:
  added: []
  patterns:
    - "dbt staging model reading a raw .csv.gz directly via DuckDB read_csv (first such model in repo)"
    - "cross-phylum homonym dedup-by-exclusion (HAVING COUNT(*)=1) keeping the join key unique + fail-safe"

key-files:
  created:
    - data/dbt/models/staging/stg_inat__genus_taxon_ids.sql
  modified:
    - data/dbt/models/staging/schema.yml
    - data/dbt/models/intermediate/int_combined.sql
    - data/dbt/models/marts/schema.yml
    - data/tests/test_dbt_scaffold.py

key-decisions:
  - "Genus disambiguation by kingdom = Animalia (ancestry contains taxon 1), not Anthophila — non-bee aculeates (wasps/flies) resolve to their real genus taxon"
  - "Exclude the 58 cross-phylum animal-genus homonyms (HAVING COUNT(*)=1) so genus_name is genuinely unique and the LEFT JOIN cannot fan out; 0 of our 149 genera are affected"
  - "Per-ARM COALESCE(<bridge>.taxon_id, g.taxon_id) guarded by taxon_id IS NULL + single-token detection — never overrides a species taxon_id"
  - "not_null test re-scoped to every named row, kept severity: warn; consistency test scoped to species-level (D-06)"

patterns-established:
  - "Raw-CSV-in-model: read_csv('../raw/taxa.csv.gz', delim=chr(9), header, compression='gzip', explicit columns) at build time (CWD=data/dbt)"
  - "Homonym fail-safe: ambiguous keys are dropped from the map, not arbitrarily picked, so an unresolvable future collision surfaces as NULL rather than a wrong link"

requirements-completed: [TID-02]

duration: ~12min
completed: 2026-06-01
---

# Phase 128 Plan 01: Occurrence Finest-Rank Taxon Backfill Summary

**Backfilled `occurrences.taxon_id` for all 12,674 single-token genus rows (149 distinct genera, bee AND non-bee aculeate) from an Animalia-disambiguated genus map read directly out of `taxa.csv.gz`, dropping whole-column NULL taxon_id from 34,354 to 21,680 with the 37-column contract intact and re-scoped TID-02 tests green.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-01T20:01:23Z
- **Completed:** 2026-06-01T20:10:00Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- New `stg_inat__genus_taxon_ids` staging model surfaces active Animalia genus self-rows (`genus_name` lowercase → `taxon_id` INTEGER) directly from the raw `taxa.csv.gz` dump — the first dbt model in the repo that reads a raw CSV instead of wrapping a `source()`.
- All 3 `int_combined` ARMs now `COALESCE(<bridge>.taxon_id, genus.taxon_id)`, guarded so genus backfill fires only for single-token names with no existing species taxon_id.
- TID-02 closed: every named occurrence row (genus or species) carries its finest-rank taxon_id; only no-name rows + the 3 unresolvable ecdysis species remain NULL.
- `unique` + `not_null` dbt tests on `genus_name` give a fail-loud safety net against future homonym fan-out.

## Backfill Numbers (sandbox rebuild, verified against `dbt/target/sandbox/occurrences.parquet`)

| Metric | Before (public, pre-128) | After (sandbox, post-128) |
|--------|-------------------------:|--------------------------:|
| Whole-column NULL `taxon_id` | 34,354 | **21,680** |
| Single-token (genus) named rows with NULL `taxon_id` | 12,674 | **0** |
| Genus rows backfilled (NULL → non-null) | — | **12,674** (149 distinct genera) |
| Total single-token rows now carrying a taxon_id | — | 25,606 (12,674 newly backfilled + ~12,932 already resolved via the bridge) |

Residual 21,680 NULLs = truly-unidentified no-name rows + the 3 unresolvable species (`anthidiellum robertsoni`, `lasioglossum aspilurus`, `osmia phaceliae`) — all by design.

Spot-checks (Animalia disambiguation): stelis→127831 (bee, not orchid 141523), lasioglossum→57678, bembix→53067 (non-bee aculeate), ammophila→83951, cerceris→81959, crabro→56808. `taxon_id` dtype = INTEGER; column count = 37.

## Task Commits

1. **Task 1: genus staging model + re-scope both taxon_id tests** — `d2cee7a` (feat)
2. **Task 2: per-ARM genus COALESCE in int_combined** — `92216a0` (feat)
3. **Task 3: build/test/verify + homonym dedup fix** — `8b3a57e` (fix)

## Files Created/Modified
- `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql` (created) — Animalia genus map from `taxa.csv.gz`, deduped by genus_name.
- `data/dbt/models/staging/schema.yml` — `unique` + `not_null` data_tests on `genus_name` (D-02b).
- `data/dbt/models/intermediate/int_combined.sql` — 3 LEFT JOINs (`g_e`/`g_w`/`g_io`) + COALESCE at each ARM's existing taxon_id position.
- `data/dbt/models/marts/schema.yml` — re-scoped occurrences `taxon_id` not_null `where:` (every named row minus 3 species), kept `severity: warn`.
- `data/tests/test_dbt_scaffold.py` — re-scoped `test_occurrences_taxon_id_non_null` (named-row semantics, no `_NON_BEE_GENERA`), scoped `test_taxon_id_consistency` to species-level (D-06).

## Decisions Made
Followed the plan as specified for genus sourcing (Animalia, no `_NON_BEE_GENERA`, no `630955`), per-ARM COALESCE placement, and test re-scoping. The pre-resolved "69 non-genus names stay NULL" concern was confirmed a non-issue (those rows already carry bridge taxon_ids; the COALESCE only fires on `taxon_id IS NULL`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cross-phylum homonym dedup so genus_name is unique**
- **Found during:** Task 3 (first full build)
- **Issue:** The plan's model emitted all active Animalia genera, but within Animalia 58 genus names are shared across animal phyla (e.g. an insect vs. a different-phylum *Taracticus*). The blanket D-02b `unique` test on `genus_name` failed with 58 duplicates, and those duplicate rows would fan out the int_combined LEFT JOIN for any matching occurrence.
- **Fix:** Added `GROUP BY genus_name HAVING COUNT(*) = 1` (dedup-by-exclusion) to the staging model. Verified 0 of our 149 occurrence genera are among the 58, so no resolution is lost; all required spot-checks still resolve correctly. This is the fail-safe D-02b intended — an ambiguous name is dropped (→ surfaced NULL) rather than silently picking the wrong taxon.
- **Files modified:** `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql`
- **Verification:** `unique_stg_inat__genus_taxon_ids_genus_name` PASS; build PASS=61/ERROR=0; backfill spot-checks correct.
- **Committed in:** `8b3a57e` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug). **Impact:** Necessary for the build to pass and for the LEFT JOIN to be safe; tightens (not loosens) correctness. No scope creep — the model still emits the full Animalia genus map minus genuinely-ambiguous names.

## Issues Encountered

**dbt-duckdb seed-path resolution requires an absolute `DB_PATH` (pre-existing, NOT caused by this plan).**
`bash data/dbt/run.sh build` with the default relative `DB_PATH` (`../beeatlas.duckdb`) fails the two seeds with `IO Error: No files found that match the pattern "dbt/seeds/*.csv"`. dbt-duckdb resolves seed CSV paths relative to the DuckDB file's directory; with run.sh's CWD=`data/dbt` and a relative DB path the base is miscomputed. The nightly avoids this because it sets an **absolute** `DB_PATH=/tmp/beeatlas.duckdb`. The build was therefore validated with `DB_PATH=/home/peter/dev/beeatlas/data/beeatlas.duckdb bash data/dbt/run.sh build`, which is equivalent to the nightly invocation and produced a clean **PASS=61, ERROR=0** (one pre-existing `test_lin05_lineage_coverage` `severity: warn`, unrelated to taxon_id). This seed-path/`run.sh` ergonomics gap is logged to `deferred-items.md` — it is environmental and out of scope for TID-02. I did NOT modify `run.sh`, `profiles.yml`, or any seed file.

## Known Stubs
None.

## Threat Flags
None — no new network/auth/file-access/trust-boundary surface (read-only build-time read of an already-ingested local taxa dump). T-128-01/02/03 mitigations all in place (Animalia filter, genus_name unique test, COALESCE guards).

## TDD Gate Compliance
N/A — plan type `execute`, not `tdd`.

## User Setup Required
None.

## Next Phase Readiness
- TID-02 (re-scoped) satisfied — this was the final v4.5 milestone blocker. `/gsd:complete-milestone v4.5` can be re-run after verification.
- The `data/dbt/run.sh` seed-path-needs-absolute-DB_PATH gap is deferred (see `deferred-items.md`); local-dev rebuilds should pass an absolute `DB_PATH` until that ergonomics fix lands.

## Self-Check: PASSED

- `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql` — FOUND
- `128-01-SUMMARY.md` — FOUND
- Commits `d2cee7a`, `92216a0`, `8b3a57e` — all FOUND in git log

---
*Phase: 128-occurrence-finest-rank-taxon-backfill*
*Completed: 2026-06-01*
