---
phase: 179-notes-feature-harvest-build-time-bake
plan: 01
subsystem: database
tags: [markdown-it-py, nh3, alembic, sqlalchemy, sqlite, xss-sanitization, python]

# Dependency graph
requires:
  - phase: 177-authoritative-store-migrations-backup-dr
    provides: notes_store package (models.py, db.py, migrations/), forward-only Alembic env with render_as_batch=True
  - phase: 178-thin-write-layer-inat-oauth
    provides: users table (migration 0002), api/ write layer that will consume render_note_markdown and the FK
provides:
  - "render_note_markdown(body_md) -> body_html: the single shared server-side markdown-render + HTML-sanitize entrypoint (data/notes_store/render.py)"
  - "notes.body_html (Text, NOT NULL) column, backfilled for pre-existing rows"
  - "notes.author_id recast from String to an integer FK -> users.id"
  - "Forward-only Alembic migration 0003 (downgrade raises NotImplementedError)"
affects: [179-02-write-api, 179-03-harvest, 180-moderation-loop]

# Tech tracking
tech-stack:
  added: ["nh3==0.3.6 (Ammonia HTML sanitizer, Rust binding)", "markdown-it-py==4.2.0 (restricted-subset markdown renderer)"]
  patterns: ["single shared render+sanitize helper imported by every consumer (never duplicated)", "three-step SQLite Alembic batch migration for a NOT NULL column on a populated table (add nullable -> backfill -> tighten to NOT NULL)", "forward-only migrations with downgrade() raising NotImplementedError"]

key-files:
  created:
    - data/notes_store/render.py
    - data/notes_store/migrations/versions/0003_add_body_html_author_fk.py
    - data/tests/test_notes_render.py
  modified:
    - data/notes_store/models.py
    - data/notes_store/seed.py
    - data/pyproject.toml
    - data/tests/test_notes_migrations.py
    - data/tests/test_notes_store_schema.py
    - data/tests/test_backup_notes.py
    - data/tests/test_notes_users.py

key-decisions:
  - "nh3's default link_rel=\"noopener noreferrer\" satisfies D-06's rel requirement — never pass \"rel\" in the attributes allowlist alongside it (nh3 raises ValueError if both are set)"
  - "markdown-it-py's link rule already rejects javascript: URLs at parse time (renders as inert plain text, no <a> at all); nh3's url_schemes allowlist is the independent defense-in-depth backstop per D-06, not the sole guard"
  - "body_html backfill happens inside upgrade() via a plain SELECT/UPDATE loop, importing render_note_markdown inside the function body (not at module level) to avoid a migrations-dir circular-import ordering issue"
  - "author_id/users.id FK creation relies on SQLite batch-mode's own IntegrityError to fail loudly if any pre-existing row violates the constraint, rather than a separate pre-check query (writes only opened 2026-07-04, so ~0 pre-existing rows expected)"

patterns-established:
  - "Any future markdown/rich-text field in this store must route through notes_store.render.render_note_markdown — never add a second renderer"
  - "Schema changes to a populated table use the three-step nullable->backfill->NOT NULL batch pattern, not a direct NOT NULL add_column"

requirements-completed: [NOTES-01, NOTES-02]

# Metrics
duration: 9min
completed: 2026-07-04
---

# Phase 179 Plan 01: Shared Render Helper + Forward-Only Migration 0003 Summary

**Added the one shared `render_note_markdown` (markdown-it-py "zero" preset + nh3.clean allowlist) helper and a forward-only Alembic migration wiring `notes.body_html` (backfilled) + `notes.author_id` (now an int FK to `users.id`).**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-04T18:16:15Z
- **Completed:** 2026-07-04T18:24:55Z
- **Tasks:** 2
- **Files modified:** 11 (3 created, 8 modified)

## Accomplishments
- `data/notes_store/render.py`: the single server-side markdown->sanitized-HTML entrypoint, verified to render `<script>`/`onerror=`/`javascript:` payloads inert while producing correct output for bold/italic/links/lists/paragraphs
- `nh3` 0.3.6 and `markdown-it-py` 4.2.0 added to `data/pyproject.toml` and confirmed importable under Python 3.14
- Migration `0003_add_body_html_author_fk.py`: three-step batch ALTER (add nullable `body_html` -> backfill via `render_note_markdown` -> tighten to NOT NULL), then `author_id` String->Integer recast + `fk_notes_author_id_users` FK creation; `downgrade()` raises `NotImplementedError`
- `data/notes_store/models.py` updated to match: `Note.body_html` (Text, NOT NULL), `Note.author_id` now `ForeignKey("users.id")`

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared render+sanitize helper + deps + tests** - `59ba795e` (feat)
2. **Task 2: models.py body_html/author_id FK + forward-only migration 0003** - `600ef4d4` (feat)

