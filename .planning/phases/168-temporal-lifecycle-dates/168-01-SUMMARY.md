---
phase: 168-temporal-lifecycle-dates
plan: 01
subsystem: database
tags: [dbt, duckdb, occurrences-mart, contract, id_date, temporal]

# Dependency graph
requires:
  - phase: 167-collector-identity-column
    provides: "collector_inat_login column (contract 36→37) + the data-before-code release template this phase mirrors; its 37-col S3 landing is the D-12 gating predecessor"
provides:
  - "id_date VARCHAR column in the occurrences mart (dbt contract 37→38) — the 'Identified' timeline anchor"
  - "ARM 1 (ecdysis) parse of the dirty raw date_identified: year-only + full ISO kept verbatim, garbage → NULL"
  - "assert_id_date_parse_complete warn-severity singular dbt test enforcing parse completeness at every build"
affects: [171-feed-event-stream, 170-source-provenance-facets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-column additive mart change via int_combined 5-arm UNION ALL → occurrences.sql → schema.yml contract bump (Phase 167 template)"
    - "Dirty-date parse with DuckDB regexp_full_match: two byte-identical keep-regexes shared between the ARM-1 parse and its singular test (tautology guarantee — test only fires on a real regression)"

key-files:
  created:
    - "data/dbt/tests/assert_id_date_parse_complete.sql"
  modified:
    - "data/dbt/models/intermediate/int_ecdysis_base.sql"
    - "data/dbt/models/intermediate/int_combined.sql"
    - "data/dbt/models/marts/occurrences.sql"
    - "data/dbt/models/marts/schema.yml"

key-decisions:
  - "Parse date_identified inline in int_combined ARM 1 (not a helper in int_ecdysis_base); base model only projects the raw column"
  - "id_date is VARCHAR keeping year-only partials (D-06); a DATE column would NULL ~26k year-only ecdysis IDs"
  - "ARMs 2-5 emit NULL::VARCHAR AS id_date — explicit cast required for the UNION typecheck (D-08/D-09)"
  - "Singular test at warn severity (D-13), shares the two keep-regexes with the parse so it cannot false-trip on existing data"
  - "sqlite_export.py unedited — id_date carries through via SELECT * from parquet; NOT added to _GEO_COLS (would corrupt the positional geo blob)"

patterns-established:
  - "Shared-regex tautology: parse-completeness singular tests reuse the parse's exact regexes so they only fire on regressions"

requirements-completed: [TEMP-01, TEMP-02]

# Metrics
duration: ~6min
completed: 2026-06-25
---

# Phase 168 Plan 01: Temporal Lifecycle Dates Summary

**Added the `id_date VARCHAR` column to the occurrences mart (dbt contract 37→38) — the "Identified" timeline anchor — parsed only for ARM 1 (ecdysis) from the dirty raw `date_identified` (year-only + full ISO kept verbatim, garbage NULLed), NULL for the other four arms, enforced by a warn-severity parse-completeness singular test.**

## Performance

- **Duration:** ~6 min (autonomous Tasks 1–3)
- **Started:** 2026-06-25T18:39:00Z (approx)
- **Completed (Tasks 1–3):** 2026-06-25T18:45:29Z
- **Tasks:** 3 of 4 complete (Task 4 is an operator-only S3 release checkpoint — NOT executed)
- **Files modified:** 4 (+1 created)

## Accomplishments
- New `id_date VARCHAR` column live in local `occurrences.parquet` and `occurrences.db` (dbt contract enforced at 38 columns).
- ARM 1 ecdysis parse keeps 26,565 real identification dates (year-only + full ISO) verbatim; blank/`s.d.`/garbage map to NULL — no parseable date silently dropped.
- ARMs 2–5 (waba_sample, waba_specimen, inat_obs, checklist) all emit `id_date = NULL` (D-08/D-09); UNION typechecks via explicit `::VARCHAR` casts.
- New `assert_id_date_parse_complete` warn-severity singular test passes (0 dropped parseable dates), sharing the two keep-regexes with the parse.
- TEMP-02 confirmed with no new plumbing: no `specimen_observation_id` spans more than one source; the existing ARM-3 de-dup untouched.
- `id_date` carries through to SQLite with no edit to `sqlite_export.py` and is NOT in `_GEO_COLS`.

## Task Commits

Each autonomous task was committed atomically:

1. **Task 1: assert_id_date_parse_complete singular test** — `bd4618b7` (test)
2. **Task 2: id_date column + contract 37→38** — `f36dec15` (feat)
3. **Task 3: per-arm / TEMP-02 / sqlite validation** — no source changes (validation-only; regenerated the gitignored `public/data/occurrences.db`)

**Plan metadata:** committed after this SUMMARY (docs).

## Files Created/Modified
- `data/dbt/tests/assert_id_date_parse_complete.sql` (created) — warn-severity singular test; ecdysis rows with a parseable raw `date_identified` but NULL mart `id_date` (D-13).
- `data/dbt/models/intermediate/int_ecdysis_base.sql` — projects raw `o.date_identified` so ARM 1 can parse it (21 columns now).
- `data/dbt/models/intermediate/int_combined.sql` — ARM 1 `CASE`/`regexp_full_match` parse → `id_date`; ARMs 2–5 `NULL::VARCHAR AS id_date`.
- `data/dbt/models/marts/occurrences.sql` — `j.id_date` projected as the last column of the final SELECT.
- `data/dbt/models/marts/schema.yml` — `id_date` (varchar) declared as the 38th contract column.

## Decisions Made
- Followed the plan and locked decisions D-01..D-13 exactly. Parse lives inline in ARM 1 (Claude's-discretion choice per D-discretion). Severity `warn` (D-13 / Phase 167 D-06 precedent). `sqlite_export.py` confirmed needs no edit.

## Deviations from Plan

None — plan executed exactly as written. No bugs, missing functionality, or blocking issues encountered through Tasks 1–3.

## Issues Encountered
None. The `bash data/dbt/run.sh build` reported 3 pre-existing warnings (`test_lin05_lineage_coverage`, `test_no_duplicate_occ_ids`, `not_null_occurrences_collector_inat_login_ecdysis_drift` = 2767 drift) — all unrelated to `id_date` and out of scope (logged here, not fixed per scope boundary). The new `assert_id_date_parse_complete` test PASSED (0 rows).

## User Setup Required
None — no external service configuration. (Task 4 is an operator S3-release step, not user service setup; see below.)

## Outstanding: Task 4 — Operator S3 Release (checkpoint, NOT executed)

Task 4 is a `checkpoint:human-action` / `gate="blocking"` operator-only step that runs on the maderas cron host (needs AWS credentials + S3 write + CloudFront invalidation — unavailable to the executor). It was deliberately NOT executed.

**Operator steps:**
1. **D-12 gate check:** confirm the live S3 `occurrences.parquet` already carries `collector_inat_login` (37 cols, Phase 167). Recent commit `69821883 docs(167): mark Phase 167 complete — collector_inat_login live in S3` indicates this landed; confirm before proceeding (STATE.md line 76 is stale and predates that landing).
2. After Task 2's dbt change is committed and pulled onto maderas, run ONE bypass publish:
   `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh`
   (prefix `ECDYSIS_CACHE_TTL_SECONDS=99999999` if the Phase 163 Ecdysis auth issue is still active, to reuse the cached ZIP).
3. Confirm the live S3 `occurrences.parquet` now carries `id_date` (38 columns).
4. Confirm the NEXT normal nightly passes the schema-parity integration gate unaided (38-vs-38, no flag).

No deploy/frontend action — no TypeScript consumes `id_date` yet (Phase 171). The deploy `validate-db` gate is unaffected (it checks table names, not columns).

**Resume signal:** "shipped" once S3 `occurrences.parquet` carries `id_date` (38 cols), Phase 167's 37-col data was live before this run, and the next normal nightly's schema gate passes.

## Next Phase Readiness
- The `id_date` column is ready in the local mart and the dbt contract; once the operator runs the one-time bypass nightly, it is live in S3.
- Phase 171 (feed/event-stream UI) and Phase 170 (provenance facets) can consume `id_date` ("Identified") alongside the existing `date` column ("Collected") once it is live in S3.

## Self-Check: PASSED

- FOUND: data/dbt/tests/assert_id_date_parse_complete.sql
- FOUND: data/dbt/models/intermediate/int_ecdysis_base.sql (modified, committed in f36dec15)
- FOUND: data/dbt/models/intermediate/int_combined.sql (modified, committed in f36dec15)
- FOUND: data/dbt/models/marts/occurrences.sql (modified, committed in f36dec15)
- FOUND: data/dbt/models/marts/schema.yml (modified, committed in f36dec15)
- FOUND commit: bd4618b7 (Task 1, test)
- FOUND commit: f36dec15 (Task 2, feat)

---
*Phase: 168-temporal-lifecycle-dates*
*Completed (Tasks 1–3): 2026-06-25*
