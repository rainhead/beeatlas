---
phase: 180-moderation-loop
plan: 05
subsystem: infra
tags: [alembic, sqlite, maderas, deploy, uat, moderation, operator]

# Dependency graph
requires:
  - phase: 180-01-migration-note-revisions-reason
    provides: "migration 0004 (note_revisions.reason nullable) applied to the live store"
  - phase: 180-02-curator-authz-routes
    provides: "POST /api/notes/{id}/takedown + /restore, _is_curator_fresh authz"
  - phase: 180-03-curator-takedown-ui
    provides: "curator-gated Take-down control on <bee-notes> (live-island removal)"
  - phase: 180-04-verification-tests
    provides: "MOD-04 harvest-exclusion + MOD-03 audit-field invariants (tests)"
provides:
  - "migration 0004 applied to the live maderas notes store (note_revisions.reason present)"
  - "operator-verified end-to-end MOD-04 takedown loop on the live site + curl-only restore (D-07)"
  - "confirmed static-page clearing is driven by the nightly repository_dispatch site rebuild, not the bare harvest"
affects: [v8.0-milestone-close, gsd-verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator migration apply: `NOTES_DB_PATH=$HOME/beeatlas-store/notes.db uv run alembic -c notes_store/migrations/alembic.ini upgrade head` (the -c anchors script_location=%(here)s; bare `alembic upgrade head` fails with 'No script_location key' because the ini lives under migrations/, not the cwd)"
    - "Takedown → public-site clearing requires a full nightly.sh run (harvest AND its repository_dispatch:nightly-data-updated site rebuild), or a manual `gh workflow run deploy.yml`; a bare harvest updates notes.json on S3 but leaves the baked species HTML stale"

key-files:
  created: []
  modified: []

key-decisions:
  - "No code written — this plan is the operator migration apply + blocking human UAT gate only (files_modified: [])"
  - "Restore verified via curl only (D-07): POST /api/notes/{id}/restore has no UI by design"

patterns-established:
  - "The baked species HTML refreshes only when deploy.yml re-bakes it; the <bee-notes> island re-fetches from the read endpoint only after the current user's own write (_liveNotes ?? bakedNotes), so a passive reader sees baked notes until the next site rebuild — 'within one build cycle' = the nightly repository_dispatch rebuild"
---

## What shipped

Phase 180's closing plan: applied the store migration on production and ran the
blocking end-to-end MOD-04 UAT. No repository code changed.

### Task 1 — Operator migration apply (human-action, resolved: "migrated")

Migration `0004` (nullable `note_revisions.reason`) is applied to the live
maderas SQLite store (`$HOME/beeatlas-store/notes.db`); `alembic current`
reports `0004`, `PRAGMA table_info(note_revisions)` lists the nullable `reason`
column, and the systemd-user Waitress write service was restarted so it serves
the Phase-180 code (new `/takedown` + `/restore` routes and the migrated model).

**Operator friction captured:** the first attempt (`uv run alembic upgrade head`
from `notes_store/`) failed with `No 'script_location' key found in configuration`.
Cause: the ini lives at `data/notes_store/migrations/alembic.ini` and deliberately
carries no `sqlalchemy.url`; without `-c <path-to-ini>` Alembic loads an empty
default config. Fix: `NOTES_DB_PATH=$HOME/beeatlas-store/notes.db uv run alembic
-c notes_store/migrations/alembic.ini upgrade head` (run from `data/`).

**Deploy prerequisite captured:** the Phase-180 commits (incl. `0004`) were
local-only; `origin/main` lacked the migration until pushed. The operator step
requires the merged code on the remote first (push → host `git pull`).

### Task 2 — End-to-end MOD-04 UAT + curl restore (human-verify, resolved: "approved")

The operator walked the full loop on the live site (curator = allowlisted
`rainhead`) and confirmed all six steps: author submit → live-island render →
baked into `notes.json`; curator Take-down → immediate live-island removal +
banner; **absent from the rebuilt static species page**; curl restore →
`status='approved'` and reappearance after harvest; non-curator negative check
(no Take-down control on others' notes).

## Notable finding (resolved during UAT)

A taken-down note (`id=11`, `Bombus rufocinctus`) briefly **remained on the
static species page** while already excluded from the store, the harvest, the S3
`notes.json`, and the read API. Root cause was not a moderation bug but an
intermediate UAT state: the harvest had regenerated `notes.json` (note excluded)
but **no site rebuild had run since the takedown**, so the baked species HTML was
frozen at the prior `deploy.yml` bake. The `<bee-notes>` island only re-fetches
after the current user's own write, so a passive reader sees baked notes until
the next rebuild. Triggering `gh workflow run deploy.yml` re-baked from the
already-correct `notes.json` and the note cleared (page 4081 → 3391 bytes,
`bakedNotes = []`). Operational rule recorded in `patterns` above: use a full
`nightly.sh` (harvest + its `repository_dispatch` rebuild) — not a bare harvest —
to exercise the public-site clearing.

## Verification

- Operator: `alembic current` → `0004`; `PRAGMA table_info(note_revisions)` lists nullable `reason`; Waitress restarted and serving.
- Human UAT: all six MOD-04 steps pass (submit → publish → takedown → curl restore → non-curator negative check).

## Requirements

- MOD-02 (deploy-free curator takedown; hidden excluded from harvest) — verified live.
- MOD-04 (takedown clears the public site within one build cycle; immediate live-island removal) — verified live.

## Self-Check: PASSED

Both blocking checkpoints resolved by the operator; no repo files modified (files_modified: []).
