---
phase: 088-production-cutover
requirements: [CUTOVER-02, CUTOVER-04, VALIDATE-02]
recorded: 2026-05-14
verified: 2026-05-14
status: complete
score: 8/8
pre_cutover_sha: 44a967c8db5acd1d06bbae65ba0a1912528bbc57
deferred:
  - "Stale public/data/{samples,ecdysis}.parquet S3 cleanup (RESEARCH OQ2)"
  - "Nightly-run failure notification (Healthchecks.io dead-man's switch — .planning/todos/pending/nightly-run-failure-notification.md)"
---

# Phase 88 — Cutover Log

## Summary

dbt is the sole transform producer. `data/export.py`, `_apply_migrations()`, and
`scripts/validate-schema.mjs` are retired; their invariants are subsumed by the dbt
30-column contract on `marts/occurrences` (enforced at every `dbt build`) and by the
dbt source declarations + staging models that already match the production schema.
`data/nightly.sh` requires no edits: its `set -euo pipefail` + `uv run python run.py`
propagate dbt's exit codes correctly, and its S3 upload lines reference exactly the
three artifacts Wave 2's `_run_dbt_build` now copies into `EXPORT_DIR`. Manual frontend
smoke against the dbt-produced `public/data/occurrences.parquet` is green across all
four UI surfaces.

## Nightly.sh Confirmation (CUTOVER-04)

`data/nightly.sh` requires **NO functional changes** for Phase 88.

Verified invariants (line numbers in current file):

| Invariant | Location | Status |
|-----------|----------|--------|
| `set -euo pipefail` | line 6 | present |
| EXIT trap backs up DuckDB regardless of pipeline outcome | line 24 | present |
| `cd "$SCRIPT_DIR"` before invoking Python | line 40 | present |
| `uv run python run.py` (single entrypoint, no flags that mask errors) | line 41 | present |
| S3 upload loop references exactly `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson` | lines 47-49 | present (matches `_run_dbt_build` artifact list) |
| Feeds dir upload | line 50 (`aws ... "$EXPORT_DIR/feeds/" ...`) | present |
| CloudFront `/data/*` invalidation | lines 55-59 | present |

Anti-pattern checks (all expected absent — none added):

- No `export.py`, `validate-schema`, `_apply_migrations`, `--exclude`, or `--full-refresh`
  references anywhere in the script (`grep -E "export.py|validate-schema|_apply_migrations|--exclude|--full-refresh" data/nightly.sh` → no matches).
- No defensive `--exclude` added — Phase 85 resolved the awkward-fit tests (PASS=44
  WARN=0 ERROR=0 SKIP=0 against live S3-pulled DuckDB; confirmed pre-cutover in
  088-02 Task 1).

Parse check: `bash -n data/nightly.sh` exits 0.

No commit made for this task — nothing to change.

## Migration Mapping (CUTOVER-02)

`_apply_migrations()` was deleted in Wave 2 (commit `b8d0722`). Both branches it
contained are obviated by the dbt project's current source declarations and staging
models — not "replaced", but rendered unnecessary because the production DuckDB
already matches the post-migration schema (renames committed years ago in Phases 47/48)
and dbt would binder-error at compile time if anything diverged.

| Old invariant | What it did | dbt replacement | File:line |
|---------------|-------------|-----------------|-----------|
| Rename `ecdysis_data.occurrence_links.inat_observation_id` → `host_observation_id` (Phase 48) | Ensured the link table column was named `host_observation_id` so that downstream JOINs on the floral-host inat observation_id succeeded | `data/dbt/models/sources.yml:8` declares `ecdysis_data.occurrence_links` as a dbt source; `data/dbt/models/staging/stg_ecdysis__occurrence_links.sql:9` selects `* FROM {{ source('ecdysis_data', 'occurrence_links') }}`; `data/dbt/models/intermediate/int_ecdysis_base.sql:20,29` reference `links.host_observation_id`. If the column were missing or differently named, dbt build fails at compile time with a Binder Error before any row is written. | sources.yml:8; stg_ecdysis__occurrence_links.sql:9; int_ecdysis_base.sql:20,29 |
| Add `geom GEOMETRY` column to `geographies.us_counties`, `geographies.ecoregions`, `geographies.us_states` (Phase 47) | Backfilled a typed `geom` column on the three geographies tables so consumers didn't have to parse `geometry_wkt` at read time | `data/dbt/models/staging/stg_geo__us_counties.sql:9`, `stg_geo__ecoregions.sql:9-13`, `stg_geo__us_states.sql:11` each SELECT `geom` directly from `source('geographies', '*')`. The native `geom GEOMETRY` column is already present in the production DuckDB (backfill applied years ago — comment `-- A3 resolution: native geom GEOMETRY column present (Phase 47 backfill applied)` in all three stg files documents this). `data/dbt/models/sources.yml:31-37` declares the three geographies tables as dbt sources. If the column were missing, dbt build fails at compile time. Migration is **OBVIATED**, not replaced. | sources.yml:31-37; stg_geo__us_counties.sql:9; stg_geo__ecoregions.sql:9-13; stg_geo__us_states.sql:11 |

