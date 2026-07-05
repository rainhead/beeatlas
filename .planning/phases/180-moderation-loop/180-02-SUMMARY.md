---
phase: 180-moderation-loop
plan: 02
subsystem: api
tags: [flask, sqlalchemy, authz, moderation, rbac]

# Dependency graph
requires:
  - phase: 180-moderation-loop (180-01)
    provides: nullable note_revisions.reason column (migration 0004, ORM field)
  - phase: 179-notes-feature-harvest-build-time-bake
    provides: notes/note_revisions schema, require_author decorator, _is_author_fresh fresh-recheck pattern, list_notes_for_species approved-only read scoping
provides:
  - "api/auth.py::_is_curator_fresh(login) -- fresh per-request curator-only allowlist recheck"
  - "POST /api/notes/{id}/takedown -- curator-only, status='hidden', ledger action='takedown'"
  - "POST /api/notes/{id}/restore -- curator-only, status='approved', ledger action='restore', curl-only (D-07)"
affects: [180-03-frontend-curator-controls, 180-05-operator-migration-apply]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-load identity-level authz gate (curator check runs BEFORE db_session.get) contrasted with post-load ownership checks (edit_note/delete_note) -- the identity gate leaks no per-note existence info, so it can safely run first"

key-files:
  created: []
  modified:
    - api/auth.py
    - api/main.py
    - api/tests/test_notes_routes.py
    - api/tests/test_authz.py

key-decisions:
  - "Curator gate (_is_curator_fresh) runs BEFORE the note load in both routes, unlike the existing post-load ownership check in edit_note/delete_note -- a blanket 'not a curator at all' 403 reveals nothing note-specific, so pre-load ordering is safe and simpler (RESEARCH Open Question #1, resolved during planning)"
  - "reason accepted defensively capped at the existing _NOTE_BODY_MAX_LENGTH (5000 chars) rather than introducing a new constant"
  - "restore route is fully implemented but has zero UI wiring in this plan -- curl-only per D-07, consumed by the operator directly"

patterns-established:
  - "Curator-only routes stack @auth.require_author (session+allowlist+Origin+launch-gate) with a second, narrower in-body _is_curator_fresh check -- the two-decorator-plus-inline-check layering other curator-scoped routes should follow"

requirements-completed: [MOD-01, MOD-02, MOD-03, MOD-04]

# Metrics
duration: 12min
completed: 2026-07-05
---

# Phase 180 Plan 02: Curator Takedown/Restore Authz Routes Summary

**Two new curator-only Flask routes (`POST /api/notes/{id}/takedown`, `POST /api/notes/{id}/restore`) plus a fresh per-request `_is_curator_fresh` allowlist helper close the gap where the existing owner-only PATCH/DELETE note routes hard-403 any non-owner curator.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-05T01:26:00Z
- **Completed:** 2026-07-05T01:38:00Z
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments
- `api/auth.py::_is_curator_fresh(login)` — a strict-equality (`== "curator"`), disk-reread-per-request helper mirroring `_is_author_fresh` exactly, so a demoted curator loses takedown/restore power on the very next request (D-05)
- `POST /api/notes/{id}/takedown` — curator can hide ANY note (not just their own): sets `status='hidden'`, appends a `note_revisions` row with `action='takedown'`, `editor_id` = the curator's uid, and an optional normalized `reason` (empty → `None`, never `""`)
- `POST /api/notes/{id}/restore` — structurally identical, sets `status='approved'`, `action='restore'`; deliberately not wired to any UI (D-07, curl-only)
- 14 new tests added (11 route tests in `test_notes_routes.py`, 3 unit tests in `test_authz.py`), all following the RED→GREEN TDD cycle; full `api/tests/test_notes_routes.py` suite (33 tests) and full `data/` fast-tier suite (490 passed) stay green; full JS suite (965 passed) unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Failing curator route + authz tests (RED)** - `0ae8e91d` (test)
2. **Task 2: _is_curator_fresh helper (GREEN for authz tests)** - `a4330b57` (feat)
3. **Task 3: takedown_note + restore_note routes (GREEN for route tests)** - `52c0766e` (feat)

