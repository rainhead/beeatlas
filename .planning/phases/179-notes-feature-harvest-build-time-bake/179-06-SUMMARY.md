---
phase: 179-notes-feature-harvest-build-time-bake
plan: 06
subsystem: testing
tags: [uat, security, oauth, harvest, build-time-bake, nightly, deploy, notes]

# Dependency graph
requires:
  - phase: 179-05
    provides: "<bee-notes> hydrating island + note CRUD client — the live author round-trip surface UAT'd here"
  - phase: 179-04
    provides: "Baked <section class='notes-section'> + always-present <bee-notes> mount + canonicalName/bakedNotes handoff — the static read surface UAT'd here"
  - phase: 179-03
    provides: "notes_harvest.py + run.py notes-harvest STEP + [artifacts.notes] contract + _data/notes.js loader — the harvest→publish→bake cycle UAT'd here"
  - phase: 179-02
    provides: "require_author-guarded POST/PATCH/DELETE + owner check + public GET /api/notes read — the adversarial surface UAT'd here"
provides:
  - "Three signed-off human verifications (live author round-trip; forged-author/cross-origin/unauth rejection; full nightly harvest→publish→bake) — the manual-only items in 179-VALIDATION.md"
  - "DEVIATION FIX: nightly.sh now exports NOTES_DB_PATH so the harvest reads the SAME live store the write API writes to (was a ship-blocking mis-wire)"
affects: [180-moderation-loop, notes-guest-freshness-gap]

# Tech tracking
tech-stack:
  added: []
  patterns: ["operator-triggered nightly.sh as the canonical harvest→publish→dispatch path (bash parses the script at invocation — pull on the host BEFORE invoking so the loaded script carries the fix)"]

key-files:
  created: []
  modified:
    - "data/nightly.sh — export NOTES_DB_PATH (default $HOME/beeatlas-store/notes.db) into the run.py invocation"

key-decisions:
  - "Harvest failure semantics: leave FAIL-LOUD (a notes-store open error aborts the whole nightly before publish) — user-chosen 2026-07-04 over graceful-degrade, so a broken notes pipeline can never silently ship an empty notes.json"
  - "Cross-origin + cross-author 403 accepted on unit-test + Phase-178 live-UAT evidence rather than re-reproduced live (curl can't carry a real session + forged Origin; cross-author needs a second allowlisted author)"

patterns-established:
  - "Build-time-optional artifact wiring is declarative via artifacts.toml (publish-plan + build-time-fetch); nightly.sh needs no per-artifact mention — but the PRODUCER's store path is an env-var contract that must match the writer (systemd unit + runbook §A4), not the code default"

requirements-completed: [NOTES-01, NOTES-02, NOTES-03, NOTES-04]

# Metrics
duration: ~60min
completed: 2026-07-04
---

# Phase 179 / Plan 06: Notes feature security + E2E UAT — Summary

**All three blocking human gates signed off, and UAT surfaced + fixed a ship-blocking mis-wire: the nightly harvest was reading a nonexistent store (`/opt/beeatlas-store/notes.db`) instead of the live one the write API writes to, so no author note could ever have reached the static site.**

## Performance

- **Duration:** ~60 min (including a deploy gap fix — 29 unpushed 179 commits + the NOTES_DB_PATH fix — plus two full nightly runs)
- **Completed:** 2026-07-04
- **Tasks:** 3 blocking human-verify checkpoints, all approved
- **Files modified:** 1 (`data/nightly.sh`)

## Pre-UAT state fix (not in plan, required to make UAT possible)

Phase 179 (all of 179-01..05, 29 commits) was **unpushed on local `main`** — neither
the static site (deploy.yml) nor the maderas write API (api.beeatlas.net) had the code.
Pushed `main`; deployed the site (deploy.yml green); on maderas: `git pull`, applied
notes-store migration **0003** (`body_html` + `author_id` FK) with the absolute `uv`
path, restarted `beeatlas-api`. Live smoke: `GET /api/notes?species=…` → 200,
unauth `POST` → 401.