**Plan metadata:** (this commit) - `docs(179-01): complete plan`

## Files Created/Modified
- `data/notes_store/render.py` - the shared `render_note_markdown(body_md) -> body_html` entrypoint
- `data/notes_store/migrations/versions/0003_add_body_html_author_fk.py` - forward-only batch migration
- `data/notes_store/models.py` - `Note.body_html` + `Note.author_id` FK
- `data/notes_store/seed.py` - now get-or-creates a `User` per sample author and renders `body_html` (collateral fix, see Deviations)
- `data/pyproject.toml` - `nh3`, `markdown-it-py` dependencies
- `data/tests/test_notes_render.py` - new render/sanitize test suite
- `data/tests/test_notes_migrations.py` - `test_migration_0003_backfills_body_html`, `test_no_downgrade_0003`
- `data/tests/test_notes_store_schema.py` - fixed existing tests for the FK schema change; added `test_soft_delete_keeps_row_and_appends_revision`
- `data/tests/test_backup_notes.py` - fixed seeded-DB helper for the FK schema change
- `data/tests/test_notes_users.py` - pinned migration target to `"0002"` (head advanced to `0003`)

## Decisions Made
- Kept `body` as the markdown source column (did not rename to `body_md`) per D-05's planner's-call to minimize churn.
- Split the FK-conflict check onto SQLite's own batch-mode `IntegrityError` rather than a separate pre-flight query — the store is brand new (writes opened 2026-07-04) so this is expected to be a no-op safety net, not an active code path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing tests broken by the author_id/body_html schema change**
- **Found during:** Task 2, running the full `not integration` suite after the migration/model change
- **Issue:** `notes_store/seed.py`, `data/tests/test_backup_notes.py`, and `data/tests/test_notes_users.py` all predated the FK/NOT-NULL schema change and broke: seed.py inserted string `author_id` values with no `body_html` (IntegrityError); the backup test's seeded-DB helper did the same; `test_notes_users.py::test_users_migration_applies` asserted `alembic_version == "0002"` after upgrading to `"head"`, which now resolves to `"0003"`.
- **Fix:** `seed.py` now get-or-creates a `User` row per sample author login and calls `render_note_markdown()` for `body_html`; `test_backup_notes.py`'s `_make_seeded_db` helper creates `User` rows and supplies `body_html`; `test_notes_users.py` now targets `"0002"` explicitly instead of `"head"`, mirroring the identical convention already established in 178-02 for `test_notes_migrations.py::test_migration_applies` (documented in STATE.md's decision log).
- **Files modified:** `data/notes_store/seed.py`, `data/tests/test_backup_notes.py`, `data/tests/test_notes_users.py`
- **Commit:** `600ef4d4` (part of Task 2 commit)

**2. [Rule 1 - Bug] Existing test_notes_store_schema.py tests broken by the same schema change**
- **Found during:** Task 2, same full-suite run
- **Issue:** `test_multiple_notes_per_species` and `test_status_default` inserted string `author_id` values (`"alice_inat"` etc.) with no `body_html`; both now violate the FK constraint (foreign_keys=1 is always on via `make_engine`) and the NOT NULL constraint.
- **Fix:** Added a `_make_user` helper that inserts a real `User` row and returns its assigned integer id; both tests now create a `User` first and supply `body_html`.
- **Files modified:** `data/tests/test_notes_store_schema.py`
- **Commit:** `600ef4d4` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs directly caused by this plan's own schema change, in-scope per the deviation rules' scope boundary)
**Impact on plan:** Both fixes were required for `uv run pytest -m "not integration"` to stay green after the author_id/body_html schema change; no scope creep beyond making the plan's own change consistent across the existing test suite.

## Issues Encountered
- My initial `test_notes_render.py` assertions for the `javascript:` and `onerror=` payload cases were too strict (checking for absence of the substring anywhere, rather than absence of a *live* href/attribute) — markdown-it-py's own escaping renders these payloads as literal escaped text (e.g. `&lt;img ... onerror=alert(1)&gt;`), which is fully inert but does still contain the substring as plain text. Adjusted the assertions to check for the absence of a live/unescaped attribute or href rather than the raw substring, which is what the plan's `<behavior>` block actually requires ("no `<img>` and no `onerror` attribute survive" — the escaped text isn't an attribute at all).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `render_note_markdown` is ready for 179-02 (write API routes) and 179-03 (harvest) to import.
- `notes.body_html` + the `author_id` FK are in place for 179-02's create/edit routes to populate and for ownership checks (`g.identity["uid"] == note.author_id`) to compare against.
- No blockers for 179-02/179-03.

---
*Phase: 179-notes-feature-harvest-build-time-bake*
*Completed: 2026-07-04*
