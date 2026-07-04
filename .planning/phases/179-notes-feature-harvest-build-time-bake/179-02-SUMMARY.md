---
phase: 179-notes-feature-harvest-build-time-bake
plan: 02
subsystem: api
tags: [flask, sqlalchemy, sqlite, authz, ownership-check, python]

# Dependency graph
requires:
  - phase: 179-01
    provides: "render_note_markdown(body_md) -> body_html shared helper; notes.body_html column + notes.author_id -> users.id FK (migration 0003)"
  - phase: 178-thin-write-layer-inat-oauth
    provides: "api/auth.py require_author (session verify + fresh allowlist recheck + Origin check + WRITE-04 launch gate), api/session.py cookie verify"
provides:
  - "POST /api/notes, PATCH /api/notes/<id>, DELETE /api/notes/<id> -- all @require_author, ownership-checked note CRUD"
  - "GET /api/notes?species=<canonical_name> -- public, approved-only, newest-first read endpoint with own-note body_md/can_edit enrichment"
  - "The one new authz primitive this phase adds: note.author_id != g.identity[\"uid\"] ownership check on PATCH/DELETE"
affects: [179-03-harvest, 179-04-island, 180-moderation-loop]

# Tech tracking
tech-stack:
  added: []
  patterns: ["load note before ownership check (404 before 403) so a guessed/enumerated note_id never mutates (IDOR-safe ordering)", "public GET route mirrors /auth/whoami's optional-session pattern -- reads the cookie if present, never requires it"]

key-files:
  created:
    - api/tests/test_notes_routes.py
  modified:
    - api/main.py

key-decisions:
  - "Body length cap set to 5000 chars (planner's discretion per D-05/CONTEXT.md) -- defense-in-depth against markdown-based DoS, not a locked requirement"
  - "DELETE's NoteRevision.body stores the note's body at time of removal (not an empty string), so the audit ledger keeps a legible record of what was removed"
  - "Read endpoint's byline.display_name/collector_url are intentionally null (live divergence from the nightly-baked byline, documented inline and in 179-RESEARCH.md Pitfall 4) -- D-11 forbids a second name-resolution system in the live path"

patterns-established:
  - "Every note-mutation route loads the row THEN checks ownership (never the reverse) -- abort(404) before abort(403) so IDOR probing on a missing id can't be distinguished from IDOR probing on someone else's id by response code alone at the 404 boundary, and so a real hit never mutates before the check runs"

requirements-completed: [NOTES-01, NOTES-02, NOTES-04]

# Metrics
duration: 7min
completed: 2026-07-04
---

# Phase 179 Plan 02: Note CRUD + Public Read Endpoint Summary

**Four new Flask routes in `api/main.py` (POST/PATCH/DELETE /api/notes behind `@require_author` + a server-derived ownership check, and a public `GET /api/notes?species=` approved-only read) plus 22 new route tests in `api/tests/test_notes_routes.py`.**

## Performance

- **Duration:** 7 min (task-commit span; excludes upfront context-reading)
- **Started:** 2026-07-04T18:33:45Z
- **Completed:** 2026-07-04T18:36:25Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `POST /api/notes`: allowlisted author creates a note; `body_md` rendered exactly once via the 179-01 shared `render_note_markdown` into `body_html`; `author_id` is always `g.identity["uid"]`; appends a `note_revisions` row (`action='create'`)
- `PATCH /api/notes/<id>` / `DELETE /api/notes/<id>`: owner-only edit/soft-delete. Both load the note first, then compare `note.author_id != g.identity["uid"]` -- missing note -> 404, someone else's note -> 403, own note -> 200. Delete sets `status='removed'` (row + full revision history survive) and appends `action='remove'`
- `GET /api/notes?species=<canonical_name>`: public (no `@require_author`), server-side scoped to `status='approved'` ordered newest-first; enriches items with `body_md`/`can_edit: true` only when a valid session cookie identifies the viewer as that note's author
- 22 new tests covering the full `<behavior>` matrix from both tasks: render+sanitize on write, 400 validation (empty body/name, length cap), 401/403/503 auth matrix, forged-author-field rejection, ownership 403 + soft-delete on PATCH/DELETE, and the approved-only/newest-first/own-note-enrichment/empty-array read cases
- Full `cd data && uv run pytest -m "not integration"` stays green (470 passed, 9 skipped) -- no regression to the existing 178 auth/write-check suite

## Task Commits

Each task was committed atomically (TDD RED/GREEN per task):

1. **Task 1: Note create/edit/delete routes (owner-checked, soft-delete)**
   - RED: `6770aa52` (test) - failing tests for create/edit/delete
   - GREEN: `a228634c` (feat) - routes implemented, all pass
2. **Task 2: Public read endpoint (approved-only, own-note body_md)**
   - RED: `2c7f47ea` (test) - failing tests for the read endpoint
   - GREEN: `29697679` (feat) - route implemented, all pass

**Plan metadata:** (this commit) - `docs(179-02): complete plan`

## Files Created/Modified
- `api/main.py` - four new routes: `create_note`, `edit_note`, `delete_note` (all `@auth.require_author`), `list_notes_for_species` (public); new imports (`datetime`, `sqlalchemy.orm.Session`, `notes_store.models.{Note,NoteRevision,User}`, `notes_store.render.render_note_markdown`)
- `api/tests/test_notes_routes.py` - new test file, 22 tests; duplicates `test_routes.py`'s small fixture helpers (`client`, `_base_env`, `tmp_engine`, `_mint`, `_allowlist_toml`) since those are module-local, not conftest-shared, plus new `_make_user`/`_make_note`/`_sign_in` helpers

## Decisions Made
- 5000-char body length cap (planner's discretion, D-05) as markdown-DoS defense-in-depth.
- `NoteRevision.body` on DELETE stores the note's current body (not blank) -- the removal-audit entry stays legible.
- Read endpoint leaves `byline.display_name`/`collector_url` null by design (live vs. baked divergence is intentional per 179-RESEARCH.md Pitfall 4; documented in the route's docstring).

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<behavior>` blocks map 1:1 to implemented routes and tests; no unplanned fixes, no architectural changes.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan only extends the already-deployed Phase-178 write API code; deployment/restart on maderas is an operational step outside plan scope.

## Next Phase Readiness
- All four note routes are ready for 179-03 (harvest, reads the store directly via `notes_store.db.make_engine`, unaffected by these routes) and 179-04 (the Lit island, which will call these four routes: `POST`/`PATCH`/`DELETE /api/notes[...]` for mutations and `GET /api/notes?species=` for the live re-fetch-after-write per D-02).
- The read endpoint's JSON shape (`{id, html, byline:{login, display_name, collector_url}, created, updated, body_md?, can_edit?}`) matches what 179-RESEARCH.md's `artifacts_produced` section specifies for the island to consume.
- No blockers for 179-03/179-04.

---
*Phase: 179-notes-feature-harvest-build-time-bake*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files verified present on disk (`api/tests/test_notes_routes.py`,
this SUMMARY.md); all four task commit hashes (`6770aa52`, `a228634c`, `2c7f47ea`,
`29697679`) verified present in `git log`; all four route functions
(`create_note`, `edit_note`, `delete_note`, `list_notes_for_species`) verified
present in `api/main.py`.
