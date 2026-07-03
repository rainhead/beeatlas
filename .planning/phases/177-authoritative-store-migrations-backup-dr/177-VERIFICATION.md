---
phase: 177-authoritative-store-migrations-backup-dr
verified: 2026-07-03T21:45:00Z
status: passed
score: 4/4
overrides_applied: 0
---

# Phase 177: Authoritative Store, Migrations & Backup/DR — Verification Report

**Phase Goal:** The first non-reproducible authoritative store exists end-to-end — SQLite on maderas holding notes + roles-affordances with attribution/moderation shape, forward-only Alembic migrations recorded in a ledger, physical + IAM separation from beeatlas.duckdb and the /data/ S3 prefix, and a demonstrated backup restore — all before any write endpoint opens (Phase 178).

**Verified:** 2026-07-03T21:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | STORE-01: Store holds notes with author identity, timestamps, status, and role/allowlist affordances; seedable via script | VERIFIED | `data/notes_store/models.py`: Note has `author_id`, `created_at`, `updated_at`, `status`, `canonical_name`, `body`; NoteRevision append-only audit ledger; `roles_allowlist.toml` + `roles.py` committed allowlist; `seed.py` inserts rows without write UI. 25 tests pass including schema, WAL, multi-note-per-species, status default, seed, and roles tests. |
| 2 | STORE-02: Forward-only versioned migrations in Alembic ledger; run.py/nightly never migrate or write the store | VERIFIED | `0001_initial_schema.py` `downgrade()` raises `NotImplementedError`; `alembic_version` ledger stamped; `env.py` uses `render_as_batch=True`; `test_migration_applies` confirms `alembic_version.version_num='0001'`; `test_run_py_never_migrates` inspects `run.py` text and confirms zero references to `notes_store`, `alembic`, `notes.db`, `NOTES_DB_PATH`. Grep of `nightly.sh` returns no matches. CDK and all 25 notes tests pass. |
| 3 | STORE-03: Consistent-snapshot backup to dedicated versioned S3 bucket; test-restore demonstrated before any public write | VERIFIED | `backup_notes.py` uses `sqlite3.Connection.backup()` (online-backup API; no `shutil.copy`, no `os.system`); `AuthoritativeBackupBucket` deployed with versioning + 180-day lifecycle + RETAIN policy; `test_restore_roundtrip` confirms row count + `alembic_version` parity. Operator drill PASS on 2026-07-03: snapshot `backups/notes_20260703_211606.db.gz` from live bucket, restored into scratch DB, 3 notes == 3 notes, version 0001 == 0001; recorded in `docs/runbooks/notes-store-dr.md` Drill Log. Litestream deferred per D-10/D-11; REQUIREMENTS.md STORE-03 wording already relaxed to snapshot-based recovery. |
| 4 | STORE-04: Physical + IAM separation from beeatlas.duckdb and /data/ prefix; normal green nightly provably cannot reach or overwrite the store | VERIFIED | CDK synth assertions (all pass via `npx ts-node test/beeatlas-stack.test.ts`): (a) deployer role `beeatlas-github-deployer` has ZERO references to `AuthoritativeBackupBucket`; (b) pipeline user has `PutObject + GetObject` but NOT `DeleteObject`; (c) `ListBucket` at bucket level. Bucket: `versioned=true`, `RemovalPolicy.RETAIN`, 180-day lifecycle. `nightly.sh` has no reference to `notes_store`, `beeatlas-store`, or `NOTES_BACKUP_BUCKET`. Operator nightly-isolation PASS on 2026-07-03: full `nightly.sh` exit 0; `notes.db` sha256 + mtime unchanged; backup bucket object count unchanged. Recorded in DR runbook. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/notes_store/models.py` | Note + NoteRevision ORM models | VERIFIED | 64 lines; both tables with all required columns; SQLAlchemy 2.0 |
| `data/notes_store/db.py` | WAL engine factory | VERIFIED | `make_engine()` sets WAL + foreign_keys + synchronous=NORMAL via event hook |
| `data/notes_store/roles.py` | Committed allowlist loader | VERIFIED | Loads `roles_allowlist.toml` at import time; `is_author()`, `is_curator()`, `role_of()` |
| `data/notes_store/seed.py` | Seedable via script (D-04) | VERIFIED | Inserts 3 sample notes; invocable as `python -m notes_store.seed` |
| `data/roles_allowlist.toml` | Git-tracked allowlist | VERIFIED | `example_author`/`example_curator` entries; auditable via git history |
| `data/notes_store/migrations/versions/0001_initial_schema.py` | Forward-only Alembic migration | VERIFIED | `upgrade()` creates both tables + index; `downgrade()` raises `NotImplementedError` |
| `data/notes_store/migrations/env.py` | Alembic env with render_as_batch | VERIFIED | `render_as_batch=True`, NOTES_DB_PATH env var, offline mode raises |
| `data/backup_notes.py` | Consistent-snapshot backup | VERIFIED | `sqlite3.Connection.backup()` API; gzip; boto3 upload; three-function testable split |
| `data/notes_app/main.py` | Health-only Flask skeleton | VERIFIED | Single `/health` GET route; no write verbs; WSGI callable for mod_fcgid (Phase 178) |
| `infra/lib/beeatlas-stack.ts` | AuthoritativeBackupBucket + IAM isolation | VERIFIED | Lines 280-310; versioned + RETAIN + 180-day lifecycle; pipeline PutObject+GetObject only; deployer zero-grant |
| `infra/test/beeatlas-stack.test.ts` | STORE-04 synth assertions | VERIFIED | Lines 90-226; 5 assertions covering bucket properties, deployer zero-access, pipeline grants, no-DeleteObject |
| `docs/runbooks/notes-store-dr.md` | DR runbook + Drill Log with PASS entries | VERIFIED | Restore drill PASS + STORE-04 isolation PASS recorded on 2026-07-03 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backup_notes.py` | dedicated S3 bucket | `boto3.Session.upload_file()` | WIRED | `upload_snapshot()` uses bucket from env var; mocked in `test_upload_snapshot_mocked` |
| `notes_store/migrations/env.py` | `notes_store/models.py` | `Base.metadata` | WIRED | `from notes_store.models import Base; target_metadata = Base.metadata` |
| `notes_store/seed.py` | `notes_store/db.py` + `models.py` | `make_engine()` + `Session.add()` | WIRED | Imports and uses both; inserts `Note` rows via ORM session |
| `notes_app/main.py` | Flask WSGI | `app = Flask(__name__)` | WIRED | Module-level `app`; health route registered; `test_health_route_via_client` confirms |
| `infra/lib/beeatlas-stack.ts` | `AuthoritativeBackupBucket` | CDK `s3.Bucket` + `pipelineUser.addToPolicy` | WIRED | Bucket created at line 280; pipeline IAM grants at lines 295-306; CDK output at line 308 |
| `run.py` | notes store | (none — STORE-02) | NOT_WIRED (correct) | `test_run_py_never_migrates` confirms absence: `notes_store`, `alembic`, `notes.db`, `NOTES_DB_PATH` all absent |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 25 notes-store tests pass | `cd data && uv run pytest tests/test_notes_*.py tests/test_backup_notes.py -v` | 25 passed in 1.00s | PASS |
| Full data suite regression-clean | `cd data && uv run pytest -m "not integration" -q` | 342 passed, 9 skipped in 10.41s | PASS |
| CDK STORE-04 synth assertions | `cd infra && npx ts-node test/beeatlas-stack.test.ts` | All CDK assertions passed | PASS |

