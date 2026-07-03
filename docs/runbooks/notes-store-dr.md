# Notes Store — Disaster Recovery Runbook

**Covers:** STORE-03 (restore drill) + STORE-04 (nightly-isolation proof)
**Phase:** 177 (Authoritative Store, Migrations & Backup/DR)
**Related:** [ADR 0002 — Derived vs Authoritative Artifacts](../adr/0002-derived-vs-authoritative-artifacts.md)

---

## 1. Store Placement

The SQLite file lives at a **persistent, operator-chosen path outside the git checkout,
`EXPORT_DIR` (/tmp/beeatlas-export/), and `DB_PATH` (/tmp/beeatlas.duckdb)**. The pipeline
cannot accidentally reach it, and `git clean`, `git checkout .`, or a rogue `s3 sync` cannot
overwrite it.

**Default path:** `/opt/beeatlas-store/notes.db` (operator may choose any path satisfying
the isolation constraint above; document the chosen path in a server-specific README).

SQLite's WAL mode creates two sidecar files alongside the main DB:

```
/opt/beeatlas-store/
├── notes.db         ← the authoritative store
├── notes.db-wal     ← WAL journal (auto-managed by SQLite)
└── notes.db-shm     ← WAL shared-memory index (auto-managed by SQLite)
```

**Never move `notes.db` without its sidecars** — a raw copy of the `.db` file alone is
an inconsistent torn snapshot (Pitfall 1 in the RESEARCH doc). The backup script uses
`sqlite3.Connection.backup()` which handles WAL atomically.

**Set `NOTES_DB_PATH` in the environment for all scripts that reference the store:**

```bash
export NOTES_DB_PATH=/opt/beeatlas-store/notes.db
```

---

## 2. Bootstrap (First-Time Setup)

Run once on maderas before starting the app or running any backup.

### 2a. Create the store directory

```bash
sudo mkdir -p /opt/beeatlas-store
sudo chown $(whoami) /opt/beeatlas-store
```

### 2b. Run the initial migration

```bash
cd ~/dev/beeatlas/data
NOTES_DB_PATH=/opt/beeatlas-store/notes.db \
  uv run alembic -c notes_store/migrations/alembic.ini upgrade head
```