## Checkpoint results

### Task 1 — Live author create → edit → delete (APPROVED)
Author create/edit/delete each reflect immediately in the hydrated `<bee-notes>` island;
signed-out/private-window reader sees only the baked static list with no runtime
`api.beeatlas.net` call on page load and no "Add note" affordance. User noted the
guest-visibility freshness gap (a live note is invisible to guests until the next nightly
bake) as a rough edge — captured as a future improvement in
`.planning/todos/pending/notes-guest-freshness-gap.md`.

### Task 2 — Forged-author + cross-origin + unauthenticated rejection (APPROVED)
Live curl confirmed unauthenticated `POST`/`PATCH`/`DELETE` on the real routes
(`/api/notes`, `/api/notes/<id>`) → **401**. Cross-origin-with-session (403),
cross-author PATCH/DELETE (403), client-supplied `author_id` ignored, and `<script>`
inert are each covered by green unit tests (`test_create_note_foreign_origin_is_403`,
`test_edit_note_by_non_owner_is_403`, `test_delete_note_by_non_owner_is_403`,
`test_create_note_forged_author_id_in_body_is_ignored`,
`test_script_tag_survives_only_as_inert_text`) AND were proven live in the Phase-178
security UAT against the same `require_author` stack. `create_note` derives `author_id`
from the session identity only (`main.py:371`); PATCH/DELETE load-then-403 on ownership
mismatch (IDOR-safe). User's live `<script>alert(1)</script>` note rendered inert
(now `status='removed'` in the store).

### Task 3 — notes.json on the public static site after a nightly cycle (APPROVED)
Operator-triggered `bash data/nightly.sh` on maderas: harvest reported
"1 species with notes, 455 bytes" → uploaded hashed `notes-b3acaafbf23f.json` to S3 +
updated `manifest.json` → CloudFront invalidation → `repository_dispatch` fired →
deploy.yml rebuilt the site (green). Served HTML of
`/species/Agapostemon/subtilior/index.html` now carries the note in a server-rendered
`<section class="notes-section">` with the **harvest-resolved byline**
(`Peter Abrahamsen` + `/collectors/rainhead/` link — not the live `@login` fallback),
present in the raw `curl` source (no runtime API call). `notes.json` is gitignored and
untracked.

## Deviation from plan (fix applied + committed)

**`data/nightly.sh` did not set `NOTES_DB_PATH`** (commit `3154a07a`). The notes-harvest
step reads the store via `notes_store.db.make_engine`, whose default
(`/opt/beeatlas-store/notes.db`) is ABSENT on maderas; the write API writes to
`/home/peter/beeatlas-store/notes.db`. Without the env export the harvest either read a
nonexistent store (crash → whole nightly aborts, exit 1) or an empty one — no author note
could reach the static page. Fix: export `NOTES_DB_PATH`
(`${NOTES_DB_PATH:-$HOME/beeatlas-store/notes.db}`) into the `run.py` invocation,
matching the API systemd unit and go-live runbook §A4. Verified end-to-end by the
successful second nightly run above.

Process note: the FIRST nightly ran the OLD on-disk script (bash parses at invocation;
nightly.sh's own internal `git pull` updates the file too late for the running process).
Pull on the host BEFORE invoking nightly.sh.

## Decision: harvest stays fail-loud

The harvest aborting the entire nightly on a notes-store open error was reviewed; user
chose to **keep it fail-loud** (2026-07-04) rather than graceful-degrade — a broken notes
pipeline must be impossible to miss, over silently publishing an empty `notes.json`.

## Verification
- All three human-verify checkpoints signed off "approved"
- Full suites green pre-UAT: `npm test` (40 files, 956 tests) + `cd data && uv run pytest -m "not integration"` (474 passed, 9 skipped)
- No HIGH-severity failure shipped: the one blocking defect found (harvest store mis-wire) was fixed and re-verified live before phase close