### Probe Execution

Step 7c: No conventional `scripts/*/tests/probe-*.sh` files declared or found for this phase. Operator proofs (restore drill, nightly isolation) were run on maderas and recorded in `docs/runbooks/notes-store-dr.md` Drill Log per the VALIDATION.md design — the local pipeline cannot run dbt/full nightly (memory `project_local_dbt_build_not_runnable`). The Drill Log entries, bucket name, sha256/mtime evidence, and nightly exit-0 are the authoritative proofs.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| STORE-01 | Notes with author identity, timestamps, status, role/allowlist affordances; seedable | SATISFIED | models.py + roles.py + seed.py; 15 tests covering schema, roles, seed |
| STORE-02 | Forward-only migrations; run.py/nightly never migrate or write | SATISFIED | 0001 migration forward-only; `test_run_py_never_migrates` + nightly.sh grep clean |
| STORE-03 | Consistent-snapshot backup to versioned S3; demonstrated restore | SATISFIED | backup_notes.py online-backup API; CDK bucket verified; Drill Log PASS 2026-07-03 |
| STORE-04 | Physical + IAM separation from beeatlas.duckdb and /data/ | SATISFIED | CDK synth assertions + nightly-isolation PASS 2026-07-03 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docs/runbooks/notes-store-dr.md` | §1 + §2a | Code default path (`/opt/beeatlas-store/`) differs from deployed path (`~/beeatlas-store/`) | INFO | Cosmetic inconsistency; runbook documents the deviation ("maderas has no passwordless sudo"); `NOTES_DB_PATH` env var overrides the default. STORE-04 isolation is satisfied regardless of prefix. Not a blocker. |

No debt markers (`TBD`, `FIXME`, `XXX`) found in any phase-177 files. No empty return stubs. No raw-copy hazard (confirmed by `test_no_raw_copy`).

### Human Verification Required

None. All STORE-01..04 truths are verified by automated tests (25 passing), CDK synth assertions, and operator Drill Log entries on maderas (restore drill + nightly isolation). The VALIDATION.md explicitly classified the restore drill and nightly-isolation proof as manual-only for environment reasons, and both are recorded with hash evidence.

---

## Gaps Summary

None. All four STORE requirements achieved.

---

_Verified: 2026-07-03T21:45:00Z_
_Verifier: Claude (gsd-verifier)_
