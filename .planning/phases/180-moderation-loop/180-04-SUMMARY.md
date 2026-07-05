---
phase: 180-moderation-loop
plan: 04
subsystem: testing
tags: [pytest, sqlite, sqlalchemy, moderation, xss, verification]

# Dependency graph
requires:
  - phase: 180-01-migration-note-revisions-reason
    provides: "note_revisions.reason nullable column (ORM + migration 0004)"
  - phase: 179-notes-feature-harvest-build-time-bake
    provides: "notes_harvest.export_notes() status='approved' scoping; render_note_markdown XSS sanitize"
  - phase: 177-authoritative-store-migrations-backup-dr
    provides: "data/roles_allowlist.toml declared role source"
provides:
  - "test_harvest_excludes_hidden — locks MOD-04 (hidden notes excluded from export_notes() by construction)"
  - "test_note_revisions_reason_column_nullable — locks MOD-03 (reason column optional, D-09)"
  - "confirmed-green re-run of the pre-shipped MOD-01 (test_notes_seed_roles.py) and MOD-03 XSS (test_notes_render.py) suites"
affects: [180-05-operator-migration-apply, gsd-verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verification-only test task (D-11): write a test proving an invariant holds by construction, run it once, and if it passes immediately that IS the desired outcome — not a RED-phase failure to chase"

key-files:
  created: []
  modified:
    - data/tests/test_notes_harvest.py
    - data/tests/test_notes_store_schema.py

key-decisions:
  - "No production code touched anywhere in this plan (data/notes_harvest.py, api/main.py, api/auth.py, data/notes_store/models.py, src/*.ts all byte-unchanged) — confirmed via git diff --stat before each commit, per D-11's verify-don't-modify mandate"
  - "The 4 Note audit-field columns (author_id/status/created_at/updated_at) were already asserted by the pre-existing test_schema_notes; no duplicate assertion added, only the reason column check was new"

patterns-established: []

requirements-completed: [MOD-01, MOD-03, MOD-04]

# Metrics
duration: 6min
completed: 2026-07-05
---

# Phase 180 Plan 04: Verification Tests — MOD-04 Hidden Exclusion + MOD-03 Audit Substrate Summary

**Two new pytest cases proving, without touching any production code, that a `status='hidden'` note is excluded from both the nightly harvest and the `note_revisions.reason` column stays optional — both invariants held by construction from Phases 177/179's existing `status='approved'` scoping and migration 0004's nullable column.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-05T01:42:00Z (approx, session-derived)
- **Completed:** 2026-07-05T01:45:01Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `test_harvest_excludes_hidden` (data/tests/test_notes_harvest.py) seeds an `approved` + a `hidden` note under the same species and asserts `export_notes()` emits only the approved one — mirrors the existing pending/removed exclusion coverage, locking in MOD-04 for the new `hidden` status value.
- `test_note_revisions_reason_column_nullable` (data/tests/test_notes_store_schema.py) asserts the migration-0004 `reason` column both reports `notnull=0` via `PRAGMA table_info` and accepts an actual ORM insert with `reason=None` — locking in D-09/MOD-03's "optional, empty allowed" requirement.
- Added `reason` to the existing `expected_revisions_cols` set in `test_schema_notes` for completeness (existence check alongside the dedicated nullability test).
- Re-ran the pre-shipped MOD-01 (`test_notes_seed_roles.py`, 11 tests) and MOD-03 XSS (`test_notes_render.py`, 10 tests) suites as verification per D-11 — both green, unchanged.
- Full fast-tier regression: `cd data && uv run pytest -m "not integration"` → 492 passed, 9 skipped. `npm test` → 965 passed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Hidden-status harvest-exclusion test (MOD-04)** - `833fb392` (test)
2. **Task 2: Audit-field + reason-column schema assertion; run MOD-01/MOD-03 verifications** - `041b64dc` (test)

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `data/tests/test_notes_harvest.py` - Added `test_harvest_excludes_hidden`, seeding a `hidden`-status Note alongside an `approved` one and asserting `export_notes()` excludes it.
- `data/tests/test_notes_store_schema.py` - Added `reason` to `expected_revisions_cols`; added `test_note_revisions_reason_column_nullable` asserting the column is nullable via `PRAGMA table_info` and via a real ORM insert with `reason=None`.

## Decisions Made
- Followed D-11 exactly: this plan is verification-only. Both new tests were written to pass on the *first* run (not RED-then-GREEN) because the invariant they lock in already held by construction (the pre-existing `Note.status == "approved"` filter in `notes_harvest.py`/`api/main.py`, and migration 0004's already-nullable `reason` column from Plan 01). A first-run pass here is the correct, expected outcome — not a sign the test is vacuous, since each test specifically seeds the new `hidden` status / exercises the new `reason` column that did not exist before Phase 180.
- Did not duplicate the existing 4-audit-field assertion (`author_id`/`status`/`created_at`/`updated_at`) already present in `test_schema_notes` — confirmed it was sufficient and left it untouched per the plan's "add whichever assertion is missing; do not duplicate an existing one" instruction.

## TDD Gate Compliance

Both tasks carry `tdd="true"` in PLAN.md, but per this plan's explicit D-11 verification-only framing (confirmed in `<prior_wave_context>`: "no test... fails, that is a real finding — STOP"), there is intentionally no `feat(...)` GREEN commit following either `test(...)` commit — no production code was needed or written. This is NOT a gate-sequence failure: the MVP+TDD behavior-adding predicate (`tdd=true` AND `<behavior>` block AND non-test source files in `<files>`) evaluates `false` for both tasks, since `<files>` in PLAN.md lists only test files (`data/tests/test_notes_harvest.py`, `data/tests/test_notes_store_schema.py`) for both tasks — confirmed by `git diff --stat` showing zero production-file changes across the whole plan. The verifier should treat both commits as `test`-type verification commits, not an incomplete RED phase.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations triggered; no production code was added, modified, or needed.

## Authentication Gates Encountered

None - this plan touches only local test code; no auth-gated resources.

## Issues Encountered

None. Both new tests passed on the first run, confirming (rather than surprising) the by-construction invariants documented in 180-RESEARCH.md and 180-CONTEXT.md D-06/D-09.

## Verification Results

- `cd data && uv run pytest tests/test_notes_harvest.py -k hidden -x` → 1 passed.
- `cd data && uv run pytest tests/test_notes_harvest.py -x` → 5 passed (full file, no regression).
- `cd data && uv run pytest tests/test_notes_store_schema.py tests/test_notes_render.py tests/test_notes_seed_roles.py -x` → 27 passed.
- `git diff --stat data/notes_harvest.py data/notes_store/models.py api/` → empty (zero production-code changes across the entire plan).
- `cd data && uv run pytest -m "not integration"` (full fast-tier regression) → 492 passed, 9 skipped.
- `npm test` (full JS suite) → 965 passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MOD-01, MOD-03, MOD-04 are now test-locked (in addition to REQUIREMENTS.md already marking all of MOD-01..04 complete from Plans 02/03's work). This plan adds the missing automated-regression floor so a future harvest/schema refactor that accidentally drops the `status='approved'` filter or re-introduces a NOT NULL `reason` column fails loudly in CI.
- Plan 05 (operator-executed `alembic upgrade head` on maderas) is the only remaining plan in Phase 180 — this plan has no blockers for it.
- No concerns carried forward.

---
*Phase: 180-moderation-loop*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: data/tests/test_notes_harvest.py
- FOUND: data/tests/test_notes_store_schema.py
- FOUND: .planning/phases/180-moderation-loop/180-04-SUMMARY.md
- FOUND commit 833fb392 (test — hidden-status harvest exclusion)
- FOUND commit 041b64dc (test — reason-column nullable + MOD-01/MOD-03 verification)
