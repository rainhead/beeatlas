---
phase: 088-production-cutover
plan: 01
subsystem: infra
tags: [ci, build-pipeline, dbt-contract, schema-validation, rollback-marker]

# Dependency graph
requires:
  - phase: 085-dbt-occurrences-mart
    provides: 30-column dbt contract on marts/occurrences (now the canonical schema gate)
  - phase: 087-incremental-materialization-experiment
    provides: pre-experiment-sha.txt rollback-marker idiom (mirrored here)
provides:
  - Retired scripts/validate-schema.mjs and all five reference sites
  - Pre-cutover SHA marker for whole-phase revertability (44a967c)
  - CI build chain shortened: checkout → setup-node → npm ci → npm test → npm run build
  - Local build chain shortened: validate-species → typecheck → eleventy → validate-bundle-size
  - CLAUDE.md `## Known State` reflects dbt-contract enforcement
affects: [088-02, 088-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-cutover SHA rollback marker (committed in same wave as deletions, target of future `git revert <merge-commit>`)"
    - "Coupled-deletion wave: file + script def + build chain + CI step + docs in one wave keeps CI consistent"

key-files:
  created:
    - .planning/phases/088-production-cutover/pre-cutover-sha.txt
  modified:
    - package.json
    - .github/workflows/deploy.yml
    - CLAUDE.md
  deleted:
    - scripts/validate-schema.mjs

key-decisions:
  - "Retain cosmetic comment-only references to validate-schema in validate-species.mjs:9 and validate-bundle-size.mjs:9 (no import coupling; plan-flagged as intentional)"
  - "Replace CLAUDE.md `## Known State` bullet with a positive statement naming the dbt 30-column contract as the canonical gate (rather than just deleting the bullet)"

patterns-established:
  - "Whole-phase rollback marker: a `pre-cutover-sha.txt` committed in the first wave lets `git revert <merge-commit>` rewind the entire phase atomically"

requirements-completed: [CUTOVER-03]

# Metrics
duration: 2min
completed: 2026-05-14
---

# Phase 088 Plan 01: Retire validate-schema.mjs Summary

**Deleted the legacy JS parquet-schema gate (validate-schema.mjs + package.json script + deploy.yml step) and replaced the CLAUDE.md bullet with a positive statement naming the dbt 30-column contract as the canonical schema gate; pre-cutover SHA 44a967c captured as the phase rollback marker.**

## Performance

- **Duration:** 1m 48s
- **Started:** 2026-05-14T15:35:09Z
- **Completed:** 2026-05-14T15:36:57Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 edited, 1 deleted)

## Accomplishments
- Pre-cutover rollback marker captured: `44a967c8db5acd1d06bbae65ba0a1912528bbc57`
- All 5 reference sites cleared in one wave:
  1. `scripts/validate-schema.mjs` — deleted (122 lines)
  2. `package.json` `validate-schema` script entry — removed
  3. `package.json` `build` chain — shortened (no leading validate-schema)
  4. `.github/workflows/deploy.yml` `Validate parquet schema` step — removed
  5. `CLAUDE.md` `## Known State` bullet — replaced with dbt-contract statement
- CLAUDE.md `## Running Locally` comment also updated (drops the `validate-schema -> ` prefix)
- `npm run build` exits 0 locally; bundle-size gate reports 5.3 KB / 100 KB headroom

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture pre-cutover rollback SHA** — `e9f9d3f` (chore)
2. **Task 2: Delete validate-schema.mjs and remove from package.json** — `759bb47` (feat)
3. **Task 3: Remove validate-schema step from deploy.yml and update CLAUDE.md** — `67c13ed` (feat)

## Files Created/Modified
- `.planning/phases/088-production-cutover/pre-cutover-sha.txt` — 40-char hex SHA + newline; the phase-revert target
- `scripts/validate-schema.mjs` — DELETED (122-line hyparquet schema validator; superseded by dbt contract)
- `package.json` — Removed `"validate-schema"` script; shortened `"build"` chain
- `.github/workflows/deploy.yml` — Removed `Validate parquet schema` job step; build job now goes npm ci → npm test → npm run build
- `CLAUDE.md` — `## Running Locally` comment + `## Known State` bullet both updated to reflect dbt-contract gate

## Decisions Made
- **Retained comment-only refs**: `scripts/validate-species.mjs:9` and `scripts/validate-bundle-size.mjs:9` mention `validate-schema.mjs` only inside doc comments (no import coupling). The plan explicitly flagged these as intentional preservation; not changed.
- **Positive replacement over deletion in CLAUDE.md**: The `## Known State` bullet now affirms the dbt 30-column contract rather than silently dropping the topic, so future readers don't wonder where the schema gate went.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- `python3 -c "import yaml; ..."` (suggested by plan as the YAML smoke) failed because the system python lacks `pyyaml`. Worked around by invoking the same check via `uv run --no-project --with pyyaml python3` — yaml.safe_load returned cleanly. Not a real failure; just a local-env quirk on the executor.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Wave 2 (Plan 088-02) can proceed independently — shares no files with this wave.
- CI is now consistent: no orphan validate-schema step, no orphan script reference, no orphan docs claim.
- Rollback target captured: `git revert <merge-of-088>` lands the repo at `44a967c` exactly.

## Self-Check: PASSED

Verified post-write:
- `scripts/validate-schema.mjs` — FILE GONE (expected)
- `package.json` — no `validate-schema` references (expected)
- `.github/workflows/deploy.yml` — no `validate-schema` references (expected)
- `CLAUDE.md` — no `validate-schema` references; contains `dbt 30-column contract` (expected)
- `.planning/phases/088-production-cutover/pre-cutover-sha.txt` — exists, matches `^[0-9a-f]{40}$` (expected)
- Commits e9f9d3f, 759bb47, 67c13ed — all present in `git log` (expected)
- `npm run build` — exits 0 (expected)

---
*Phase: 088-production-cutover*
*Completed: 2026-05-14*
