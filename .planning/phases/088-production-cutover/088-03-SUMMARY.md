---
phase: 088-production-cutover
plan: 03
subsystem: infra
tags: [cutover-log, nightly-confirmation, smoke-check, dbt-contract, phase-close]

# Dependency graph
requires:
  - phase: 088
    plan: 01
    provides: validate-schema.mjs retired; pre-cutover SHA 44a967c captured; dbt 30-col contract is canonical schema gate
  - phase: 088
    plan: 02
    provides: data/run.py uses _run_dbt_build STEPS entry; _apply_migrations + data/export.py deleted; test_occurrences_schema_matches passes post-cutover
provides:
  - 088-CUTOVER-LOG.md (CUTOVER-02 migration → dbt mapping; CUTOVER-04 nightly confirmation; VALIDATE-02 smoke sign-off)
  - Phase 88 close: v3.4 dbt Full Rewrite milestone SHIPPED
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cutover log with explicit migration → dbt replacement table (cited by file:line) — pattern reusable for any future deprecation of Python transform code in favor of dbt"
    - "Smoke check sign-off block with checked-behavior list (4 UI surfaces) + assertive automated companion (test_occurrences_schema_matches PASS) — covers both manual UX confirmation and parquet-schema parity in one record"

key-files:
  created:
    - .planning/phases/088-production-cutover/088-CUTOVER-LOG.md
  modified: []
  deleted: []

key-decisions:
  - "Cited the actual stg_geo__*.sql state (`SELECT geom` against native typed column) rather than RESEARCH's speculative `ST_GeomFromText(geometry_wkt) AS geom` — the Phase 47 backfill is fully landed in the production DuckDB; the source comment `-- A3 resolution: native geom GEOMETRY column present` confirms this. Documented both possibilities in the CUTOVER-LOG so future archaeology has the truth."
  - "Stale public/data/{samples,ecdysis}.parquet S3 cleanup formally deferred — captured in CUTOVER-LOG frontmatter `deferred` list, not turned into a new todos/pending/ file in this plan to keep the wave scope tight"

patterns-established:
  - "Phase-close cutover log shape: frontmatter status/score/deferred + ## Summary + ## {Confirmation,Mapping,Smoke,Validation,Out of Scope,Rollback} — reusable for Phase 89+ retirement/cutover phases"

requirements-completed: [CUTOVER-04, VALIDATE-02]

# Metrics
duration: 4min
completed: 2026-05-14
---

# Phase 088 Plan 03: Nightly.sh Confirmation + Smoke Sign-off + Cutover Log Summary

**Closed out Phase 88 by confirming `data/nightly.sh` requires no edits (all invariants for dbt exit-code propagation + 3-artifact S3 upload already in place), recording the user's `approved — all 4 surfaces green` smoke check, and writing `088-CUTOVER-LOG.md` with the CUTOVER-02 migration → dbt mapping (cited by file:line), the VALIDATE-02 sign-off, the CUTOVER-04 no-op confirmation, and the single-commit rollback procedure pinned at SHA `44a967c`.**

## Performance

- **Duration:** ~4 minutes
- **Started:** 2026-05-14 (resumed after human-verify checkpoint)
- **Completed:** 2026-05-14
- **Tasks:** 3 + 1 optional (Task 1 no-edit confirmation; Task 2 human-verify; Task 3 cutover log; Task 4 assertive schema test)
- **Files changed:** 1 created, 0 modified
- **Commits:** 1 (`3fb9333` — docs commit for the cutover log; Task 1 = no commit, Task 2 = sign-off only, Task 4 = read-only test)

## Accomplishments

### Task 1: Nightly.sh confirmation (CUTOVER-04)

`data/nightly.sh` was read in full and confirmed unchanged. All invariants intact:

