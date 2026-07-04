---
phase: 179-notes-feature-harvest-build-time-bake
plan: 03
subsystem: database
tags: [sqlalchemy, sqlite, eleventy, build-pipeline, python, javascript]

# Dependency graph
requires:
  - phase: 179-01
    provides: "notes.body_html (Text, NOT NULL) + notes.author_id -> users.id FK (migration 0003); render_note_markdown shared helper"
  - phase: 179-02
    provides: "GET /api/notes?species= read endpoint (same Note+User join/D-13 shape the harvest mirrors, minus display_name resolution)"
provides:
  - "data/notes_harvest.py: build-time notes.json producer, reads the notes store read-only via notes_store.db.make_engine (WAL, D-16), approved-only newest-first (D-10)"
  - "_data/notes.js: absence-tolerant default-export Eleventy loader for notes.json (D-13)"
  - "run.py STEP (\"notes-harvest\", export_notes_step) after collectors-events-export (D-12)"
  - "[artifacts.notes] authoritative contract entry in data/artifacts.toml (build_time_fetch + build_time_fetch_optional=true)"
affects: [179-04-island, 180-moderation-loop]

# Tech tracking
tech-stack:
  added: []
  patterns: ["build-time harvest reads an authoritative store read-only via the store's own engine factory (never a raw sqlite3.connect)", "byline resolution reused from an already-written sibling artifact (collectors.json) rather than re-derived"]

key-files:
  created:
    - data/notes_harvest.py
    - _data/notes.js
    - data/tests/test_notes_harvest.py
    - src/tests/data-notes.test.ts
  modified:
    - data/run.py
    - data/artifacts.toml
    - data/tests/test_notes_migrations.py
    - data/tests/test_artifacts.py

key-decisions:
  - "notes_harvest.py takes engine/assets_dir as optional keyword args (mirroring collectors_export.py's con parameter pattern) so tests can inject a tmp-sqlite engine + tmp assets dir without monkeypatching module globals"
  - "_load_collector_index degrades to {} (not a hard failure) when collectors.json is absent, so a from-scratch local run that hasn't executed collectors-export yet still produces a valid (all-@login-fallback) notes.json rather than crashing"
  - "test_run_py_never_migrates narrowed via an explicit allow-list (name == \"notes-harvest\") rather than a verb-based regex, since the plan's own acceptance criteria named the exact step string to permit"

patterns-established:
  - "A read-only build-time harvest of a separate authoritative store: open via that store's own engine factory (never hand-roll a connection), degrade gracefully on a missing upstream sibling artifact, and never call the factory at import time (side-effect-free import for run.py)"

requirements-completed: [NOTES-03]

# Metrics
duration: 6min
completed: 2026-07-04
---

# Phase 179 Plan 03: Notes Harvest + Build-Time Bake Summary

**`data/notes_harvest.py` harvests approved, newest-first notes from the SQLite notes store (read-only WAL via `notes_store.db.make_engine`) into `public/data/notes.json`, joins bylines from the already-written `collectors.json` (D-11/D-12), and wires into `run.py` as a `notes-harvest` STEP after `collectors-events-export`, declared `authoritative` in `data/artifacts.toml`.**

## Performance