This creates `notes.db` (if it doesn't exist), applies the initial schema, and records
`version_num='0001'` in `alembic_version`.

### 2c. (Optional) Seed sample notes

```bash
NOTES_DB_PATH=/opt/beeatlas-store/notes.db \
  uv run python -m notes_store.seed
```

### 2d. Start the app once to create WAL sidecars

```bash
NOTES_DB_PATH=/opt/beeatlas-store/notes.db \
  uvicorn data.notes_app.main:app --host 127.0.0.1 --port 8001 &
```

The `-wal` and `-shm` sidecars are created on first write. They must exist before the
Phase-179 nightly harvest opens the DB read-only.

---

## 3. Backup Cadence

**Separate cron from `nightly.sh`** — backup frequency is independent of pipeline
frequency. Recommended: hourly.

```cron
# maderas crontab — hourly notes store backup
0 * * * * NOTES_DB_PATH=/opt/beeatlas-store/notes.db \
           NOTES_BACKUP_BUCKET=<BackupBucketName> \
           ~/dev/beeatlas/data/.venv/bin/python \
           ~/dev/beeatlas/data/backup_notes.py >> /var/log/beeatlas-backup.log 2>&1
```

Replace `<BackupBucketName>` with the CDK output `BackupBucketName` from `cdk deploy`
(plan 177-02). The script uses the `beeatlas` AWS profile (matching `nightly.sh`).

**What the script does:**
1. Opens `NOTES_DB_PATH` read-only via URI mode (`?mode=ro`)
2. Takes a consistent WAL-safe snapshot via `sqlite3.Connection.backup()`
3. Gzips at compresslevel=9 to a temp directory
4. Uploads to `s3://$NOTES_BACKUP_BUCKET/backups/notes_YYYYMMDD_HHMMSS.db.gz`
5. Cleans up the temp file
6. Prints `=== notes backup <ts> → s3://<bucket>/<key> ===`

RPO = 1 hour (hourly cron). If the risk tolerance ever requires near-second PITR,
see §6 (Deferred: Litestream).

---

## 4. Restore Drill (STORE-03 Gate)

**Run this before any public write endpoint accepts traffic** (D-12). Complete the
Drill Log below and commit the updated runbook.

### 4a. List recent backups

```bash
aws --profile beeatlas s3 ls s3://$NOTES_BACKUP_BUCKET/backups/ | tail -5
```

### 4b. Download the most recent snapshot

```bash
export LATEST_KEY=$(aws --profile beeatlas s3 ls s3://$NOTES_BACKUP_BUCKET/backups/ \
  | sort | tail -1 | awk '{print $4}')
aws --profile beeatlas s3 cp \
  "s3://$NOTES_BACKUP_BUCKET/backups/$LATEST_KEY" \
  /tmp/test-restore.db.gz
```

### 4c. Decompress

```bash
gunzip -k /tmp/test-restore.db.gz
# Produces /tmp/test-restore.db
```

### 4d. Verify the restored DB

```bash
python3 - <<'EOF'
import sqlite3
conn = sqlite3.connect("/tmp/test-restore.db")
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables:", [t[0] for t in tables])
notes = conn.execute("SELECT count(*) FROM notes").fetchone()
print("Note count:", notes[0])
version = conn.execute("SELECT version_num FROM alembic_version").fetchone()
print("Schema version:", version[0])
conn.close()
print("RESTORE VERIFIED OK")
EOF
```

**Expected output (post-bootstrap):**
```
Tables: ['notes', 'note_revisions', 'alembic_version']
Note count: <N>
Schema version: 0001
RESTORE VERIFIED OK
```

### 4e. Clean up

```bash
rm /tmp/test-restore.db /tmp/test-restore.db.gz
```

### Drill Log

Append a row each time the drill is completed before the phase gate is closed.

| Date | Operator | Note count | Schema version | Result |
|------|----------|------------|----------------|--------|
| (first run pending — run before phase exit) | | | | |

---

## 5. Nightly-Isolation Proof (STORE-04)

This demonstrates that a full `nightly.sh` pipeline run does NOT touch `notes.db`
or the backup bucket — confirming physical and IAM separation (D-17).

### 5a. Record pre-nightly baselines

```bash
# On maderas, before starting the nightly
sha256sum /opt/beeatlas-store/notes.db
ls -la /opt/beeatlas-store/notes.db

# Snapshot of backup bucket objects (count + latest key)
aws --profile beeatlas s3 ls s3://$NOTES_BACKUP_BUCKET/backups/ | wc -l
aws --profile beeatlas s3 ls s3://$NOTES_BACKUP_BUCKET/backups/ | sort | tail -1
```

### 5b. Run a full nightly pipeline

```bash
bash ~/dev/beeatlas/data/nightly.sh
```

### 5c. Confirm store and backup bucket are untouched

```bash
# notes.db sha256 and mtime must be UNCHANGED
sha256sum /opt/beeatlas-store/notes.db
ls -la /opt/beeatlas-store/notes.db

# Backup bucket object count must be UNCHANGED (no new objects from nightly.sh)
aws --profile beeatlas s3 ls s3://$NOTES_BACKUP_BUCKET/backups/ | wc -l
aws --profile beeatlas s3 ls s3://$NOTES_BACKUP_BUCKET/backups/ | sort | tail -1
```

**What to look for:**
- The sha256 hash of `notes.db` must be identical before and after the nightly run.
- The mtime of `notes.db` must be unchanged.
- The backup bucket object count must be identical (the nightly has no IAM access to
  the backup bucket — structural boundary; `pipelineUser` has `PutObject + GetObject`
  only on the backup bucket, granted explicitly in plan 177-02; `nightly.sh` never
  references `NOTES_BACKUP_BUCKET`).

**Why this matters:** STORE-04 proves that the pipeline cannot accidentally overwrite
or delete authoritative data. The `s3 cp --recursive` calls in `nightly.sh` target
`$EXPORT_DIR/feeds/`, `$EXPORT_DIR/species-maps/`, and `$EXPORT_DIR/place-maps/` (all
under `/tmp/beeatlas-export/`) — none of these paths can reach `/opt/beeatlas-store/`.

---

## 6. Deferred: Litestream (Continuous WAL Replication)

Litestream is **NOT built in Phase 177** (D-10). It is documented here as a future add
for operators who need near-second RPO.

**When to reconsider:** If the 1-hour RPO from hourly snapshots becomes unacceptable
(e.g., loss of 59 minutes of expert notes is a material concern), Litestream can stream
WAL frames to S3 in near-real-time alongside the existing snapshot cron. The snapshot
cron remains useful as a recovery checkpoint for structured restores.

**What Litestream would add:**
- PITR (point-in-time recovery) to any second within the retention window
- Automatic WAL frame uploads on each write transaction
- A `litestream restore` command that downloads and applies WAL frames

Litestream installation and config are outside the scope of Phase 177. Revisit when
Phase 180 (Moderation Loop) is live and write traffic patterns are understood.

---

## 7. Phase-179 Read Path

The Phase-179 nightly harvest opens `notes.db` **read-only in WAL mode** (`?mode=ro`,
D-16). This requires:

1. The WAL sidecars (`notes.db-wal`, `notes.db-shm`) must exist alongside `notes.db`.
   They are created the first time the app writes. Run the bootstrap (§2) and start the
   app at least once before running the Phase-179 harvest.
2. The harvest opens the DB directly as a file — no HTTP call to the app; the app need
   not be running during the nightly.
3. The directory containing `notes.db` must be readable by the pipeline user (confirm
   with `ls -la /opt/beeatlas-store/`).

The read-only WAL access pattern (`sqlite3.connect(f"file:{path}?mode=ro", uri=True)`)
is the same API used by `backup_notes.py` — both open the store without acquiring write
locks, so the app can continue serving writes concurrently.

---

*Last updated: 2026-07-03 (plan 177-06)*
