---
phase: 177
plan: "06"
subsystem: data/backup
tags: [backup, sqlite, s3, dr, runbook]
one_liner: "WAL-safe SQLite consistent snapshot via stdlib backup API + gzip/S3 push, with proven restore roundtrip and operator DR runbook"
dependency_graph:
  requires: [177-01, 177-03]
  provides: [backup_notes.py, test_backup_notes.py, notes-store-dr.md]
  affects: [177-07]
tech_stack:
  added: []
  patterns:
    - "sqlite3.Connection.backup() for WAL-safe consistent snapshot (never shutil.copy)"
    - "boto3.Session(profile_name=profile) mirroring nightly.sh beeatlas profile"
    - "?mode=ro URI flag for read-only source open"
    - "gzip compresslevel=9 for snapshot compression"
key_files:
  created:
    - data/backup_notes.py
    - data/tests/test_backup_notes.py
    - docs/runbooks/notes-store-dr.md
    - docs/runbooks/ (new directory)
  modified: []
decisions:
  - "make_snapshot / upload_snapshot split for local testability without S3 credentials"
  - "?mode=ro source open + src.backup(dst) — no shutil.copy allowed (Pitfall 1 guard)"
  - "Hourly backup cron separate from nightly.sh (backup frequency independent of pipeline cadence)"
  - "Litestream explicitly deferred (D-10) and documented in runbook"
metrics:
  duration_seconds: 286
  completed_date: "2026-07-03"
  tasks_completed: 3
  files_created: 4
---

# Phase 177 Plan 06: Backup Script + DR Runbook Summary

**One-liner:** WAL-safe SQLite consistent snapshot via stdlib backup API + gzip/S3 push, with proven restore roundtrip and operator DR runbook.

## What Was Built

### `data/backup_notes.py`

Three public functions split for testability (S3 not required locally):

- **`make_snapshot(db_path, out_dir) -> Path`** — opens source via `sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)`, copies consistently with `src.backup(dst)` (WAL-aware, no torn reads), gzips at `compresslevel=9` to `<out_dir>/notes_<UTC-ts>.db.gz`, returns the gz path. Never uses raw file copy utilities (Pitfall 1 guard).
- **`upload_snapshot(gz_path, bucket, profile="beeatlas", key_prefix="backups/") -> str`** — pushes via `boto3.Session(profile_name=profile).client("s3").upload_file()`, returns the S3 key. Mirrors the `AWS_PROFILE=beeatlas` convention from `nightly.sh`.
- **`backup_notes()`** — orchestrator reading `NOTES_DB_PATH`, `NOTES_BACKUP_BUCKET` (required; `KeyError` if absent), `AWS_PROFILE` (default `beeatlas`). Writes to a `/tmp` staging dir, uploads, cleans up, prints `=== notes backup <ts> → s3://<bucket>/<key> ===`.

### `data/tests/test_backup_notes.py`

4 tests covering STORE-03:

1. **`test_backup_produces_valid_db`** — `make_snapshot()` returns a `.db.gz` that gunzips to a valid SQLite DB with the `notes` table.
2. **`test_restore_roundtrip`** — restored snapshot has identical note count AND `alembic_version.version_num` as the source (STORE-03 integrity).
3. **`test_no_raw_copy`** — source-level guard: `.backup(` present, `shutil.copy` and `os.system` absent (Pitfall 1).
4. **`test_upload_snapshot_mocked`** — boto3.Session mocked; asserts correct bucket and `backups/notes_` key prefix (no real S3 call).

### `docs/runbooks/notes-store-dr.md`

Operator DR runbook covering:
1. Store placement outside `EXPORT_DIR`/`DB_PATH`/git (D-15) + WAL sidecar note
2. Bootstrap: `alembic upgrade head`, optional seed, first app start
3. Backup cadence: hourly cron separate from `nightly.sh` (RPO = 1 hour)
4. Restore drill (STORE-03 gate): `aws s3 cp` → `gunzip` → verify count + `alembic_version` → Drill Log table
5. Nightly-isolation proof (STORE-04): sha256/mtime + backup bucket object count before/after full nightly
6. Litestream deferred (D-10) — documented as future PITR add
7. Phase-179 read-only WAL access requirements (D-16)

## Verification Results

```
cd data && uv run pytest tests/test_backup_notes.py -x -q
....
4 passed in 0.67s

cd data && uv run pytest -m "not integration" -q
342 passed, 9 skipped, 60 deselected in 9.81s (no regressions)
```

All plan `<verify>` and runbook grep assertions pass.

## Deviations from Plan

**Auto-rewording — comments referencing forbidden strings (Rule 1 — Bug)**
- Found during: Task 1 GREEN phase verification
- Issue: `backup_notes.py` docstrings originally contained `shutil.copy` and references to `os.system` as "forbidden" examples. The `test_no_raw_copy` test checks that these strings do NOT appear anywhere in the file.
- Fix: Reworded comments to avoid the forbidden strings while preserving the intent ("raw file copy utilities" instead of `shutil.copy()`).
- Files modified: `data/backup_notes.py`
- Commit: 5763b7e3

## Known Stubs

The **Drill Log** in `docs/runbooks/notes-store-dr.md` has a placeholder row — intentional. The operator fills it in after running the restore drill in plan 177-07 (the phase-exit gate). This is not a code stub; it is the design (the runbook ships before the drill is run).

## Threat Flags

No new security-relevant surface beyond what was planned in the threat model. The three threats (T-177-05, T-177-06, T-177-04b) are all mitigated by the implementation:
- T-177-05: `.backup()` + `?mode=ro` + `test_no_raw_copy` guard
- T-177-06: `test_restore_roundtrip` proves count + schema version parity
- T-177-04b: `upload_snapshot` targets only `NOTES_BACKUP_BUCKET`; pipeline profile has no `DeleteObject`

## Self-Check

- FOUND: data/backup_notes.py ✓
- FOUND: data/tests/test_backup_notes.py ✓
- FOUND: docs/runbooks/notes-store-dr.md ✓
- FOUND commit 8b91ae3c (test RED) ✓
- FOUND commit 5763b7e3 (feat GREEN) ✓
- FOUND commit b957ab4a (test Task 2) ✓
- FOUND commit 9154f15f (docs Task 3) ✓
- 4 tests pass, 342 total green ✓

## Self-Check: PASSED