- **Duration:** 6 min (task-commit span; excludes upfront context-reading)
- **Started:** 2026-07-04T18:41:27Z
- **Completed:** 2026-07-04T18:47:29Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- `data/notes_harvest.py`: `export_notes()` queries `Note` joined to `User` (author_id == User.id), `status='approved'` only, ordered `created_at DESC`, emitting `Record<canonical_name, Note[]>` per D-13 (`{id, html, byline:{display_name, login, collector_url|null}, created, updated}`); `main()`/`export_notes_step()` open the store via `notes_store.db.make_engine` — no raw `sqlite3.connect`, no DuckDB
- Byline resolution reuses `public/data/collectors.json` (produced earlier in the same `run.py` invocation) rather than re-deriving `display_name` — a login present in collectors.json gets its `display_name` + `/collectors/<login>/`; an absent login falls back to plain-text `@login` + `collector_url: null`
- `_data/notes.js`: verbatim-mirror absence-tolerant loader of `_data/species_hosts.js` — returns `{}` on missing/unparseable `notes.json`, default-export only
- `run.py`: `("notes-harvest", export_notes_step)` inserted immediately after `("collectors-events-export", ...)`; module docstring STEPS listing updated; run.py text still contains none of `notes_store`/`alembic`/`notes.db`/`NOTES_DB_PATH`
- `data/artifacts.toml`: `[artifacts.notes]` declared `provenance="authoritative"`, `build_time_fetch=true`, `build_time_fetch_optional=true` (confirmed against `.github/workflows/deploy.yml`'s fetch step, which hard-fails `exit 1` on a missing *required* manifest key — RESEARCH A3), no `baseline_diff`
- `test_run_py_never_migrates` narrowed to permit the exact `"notes-harvest"` step name while still banning `migrat`-named steps and the `notes_store`/`alembic`/`notes.db`/`NOTES_DB_PATH` substrings anywhere in `run.py`
- Full suite green: `cd data && uv run pytest -m "not integration"` (474 passed, 9 skipped) and `npm test` (37 files, 926 tests) both pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: notes_harvest.py + _data/notes.js loader** - `439ff9d0` (feat)
2. **Task 2: run.py STEP registration + artifacts.toml contract + narrow the run.py-isolation test** - `61168a5e` (feat)

**Plan metadata:** (this commit) - `docs(179-03): complete plan`

## Files Created/Modified
- `data/notes_harvest.py` - build-time `notes.json` producer (`export_notes`, `main`, `export_notes_step`, `_load_collector_index`, `_byline`)
- `_data/notes.js` - absence-tolerant Eleventy loader, default-export only
- `data/tests/test_notes_harvest.py` - 4 tests: approved-only/newest-first/byline shape, empty store, missing collectors.json fallback, make_engine-not-raw-sqlite3 grep check
- `src/tests/data-notes.test.ts` - loader contract tests mirroring `data-species_hosts.test.ts`
- `data/run.py` - `notes-harvest` STEP + import; docstring updated
- `data/artifacts.toml` - `[artifacts.notes]` authoritative entry; header comment count 16→17
- `data/tests/test_notes_migrations.py` - narrowed `test_run_py_never_migrates` allow-list + docstring
- `data/tests/test_artifacts.py` - updated for the 17th artifact (count, order, build_time_fetch set-equality with `notes: True`, golden manifest)

## Decisions Made
- `export_notes(engine=None, assets_dir=None)` accepts injectable engine/assets_dir for testability, defaulting to `make_engine()`/`ASSETS_DIR` in production — mirrors `collectors_export.py`'s `con` parameter pattern rather than requiring tests to monkeypatch module-level globals.
- `_load_collector_index` treats a missing `collectors.json` as an empty index (not an error) so a from-scratch local `notes-harvest` run still produces valid output before `collectors-export` has ever run locally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing test_artifacts.py assertions broken by adding the 17th artifact**
- **Found during:** Task 2, running `uv run pytest tests/test_artifacts.py` after adding `[artifacts.notes]`
- **Issue:** `test_load_returns_16_artifacts`, `test_artifact_order`, `test_build_time_fetch_artifacts_set_equality`, and the byte-exact golden manifest all hardcoded the pre-179 artifact count/order/set, which the new `notes` entry necessarily changes.
- **Fix:** Updated the expected count (16→17), inserted `"notes"` into the expected declared-order list (after `collector_event_pages`, before `occurrences_db_tables`), added `"notes": True` to `_EXPECTED_BUILD_TIME_FETCH`, and added the `"notes"` line to `_GOLDEN_MANIFEST` in its declared-order position. Renamed `test_load_returns_16_artifacts` to `test_load_returns_17_artifacts` for accuracy.
- **Files modified:** `data/tests/test_artifacts.py`
- **Commit:** `61168a5e` (part of Task 2 commit)

**2. [Rule 1 - Bug] Docstring prose in run.py and notes_harvest.py tripped the banned-substring/grep checks**
- **Found during:** Task 1/2, running `test_run_py_never_migrates` and the harvest's own `make_engine`-not-`sqlite3.connect` grep test
- **Issue:** Explanatory prose in `run.py`'s new docstring note (mentioning `data/notes_store/`) and in `notes_harvest.py`'s module docstring (mentioning `sqlite3.connect()`) contained the literal banned substrings the tests scan for as plain text, even though neither file actually imports/uses them.
- **Fix:** Reworded both docstrings to convey the same information without the literal substrings (e.g. "the store itself is owned by the write-layer deploy" instead of naming the `notes_store` path; "a raw, hand-rolled sqlite connection" instead of `sqlite3.connect()`).
- **Files modified:** `data/run.py`, `data/notes_harvest.py`
- **Commit:** `439ff9d0` (harvest docstring), `61168a5e` (run.py docstring)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs directly caused by this plan's own changes: adding the 17th artifact and adding explanatory prose that collided with existing grep-based test assertions)
**Impact on plan:** Both fixes were required for the existing test suite to stay green after this plan's changes; no scope creep beyond making the plan's own change consistent with pre-existing tests.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None - no external service configuration required. `notes.json` will first populate on the next real nightly run against the live `notes.db` on maderas; locally/CI it stays absent, tolerated by `_data/notes.js`.

## Next Phase Readiness
- `notes.json`'s D-13 shape (`Record<canonical_name, Note[]>`, byline `{display_name, login, collector_url|null}`) is ready for 179-04's species-page render block and the hydrating island's baked-notes prop.
- `_data/notes.js` is ready to import into `_pages/species-detail.njk` as `notes[sp.canonical_name]`.
- No blockers for 179-04 (the Lit island) or Phase 180 (moderation loop) — the harvest already excludes non-`approved` notes, so Phase 180's takedown mechanism (status flip) will propagate to the public site on the next nightly build with no harvest-side change needed.

---
*Phase: 179-notes-feature-harvest-build-time-bake*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files verified present on disk (`data/notes_harvest.py`,
`_data/notes.js`, `data/tests/test_notes_harvest.py`, `src/tests/data-notes.test.ts`,
`data/run.py`, `data/artifacts.toml`, `data/tests/test_notes_migrations.py`,
`data/tests/test_artifacts.py`, this SUMMARY.md); both task commit hashes
(`439ff9d0`, `61168a5e`) verified present in `git log`.