- Line 6: `set -euo pipefail`
- Line 24: EXIT trap backs up DuckDB regardless of pipeline outcome
- Line 40-41: `cd "$SCRIPT_DIR"` + `uv run python run.py` (single Python entrypoint, no flags)
- Lines 47-49: S3 upload loop references exactly `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson` (matches Wave 2's `_run_dbt_build` artifact list)
- Line 50: `aws ... "$EXPORT_DIR/feeds/" ...` preserved
- Lines 55-59: CloudFront `/data/*` invalidation preserved

Anti-pattern grep `grep -E "export.py|validate-schema|_apply_migrations|--exclude|--full-refresh" data/nightly.sh` returned no matches — no defensive exclusions, no stale references.

`bash -n data/nightly.sh` exits 0.

**No commit made** for this task — nothing to change. Outcome documented in the CUTOVER-LOG's `## Nightly.sh Confirmation (CUTOVER-04)` section.

### Task 2: Manual frontend smoke check (VALIDATE-02)

Checkpoint emitted in prior session; user response `approved` returned in this session. All four surfaces green against the dbt-produced 30-col `public/data/occurrences.parquet`:

- Map renders (~47k specimen markers on WA outline)
- Filters work (count badge + markers update)
- Table populates (~47k rows; row click pans map)
- Species page works (seasonality + county map render from species.json/seasonality.json)

Zero console errors. Sign-off recorded verbatim in the CUTOVER-LOG's `## Smoke Check (VALIDATE-02)` section.

### Task 3: 088-CUTOVER-LOG.md written

Created `.planning/phases/088-production-cutover/088-CUTOVER-LOG.md` with all six required sections:

| Section | Purpose |
|---------|---------|
| `## Summary` | 1-paragraph close: dbt is sole transform producer; all three retired components subsumed by dbt contract |
| `## Nightly.sh Confirmation (CUTOVER-04)` | Line-by-line invariant audit; bash -n exit 0; anti-pattern grep negative |
| `## Migration Mapping (CUTOVER-02)` | 2-row table mapping each `_apply_migrations` branch to its dbt obviator with `file:line` citations |
| `## Smoke Check (VALIDATE-02)` | Date + verifier + result + 4 `- [x]` checked behaviors + assertive test exit code |
| `## Validation` | 7-row table of automated checks (parse, greps, pytest) with exit codes |
| `## Out of Scope` | Stale public/data/{samples,ecdysis}.parquet cleanup + dead-man's switch deferral |
| `## Rollback` | Pre-cutover SHA `44a967c` + two equivalent revert procedures |

Structural verification post-write:
- `## Migration Mapping` present ✓
- `## Smoke Check` present ✓
- `host_observation_id` mentioned ✓
- `geom GEOMETRY` mentioned ✓ (cited the actual staging-file state, plus the obviated `ST_GeomFromText` historical pattern from the comments)
- 4 `- [x]` checked behaviors ✓

Committed: `3fb9333` (`docs(088-03): cutover log — migration mapping + smoke sign-off (CUTOVER-02, CUTOVER-04, VALIDATE-02)`).

### Task 4: Assertive parquet schema test

```bash
cd data && uv run pytest tests/test_dbt_diff.py::test_occurrences_schema_matches -x
```

**Exit code:** 0 (`1 passed in 0.65s`)

This was the residual FAIL in pre-cutover dbt-diff harness (33-col on-disk parquet vs. 30-col dbt sandbox). Post Wave-2 the on-disk parquet IS the dbt sandbox artifact, so this asserts schema parity end-to-end. Recorded in CUTOVER-LOG `## Smoke Check` + `## Validation` sections.

## Task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Nightly.sh confirmation (no edits required) | — (no commit) |
| 2 | Manual smoke check sign-off | — (no commit; sign-off recorded in CUTOVER-LOG) |
| 3 | Write 088-CUTOVER-LOG.md | `3fb9333` |
| 4 | Assertive `test_occurrences_schema_matches` (exit 0, read-only) | — (no commit) |

## Decisions Made

- **Cited the actual stg_geo__*.sql state in the migration mapping.** RESEARCH speculated `stg_geo__*.sql` would use `ST_GeomFromText(geometry_wkt) AS geom`, but the live files SELECT `geom` directly from the source — the Phase 47 backfill is fully landed in the production DuckDB. The CUTOVER-LOG cites the actual file state with file:line refs, and notes the `-- A3 resolution: native geom GEOMETRY column present (Phase 47 backfill applied)` comment in all three stg files as documentation that the migration is obviated, not merely replaced.
- **Deferred stale-public-data-cleanup todo creation.** Rather than creating `.planning/todos/pending/stale-public-data-cleanup.md` in this plan, the deferral is captured in the CUTOVER-LOG frontmatter `deferred:` list. Keeps Wave 3 scope tight; the cleanup task can be filed as a quick-task whenever the operator next sweeps S3.

## Deviations from Plan

None. Plan executed exactly as written; all acceptance criteria met.

## Issues Encountered

None.

## User Setup Required

None — Phase 88 is now ready for `/gsd-verify-work` and v3.4 milestone close.

## Cross-References

- Wave 1 (088-01): `.planning/phases/088-production-cutover/088-01-SUMMARY.md` — validate-schema.mjs retirement, pre-cutover SHA capture
- Wave 2 (088-02): `.planning/phases/088-production-cutover/088-02-SUMMARY.md` — run.py rewrite, export.py + _apply_migrations deletion, dbt-diff harness fix
- Cutover log: `.planning/phases/088-production-cutover/088-CUTOVER-LOG.md` — the consolidated CUTOVER-02 + CUTOVER-04 + VALIDATE-02 deliverable

## v3.4 Milestone Status

Phase 88 (Production Cutover) is **COMPLETE**. All five Phase 88 requirements closed:

- CUTOVER-01 (run.py invokes dbt build) — Wave 2
- CUTOVER-02 (`_apply_migrations` retired with mapping documented) — Wave 2 (deletion) + Wave 3 (CUTOVER-LOG mapping table)
- CUTOVER-03 (validate-schema.mjs retired) — Wave 1
- CUTOVER-04 (nightly.sh exit-code propagation) — Wave 3 (no-op confirmation)
- VALIDATE-02 (frontend smoke + parquet schema parity) — Wave 3

**v3.4 dbt Full Rewrite milestone:** ready to mark SHIPPED.

## Self-Check: PASSED

Verified post-write:

- `.planning/phases/088-production-cutover/088-CUTOVER-LOG.md` — exists ✓
- `grep -q "## Migration Mapping" 088-CUTOVER-LOG.md` ✓
- `grep -q "## Smoke Check" 088-CUTOVER-LOG.md` ✓
- `grep -q "host_observation_id" 088-CUTOVER-LOG.md` ✓
- `grep -q "geom GEOMETRY" 088-CUTOVER-LOG.md` ✓
- 4 `- [x]` checked behaviors present ✓
- Commit `3fb9333` in `git log` ✓
- `bash -n data/nightly.sh` exit 0 ✓
- `cd data && uv run pytest tests/test_dbt_diff.py::test_occurrences_schema_matches -x` exit 0 ✓

---
*Phase: 088-production-cutover*
*Completed: 2026-05-14*
