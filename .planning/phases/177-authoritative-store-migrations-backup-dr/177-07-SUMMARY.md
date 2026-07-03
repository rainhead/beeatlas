# 177-07 Summary — Operator gates on maderas (STORE-03 + STORE-04)

**Plan:** 177-07 (autonomous: false — operator-only, maderas + AWS)
**Completed:** 2026-07-03
**Result:** Both operator gates demonstrated and recorded. Phase 177 requirements STORE-01..04 all satisfied end-to-end on real infrastructure.

## What was done

### Task 1 — Deploy backup bucket + bootstrap the store
- `cdk deploy BeeAtlasStack` created `AuthoritativeBackupBucket` = `beeatlasstack-authoritativebackupbucket144dcc85-q0yzx52wsvse`. Verified: Versioning enabled, 180-day object + noncurrent-version lifecycle, deployer OIDC role has zero access, pipeline user has Put/Get/List but no Delete. `cdk diff` was purely additive (no change to siteBucket / CloudFront / GlobalStack).
- Store bootstrapped on maderas at `~/beeatlas-store/notes.db` (home dir — maderas has no passwordless sudo; outside `/tmp/beeatlas-export`, `/tmp/beeatlas.duckdb`, and the git checkout). Migrated to `0001`, seeded (3 notes), `journal_mode=wal` persisted, running under uv's Python 3.14.3 / SQLite 3.50.4. First real snapshot pushed: `backups/notes_20260703_211606.db.gz`.

### Task 2 — Restore drill (STORE-03 / WRITE-04 launch gate) — PASS
- Downloaded the snapshot, restored into a scratch DB, confirmed live vs restored match on note count (3), `alembic_version` (0001), and table set. Recorded in the runbook Drill Log. **No public write may open before this gate — it is now met.**

### Task 3 — Nightly-isolation proof (STORE-04) — PASS
- Ran a full `bash data/nightly.sh` on maderas (exit 0). The pipeline did its normal work (dbt build, exports → `s3://sitebucket/data/`, CloudFront invalidation, DuckDB backup → `s3://sitebucket/db/`).
- `notes.db` sha256 + mtime **unchanged** before/after; backup bucket object count **unchanged** (1). Structural check: `nightly.sh` never names the store path or backup bucket. Physical + IAM isolation demonstrated.

## Deviations / findings
- The operator drill exposed two real defects in the shipped artifacts, both fixed + validated:
  - `alembic.ini` `prepend_sys_path=../../..` pointed at the repo root (one level too high) so the Alembic CLI could not import `notes_store`. Fixed with `%(here)s/../..` anchoring; re-validated on maderas (`alembic … current` → `0001 (head)`, exit 0).
  - The DR runbook assumed `/opt` + sudo, a `sqlite3` CLI (absent on maderas), and permanent WAL sidecars (they are transient). All corrected.
- Framework decision landed during this work: the health skeleton was swapped FastAPI → **Flask** for the Phase-178 `mod_fcgid` (on-demand, no systemd) serving model at `api.beeatlas.net`.

## Follow-ups (Phase 178, not this phase)
- DNS A-record `api.beeatlas.net` → 45.79.96.48 + certbot cert; Apache `mod_fcgid` vhost + `.fcgi` wrapper; iNat OAuth (PKCE) + author allowlist + CSRF; CORS for the cross-origin `beeatlas.net` → `api.beeatlas.net` split.
- Wire the hourly backup cron on maderas (runbook §3) once the write layer is live.
- ROADMAP 178/179 re-scope (API Gateway/Lambda → maderas-hosted service).