**Plan metadata:** (this commit, pending)

_Note: TDD plan — one RED commit followed by two GREEN commits (helper, then routes)._

## Files Created/Modified
- `api/auth.py` - Added `_is_curator_fresh(login)` immediately after `_is_author_fresh`; deliberately does not import/call `notes_store.roles.is_curator` (import-time-cached, unsuitable for authz)
- `api/main.py` - Added `takedown_note(note_id)` and `restore_note(note_id)` views immediately after `delete_note`, reusing its `Session(_ENGINE)`/`NoteRevision`-append/`jsonify` shape
- `api/tests/test_notes_routes.py` - 11 new tests: curator takedown success, non-curator 403, missing 404, foreign-origin 403, launch-gate 503, reason-ledger capture (both routes), plus a hidden-note-excluded-from-read test
- `api/tests/test_authz.py` - 3 new unit tests for `_is_curator_fresh` (curator true, author false, disk-demotion revocation)

## Decisions Made
- Curator identity gate runs BEFORE the `db_session.get` load in both routes (not after, unlike the ownership checks in `edit_note`/`delete_note`) — per RESEARCH.md's resolved Open Question #1, a "not a curator at all" 403 leaks nothing note-specific, so pre-load ordering is both safe and simpler. Locked in by `test_takedown_missing_is_404`/`test_restore_missing_is_404` (a real curator against a nonexistent id still 404s).
- Reused the existing `_NOTE_BODY_MAX_LENGTH` (5000) as a defensive cap on the optional `reason` field rather than introducing a new constant (planner discretion per RESEARCH V5).
- No changes to `list_notes_for_species` or the nightly harvest — `hidden` is a new non-`approved` value, excluded by the existing `status == "approved"` filter with zero new code (MOD-04 verified via `test_hidden_note_excluded_from_read`).

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates Encountered

None - this plan touches only local Flask routes and SQLite-backed tests; no live auth/OAuth flow was exercised.

## Issues Encountered

None.

## Verification Results

- `cd data && uv run pytest ../api/tests/test_notes_routes.py -k "takedown or restore or hidden"` — 11 passed
- `cd data && uv run pytest ../api/tests/test_authz.py -k curator` — 3 passed
- `cd data && uv run pytest ../api/tests/test_notes_routes.py` (full file, regression) — 33 passed
- `cd data && uv run pytest -m "not integration"` (full fast-tier data+api suite) — 490 passed, 9 skipped
- `npm test` (full frontend suite, unaffected by this backend-only plan) — 965 passed
- Source assertions confirmed: `api/auth.py` defines `_is_curator_fresh` via `_current_roles()` with strict `== "curator"`, no import of `notes_store.roles.is_curator`; `api/main.py` registers both routes stacked on `@auth.require_author` with a pre-load in-body `_is_curator_fresh` gate; neither route mutates `note.body`/`note.body_html`; no new column added to the `notes` table

## Next Phase Readiness

- Plan 180-03 (frontend curator controls, already executed per prior-wave context) now has a real backend to call: `POST /api/notes/{id}/takedown` is live and tested.
- Plan 180-05 (operator-executed migration apply) still needs to run `alembic upgrade head` on maderas to bring the live SQLite store to revision 0004 before these routes can be exercised in production — not part of this plan (local/dev-writable and verifiable only).
- No blockers.

## Self-Check: PASSED

- FOUND: api/auth.py (`_is_curator_fresh` present)
- FOUND: api/main.py (`takedown_note`/`restore_note` present)
- FOUND: api/tests/test_notes_routes.py (11 new tests present)
- FOUND: api/tests/test_authz.py (3 new tests present)
- FOUND commit 0ae8e91d (test RED)
- FOUND commit a4330b57 (feat GREEN — helper)
- FOUND commit 52c0766e (feat GREEN — routes)

---
*Phase: 180-moderation-loop*
*Completed: 2026-07-05*