Net effect: `_apply_migrations` is deleted with zero invariant loss. Both branches
have been dead code in production for years; dbt's source contract makes any future
schema regression loud at compile time rather than silently rescuing a stale DB.

## Smoke Check (VALIDATE-02)

**Date:** 2026-05-14
**Verifier:** rainhead (project owner)
**Result:** approved

- [x] **Map renders** — Mapbox canvas + WA outline + ~47k specimen markers visible against dbt-produced `public/data/occurrences.parquet` (30 cols)
- [x] **Filters work** — Toggle taxon / county / year filter; specimen count badge updates; map markers refresh
- [x] **Table populates** — Drawer slides up with ~47k rows; row click pans map strip
- [x] **Species page** — `/species/` renders species list; clicking a species shows seasonality chart + county map from `species.json` + `seasonality.json`

Zero console errors reported.

### Assertive parquet schema check

```
cd data && uv run pytest tests/test_dbt_diff.py::test_occurrences_schema_matches -x
```

**Exit code:** 0 (`1 passed in 0.65s`)

This test was the residual FAIL in pre-cutover dbt-diff harness (33-col on-disk
parquet vs. 30-col sandbox parquet). Post Wave-2 it asserts byte-parity between the
sandbox mart and the published `public/data/occurrences.parquet`. PASS confirms the
frontend is loading the 30-col dbt-produced artifact, end-to-end.

## Validation

| Check | Command | Status |
|-------|---------|--------|
| `data/nightly.sh` parses | `bash -n data/nightly.sh` | exit 0 |
| `set -euo pipefail` present | `grep -q "set -euo pipefail" data/nightly.sh` | exit 0 |
| `uv run python run.py` present | `grep -q "uv run python run.py" data/nightly.sh` | exit 0 |
| Three S3 artifacts referenced | `grep -E "occurrences\.parquet\|counties\.geojson\|ecoregions\.geojson" data/nightly.sh` | matches all three (line 47) |
| No stale references | `! grep -qE "export.py\|validate-schema\|_apply_migrations\|--exclude\|--full-refresh" data/nightly.sh` | exit 0 |
| Feeds upload preserved | `grep -q '"\$EXPORT_DIR/feeds/"' data/nightly.sh` | exit 0 (line 50) |
| Smoke parquet schema | `cd data && uv run pytest tests/test_dbt_diff.py::test_occurrences_schema_matches -x` | exit 0 (1 passed) |

## Out of Scope

Per RESEARCH § Open Questions 2:

- Stale `public/data/samples.parquet` and `public/data/ecdysis.parquet` (pre-v3.0
  artifacts) remain on S3; not consumed by the current frontend. Cleanup is OUT OF
  SCOPE for Phase 88 — captured as a deferred follow-on (see frontmatter `deferred`).
- `scripts/fetch-data.sh` lists the stale files in its dev-sync — also out of scope.
- Nightly-run failure notification (Healthchecks.io dead-man's switch) tracked at
  `.planning/todos/pending/nightly-run-failure-notification.md` — natural follow-on
  now that nightly.sh's exit semantics are settled.
- First post-cutover production nightly on maderas should be observed to confirm
  S3 receives the fresh 30-col parquet and CloudFront serves it (RESEARCH § Pitfall 3).

## Rollback

**Pre-cutover SHA:** `44a967c8db5acd1d06bbae65ba0a1912528bbc57`
(captured in `.planning/phases/088-production-cutover/pre-cutover-sha.txt` during
Wave 1 Task 1, before any deletion landed).

Phase 88 is structured for single-commit revertability. Two equivalent procedures:

```bash
# Option A: revert the merge commit of the phase
git revert <merge-commit-of-088-branch>

# Option B: working-tree-only rewind of the affected files
git checkout 44a967c -- data/run.py data/export.py scripts/validate-schema.mjs \
                       package.json .github/workflows/deploy.yml CLAUDE.md
```

The active execution path (`data/nightly.sh` on maderas cron) picks up the reverted
`run.py` automatically on the next nightly run; no separate deploy step required.

---

*Phase 88 cutover documented 2026-05-14. CUTOVER-02 + CUTOVER-04 + VALIDATE-02 closed.*
