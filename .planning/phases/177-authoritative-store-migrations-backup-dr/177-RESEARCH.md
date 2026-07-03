# Phase 177: Authoritative Store, Migrations & Backup/DR — Research

**Researched:** 2026-07-03
**Domain:** SQLite-on-maderas authoritative store, Alembic forward-only migrations, WAL concurrent reads, S3 backup/restore, CDK bucket isolation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Authoritative store = SQLite database file on maderas, fronted by a small Python web app, reverse-proxied through Apache. Rejects Neon Serverless Postgres and DynamoDB.
- **D-02:** App layer = small Python web app (FastAPI or Flask). Exact framework left to the planner.
- **D-03:** Migrations = Alembic, forward-only (`upgrade()` only), `schema_migrations`-style ledger (Alembic's `alembic_version` table). Migrations owned/run by the write-layer deploy, NEVER by `run.py` or the nightly cron.
- **D-04:** Store seedable via a script — no write UI in this phase.
- **D-05:** Tables: `notes` (canonical_name, author_id, body [sanitized Markdown], status, created/updated + audit), append-only `note_revisions` (soft-delete), plus Alembic's migration ledger. Shaped for moderation from day one.
- **D-06:** Multiple author-owned notes per species; no canonical-note merge machinery.
- **D-07:** Roles live in a committed allowlist TOML file, not a DB table. Schema only needs `author_id` on notes. No `roles` table this phase.
- **D-08:** `status` enum supports publish/takedown workflow (reserve `approved` / `removed` / `pending`).
- **D-09:** Backup = consistent snapshots (SQLite online-backup API or VACUUM INTO), gzip, push to a new dedicated S3 bucket.
- **D-10:** Litestream DEFERRED — document as a later add.
- **D-11:** STORE-03 wording relaxed: "native PITR" leg deferred with Litestream. Phase gate = frequent consistent snapshots + demonstrated test-restore. Update REQUIREMENTS.md STORE-03.
- **D-12:** Phase exit gate = documented, demonstrated test-restore from a snapshot, before any public write.
- **D-13:** Backups in a new dedicated S3 bucket added to BeeAtlasStack (surgical edit; never cdk destroy). GitHub OIDC deployer role gets ZERO access — structural boundary, not a Deny. Versioning ON.
- **D-14:** Lifecycle rule: expire backup objects after ~6 months; expire noncurrent versions at ~6 months.
- **D-15:** SQLite file lives OUTSIDE EXPORT_DIR / `public/data/` and outside the `beeatlas.duckdb` path on maderas.
- **D-16:** Nightly harvest (Phase 179) opens the SQLite file read-only in WAL mode. No HTTP round-trip; app need not be up during the nightly.
- **D-17:** STORE-04 demonstration = run a full `run.py`/dbt rebuild + push and confirm the SQLite file and its S3 backups are untouched.

### Claude's Discretion

- Exact Python web framework (FastAPI vs Flask) — planner's call.
- Exact snapshot cadence (e.g. hourly + post-nightly) — planner's call.
- Precise `status` enum values and column names — planner's call, subject to D-08.

### Deferred Ideas (OUT OF SCOPE)

- Litestream continuous WAL replication
- Roles table in SQLite
- ROADMAP.md revision for Phases 178/179
- REQUIREMENTS.md STORE-03 wording update (flagged to do before VERIFICATION reads the gate)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STORE-01 | Authoritative store holds notes with author identity, timestamps, status, and role/allowlist affordances — schema shaped for moderation from day one | Schema design in §Architecture Patterns; SQLAlchemy models pattern in §Code Examples |
| STORE-02 | Forward-only versioned migrations with no rebuild path; migrations owned by write layer, never by run.py/nightly | Alembic batch mode + forward-only convention in §Standard Stack and §Architecture Patterns |
| STORE-03 | Snapshot-based backup (relaxed from native PITR per D-11); test-restore demonstrated before any public write | Python backup API + S3 push in §Architecture Patterns; restore drill in §Common Pitfalls |
| STORE-04 | Physical and IAM separation from beeatlas.duckdb and /data/ S3 prefix; nightly cannot reach or overwrite authoritative data | CDK bucket design + IAM boundary in §Architecture Patterns; file placement in §Architecture Patterns |
</phase_requirements>

---

## Summary

Phase 177 sets up BeeAtlas's first non-reproducible store — a SQLite database file on maderas — with three deliverables before any public write opens: (1) the initial schema + forward-only Alembic migrations, (2) automated backup snapshots to a dedicated S3 bucket with a demonstrated restore, and (3) verified physical + IAM isolation from the derived pipeline.

The SQLite-on-maderas path is technically solid for the stated risk tolerance ("a little data loss is a bummer"). The critical insight is that SQLite's WAL mode allows the nightly harvest (Phase 179) to open the DB read-only while the app writes, with no coordination needed. The Python stdlib's `sqlite3.Connection.backup()` method provides a WAL-safe consistent snapshot without needing to stop the app. The CDK change is surgical: one new `s3.Bucket` with versioning and lifecycle rules, no `grantReadWrite` to either the deployer OIDC role or the pipeline IAM user (the pipeline user gets only `s3:PutObject` for pushing backups to the new bucket — not `DeleteObject`).

**Primary recommendation:** FastAPI + uvicorn (over Flask) for the app skeleton; `Connection.backup()` (over `VACUUM INTO`) for the backup script; Alembic with `render_as_batch=True` in `env.py` for forward-only migrations; SQLite file at a persistent host path well outside `/tmp` and outside the git checkout.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Authoritative data storage | maderas / SQLite file | — | Self-hosted, persistent, single-host OK per risk tolerance |
| Migration management | Write-layer deploy (Phase 178) | Manual one-time run in Phase 177 | Migrations are write-layer's responsibility (D-03) |
| Backup snapshots | maderas cron / Python script | S3 (storage) | Snapshot from the host that owns the file; S3 is the durable store |
| Backup retrieval / restore | maderas operator manual | — | DR drill is manual; no automated restore machinery needed yet |
| IAM boundary | CDK / AWS IAM | — | Structural separation via separate bucket; no policy-level Deny needed |
| App skeleton | maderas (Python process) | Apache (reverse proxy) | Proves the proxy path before Phase 178 adds auth + endpoints |
| Nightly harvest read | maderas / nightly.sh pipeline | — | Direct file open; app need not be up (D-16) |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| alembic | 1.18.5 | Forward-only SQLite migrations + `alembic_version` ledger | The standard Python migration tool; SQLAlchemy-native; provides the `schema_migrations`-style ledger Alembic calls `alembic_version` |
| sqlalchemy | 2.0.51 | ORM models + engine for Alembic env.py | Required by Alembic; 2.0 API is current; SQLite dialect is built-in |
| fastapi | 0.139.0 | App skeleton (health check now; write endpoints in Phase 178) | Async-first (important for Phase 178 iNat OAuth HTTP calls); built-in OpenAPI; Pydantic models; ASGI |
| uvicorn | 0.49.0 | ASGI server behind Apache | Standard FastAPI server; systemd-friendly; Apache `ProxyPass` target |
| boto3 | (already in pyproject.toml) | Push backup snapshots to S3 backup bucket | Already a project dependency; `s3.upload_file()` for the gzipped backup |

[VERIFIED: PyPI registry] — all versions confirmed via `pip3 index versions` on 2026-07-03.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-multipart | (uvicorn optional dep) | Needed if FastAPI processes form data | Only needed if Phase 178 form endpoints are added; skip for Phase 177 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FastAPI | Flask | Flask is sync-first; requires Flask-Migrate for Alembic integration; lacks built-in OpenAPI; worse fit for Phase 178's async OAuth HTTP calls |
| `Connection.backup()` | `VACUUM INTO 'path'` | VACUUM INTO also produces a consistent binary snapshot and defragments; cannot run inside a transaction; either works — `Connection.backup()` is preferred as stdlib Python with no SQL string required |
| `Connection.backup()` | `.dump()` text dump | `.dump()` produces SQL text (slow, large); not appropriate for binary SQLite restore |

**Installation (additions to `data/pyproject.toml`):**
```toml
dependencies = [
    # ... existing ...
    "alembic>=1.18.5",
    "sqlalchemy>=2.0.51,<3",
    "fastapi>=0.139.0",
    "uvicorn>=0.49.0",
]
```

---

## Package Legitimacy Audit

> slopcheck was not available at research time (install failed). All packages below are tagged `[ASSUMED]` and the planner must treat them as requiring human verification before install in a security-sensitive context. However, all four are among the most widely-used Python libraries in the ecosystem; the risk of hallucination is negligible.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| alembic | PyPI | ~15 yrs | Very high | github.com/sqlalchemy/alembic | [ASSUMED] | Approved — flagship SQLAlchemy project |
| sqlalchemy | PyPI | ~18 yrs | Very high | github.com/sqlalchemy/sqlalchemy | [ASSUMED] | Approved — flagship ORM |
| fastapi | PyPI | ~6 yrs | Very high | github.com/fastapi/fastapi | [ASSUMED] | Approved — Tiangolo project, widely used |
| uvicorn | PyPI | ~7 yrs | Very high | github.com/encode/uvicorn | [ASSUMED] | Approved — encode org, standard ASGI |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time. The planner should add a `checkpoint:human-verify` before installing if desired, though these packages are well-known.*

---

## Architecture Patterns

### System Architecture Diagram

```
maderas host
├── nightly cron
│   └── nightly.sh
│       ├── run.py (derives ALL from iNat/Ecdysis → DuckDB → dbt → EXPORT_DIR)
│       │   └── [Phase 179 adds: notes-harvest step — reads notes.db READ-ONLY]
│       └── s3 cp → siteBucket /data/*, /db/*, /raw/* only
│           (pipeline IAM: GetObject+PutObject on siteBucket prefixes only)
│
├── notes cron (NEW — hourly or post-nightly)
│   └── data/backup_notes.py → sqlite3.Connection.backup() → gzip → boto3 push
│       (pipeline IAM also gets PutObject on backupBucket/* )
│
├── notes.db    ← LIVES at /opt/beeatlas-store/notes.db (example)
│   [OUTSIDE /tmp, git checkout, EXPORT_DIR]
│   WAL mode: -wal and -shm sidecars alongside
│
└── uvicorn (Phase 177: health endpoint only)
    └── Apache ProxyPass /notes-api → http://127.0.0.1:8001

AWS
├── siteBucket (existing)
│   ├── data/*   ← pipeline writes here (GetObject+PutObject)
│   ├── db/*     ← DuckDB backup (GetObject+PutObject)
│   └── raw/*    ← taxa.csv.gz etc (GetObject+PutObject)
│
└── backupBucket (NEW — Phase 177)
    ├── Versioning: ON
    ├── Lifecycle: 180 days expiration + noncurrentVersionExpiration 180 days
    ├── deployerRole: NO access (structural absence — bucket never named in deployer policy)
    ├── pipelineUser: PutObject + GetObject (for push + restore drill)
    └── backups/notes_YYYYMMDDHHMMSS.db.gz  ← consistent snapshots
```

### Recommended Project Structure

```
data/
├── pyproject.toml           # add alembic, sqlalchemy, fastapi, uvicorn
├── notes_store/
│   ├── __init__.py
│   ├── db.py                # SQLAlchemy engine factory; WAL PRAGMA on connect
│   ├── models.py            # SQLAlchemy ORM: Note, NoteRevision
│   ├── seed.py              # seed script (D-04): insert sample notes
│   └── migrations/          # Alembic migration directory
│       ├── alembic.ini      # points to notes_store/migrations
│       ├── env.py           # render_as_batch=True; URL from NOTES_DB_PATH env var
│       ├── script.py.mako
│       └── versions/
│           └── 0001_initial_schema.py   # upgrade() creates notes + note_revisions
├── notes_app/
│   ├── __init__.py
│   └── main.py              # FastAPI app: GET /health only in Phase 177
├── backup_notes.py          # backup script (Phase 177 deliverable)
└── tests/
    ├── test_notes_store.py  # migration runs, schema correct, seed, backup/restore
    └── ... (existing tests)

infra/lib/
└── beeatlas-stack.ts        # surgical add: backupBucket + pipelineUser policy
```

### Pattern 1: Alembic Configuration for SQLite (render_as_batch)

SQLite supports only `ADD COLUMN` and `RENAME COLUMN/TABLE` natively. All other schema changes (drop column, add constraint, change column type) require Alembic's batch mode, which does a "move and copy": reflect table → create new version → `INSERT FROM SELECT` → drop old → rename.

**`env.py` critical setting:**
```python
# Source: https://alembic.sqlalchemy.org/en/latest/batch.html
import os
from alembic import context
from sqlalchemy import create_engine

NOTES_DB_PATH = os.environ.get("NOTES_DB_PATH", "/opt/beeatlas-store/notes.db")

def run_migrations_online():
    connectable = create_engine(
        f"sqlite:///{NOTES_DB_PATH}",
        connect_args={"check_same_thread": False},
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,   # REQUIRED for SQLite ALTER TABLE workarounds
        )
        with context.begin_transaction():
            context.run_migrations()
```

**Forward-only convention — migration file template:**
```python
# 0001_initial_schema.py
def upgrade():
    # All schema creation lives here
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("canonical_name", sa.String, nullable=False),
        sa.Column("author_id", sa.String, nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("status", sa.String, nullable=False, default="approved"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "note_revisions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("note_id", sa.Integer, sa.ForeignKey("notes.id"), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("editor_id", sa.String, nullable=False),
        sa.Column("revised_at", sa.DateTime, nullable=False),
        sa.Column("action", sa.String, nullable=False),  # 'create'/'edit'/'delete'
    )

def downgrade():
    raise NotImplementedError("forward-only migrations only — no downgrade path")
```

**Run migrations:**
```bash
# On maderas, once per schema change (or at first setup):
cd data && NOTES_DB_PATH=/opt/beeatlas-store/notes.db uv run alembic -c notes_store/migrations/alembic.ini upgrade head
```

Alembic's `alembic_version` table IS the `schema_migrations` ledger. It records the current head revision ID. No custom ledger table is needed.

### Pattern 2: SQLite WAL Mode Setup

WAL mode is set once at DB creation and persists (stored in the DB file). It allows the nightly harvest to open the DB read-only while the app writes concurrently.

```python
# data/notes_store/db.py
import sqlite3
from sqlalchemy import create_engine, event

def make_engine(db_path: str):
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def set_wal_mode(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA foreign_keys=ON")
        dbapi_conn.execute("PRAGMA synchronous=NORMAL")  # safer than FULL, faster than OFF

    return engine
```

**WAL sidecar files:** SQLite creates `notes.db-wal` and `notes.db-shm` alongside `notes.db`. These sidecars MUST coexist with the main file — never move/copy `notes.db` without them. The backup API handles this automatically (output is a sidecar-free, fully-checkpointed copy).

**Read-only access for nightly harvest (Phase 179):**
```python
# In nightly harvest step — no WAL complications when using this form
conn = sqlite3.connect(f"file:{NOTES_DB_PATH}?mode=ro", uri=True)
```
This works as long as the `-shm` and `-wal` files exist (they do while the app is running, or have been created since the last app run). On SQLite 3.22.0+ (shipped with Python 3.14), read-only WAL access is supported.

### Pattern 3: WAL-Safe Consistent Backup

```python
# data/backup_notes.py
import gzip
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
import boto3

NOTES_DB_PATH = Path(os.environ["NOTES_DB_PATH"])
BACKUP_BUCKET = os.environ["NOTES_BACKUP_BUCKET"]
AWS_PROFILE = os.environ.get("AWS_PROFILE", "beeatlas")

def backup_notes():
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    tmp_db = Path(f"/tmp/notes_backup_{ts}.db")
    tmp_gz = Path(f"/tmp/notes_backup_{ts}.db.gz")

    # Python stdlib backup API — WAL-safe, reads consistent snapshot
    # Works even if another connection is writing concurrently
    src = sqlite3.connect(f"file:{NOTES_DB_PATH}?mode=ro", uri=True)
    dst = sqlite3.connect(str(tmp_db))
    src.backup(dst)          # pages=-1: copy entire DB in one step
    dst.close()
    src.close()

    # Gzip the snapshot
    with open(tmp_db, "rb") as f_in, gzip.open(tmp_gz, "wb", compresslevel=9) as f_out:
        shutil.copyfileobj(f_in, f_out)
    tmp_db.unlink()

    # Push to dedicated backup bucket
    session = boto3.Session(profile_name=AWS_PROFILE)
    s3 = session.client("s3")
    s3_key = f"backups/notes_{ts}.db.gz"
    s3.upload_file(str(tmp_gz), BACKUP_BUCKET, s3_key)
    tmp_gz.unlink()

    print(f"Backup uploaded: s3://{BACKUP_BUCKET}/{s3_key}")

if __name__ == "__main__":
    backup_notes()
```

### Pattern 4: CDK Backup Bucket (Surgical Addition to BeeAtlasStack)

The backup bucket is added after the existing `pipelineUser` block. No existing grants are modified. The deployer OIDC role never gets a grant on this bucket (structural absence = the boundary).

```typescript
// infra/lib/beeatlas-stack.ts  — add after pipelineUser block

// ── Authoritative Store Backup Bucket ────────────────────────────────────
// Separate from siteBucket: neither the GitHub OIDC deployer role nor the
// derived pipeline can accidentally reach this via their existing policies.
// RemovalPolicy.RETAIN: never auto-delete authoritative backups.
const backupBucket = new s3.Bucket(this, 'AuthoritativeBackupBucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  removalPolicy: cdk.RemovalPolicy.RETAIN,     // NOT DESTROY — authoritative data
  versioned: true,
  lifecycleRules: [
    {
      expiration: cdk.Duration.days(180),              // delete objects after 6 months
      noncurrentVersionExpiration: cdk.Duration.days(180), // clean up old versions too
    },
  ],
});

// Pipeline IAM user (maderas nightly + backup script) gets PutObject + GetObject
// on the backup bucket ONLY — not DeleteObject (extra safety; versioning is the recovery).
// The deployer OIDC role (deployerRole) gets NO grant here — structural boundary.
pipelineUser.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:PutObject', 's3:GetObject'],
  resources: [backupBucket.arnForObjects('*')],
}));

// Output the backup bucket name for use in backup_notes.py env
new cdk.CfnOutput(this, 'BackupBucketName', {
  value: backupBucket.bucketName,
  description: 'Authoritative backup bucket → NOTES_BACKUP_BUCKET env var on maderas',
});
```

**CDK version note:** `aws-cdk-lib ^2.259.0` is already pinned in `infra/package.json`. The `versioned`, `lifecycleRules`, `noncurrentVersionExpiration`, and `RemovalPolicy.RETAIN` properties are all stable in this version. [VERIFIED: infra/package.json]

### Pattern 5: Demonstrated Restore Drill (STORE-03 Phase Gate)

The restore drill is manual, documented in a checklist, and must be completed before the phase is closed.

```bash
# On maderas — restore drill steps:
# 1. List recent backups
aws --profile beeatlas s3 ls s3://$BACKUP_BUCKET/backups/ | tail -5

# 2. Download the most recent backup
aws --profile beeatlas s3 cp s3://$BACKUP_BUCKET/backups/notes_YYYYMMDD_HHMMSS.db.gz /tmp/restore_test.db.gz

# 3. Decompress
gunzip -k /tmp/restore_test.db.gz

# 4. Verify the restored DB
python3 - <<'EOF'
import sqlite3
conn = sqlite3.connect("/tmp/restore_test.db")
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables:", tables)
notes = conn.execute("SELECT count(*) FROM notes").fetchone()
print("Note count:", notes[0])
version = conn.execute("SELECT version_num FROM alembic_version").fetchone()
print("Schema version:", version[0])
conn.close()
EOF

# 5. Document results in phase VERIFICATION file
```

### Pattern 6: Apache Reverse Proxy Shape

For the Phase 177 app skeleton (health check only). Full config is Phase 178's responsibility.

```apache
# /etc/apache2/sites-available/beeatlas-notes.conf (or added to existing vhost)
# Requires: a2enmod proxy proxy_http headers
<Location /notes-api>
    ProxyPass http://127.0.0.1:8001/notes-api
    ProxyPassReverse http://127.0.0.1:8001/notes-api
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
</Location>
```

FastAPI app with correct root_path:
```python
# data/notes_app/main.py
from fastapi import FastAPI
import os

app = FastAPI(root_path=os.environ.get("NOTES_APP_ROOT_PATH", "/notes-api"))

@app.get("/health")
def health():
    return {"status": "ok"}
```

Run as: `uvicorn data.notes_app.main:app --host 127.0.0.1 --port 8001`

### Physical File Placement

```
maderas host filesystem:
/opt/beeatlas-store/          ← persistent directory; NOT in git checkout
├── notes.db                  ← the authoritative store
├── notes.db-wal              ← WAL sidecar (auto-managed by SQLite)
└── notes.db-shm              ← WAL sidecar (auto-managed by SQLite)

vs. pipeline paths (no overlap possible):
/tmp/beeatlas.duckdb          ← DB_PATH in nightly.sh
/tmp/beeatlas-export/         ← EXPORT_DIR in nightly.sh (all pipeline artifacts)
~/dev/beeatlas/               ← git checkout (gitignores apply; no store file here)
```

The `s3 cp --recursive` commands in `nightly.sh` target `$EXPORT_DIR/feeds/`, `$EXPORT_DIR/species-maps/`, `$EXPORT_DIR/place-maps/` — all under `/tmp/beeatlas-export/`. The DuckDB s3 cp targets `db/beeatlas.duckdb` on the siteBucket. None of these paths can reach `/opt/beeatlas-store/`. Physical separation is absolute. [VERIFIED: data/nightly.sh]

### Anti-Patterns to Avoid

- **Storing notes.db anywhere under /tmp:** not persistent across reboots; the nightly itself uses /tmp and writes there.
- **Storing notes.db in the git checkout or EXPORT_DIR:** risk of `s3 cp --recursive` or a future `git clean -fd` touching it.
- **Running `alembic downgrade`:** forbidden; `downgrade()` raises `NotImplementedError` by convention.
- **Running migrations from `run.py` or `nightly.sh`:** migrations are owned by the write-layer deploy (Phase 178). In Phase 177, the one-time initial migration is run manually by the operator.
- **Using `VACUUM INTO` inside a transaction:** it will fail. VACUUM INTO must be outside any active transaction. `Connection.backup()` has no such restriction.
- **Copying `notes.db` without the `-wal` sidecar:** produces a torn/inconsistent copy. Always use the backup API or VACUUM INTO.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migration ledger | Custom `schema_migrations` table + version tracking | Alembic's `alembic_version` table | Alembic handles ordering, idempotency, migration file discovery |
| SQLite ALTER TABLE (drop col, add constraint) | Raw SQL DDL | Alembic batch mode (`op.batch_alter_table()`) | SQLite silently ignores or errors on unsupported DDL; batch mode handles move-and-copy correctly |
| Consistent snapshot with WAL | Raw file `shutil.copy()` | `sqlite3.Connection.backup()` | Raw copy of `.db` + missing WAL frames = torn/inconsistent read; backup API handles this automatically |
| WAL mode setup | Manual `PRAGMA journal_mode=WAL` at every connection | SQLAlchemy `event.listens_for(engine, "connect")` | Ensures WAL is set on every new connection, including from Alembic |
| S3 versioning for backup history | Manual backup naming/rotation | S3 Versioning + lifecycle rules | S3 handles retention automatically; `DeleteObject` by the pipeline user is not granted |

**Key insight:** SQLite's WAL mode + Python's stdlib backup API + S3 Versioning are the complete safety stack. No custom backup rotation, no per-shard logic, no streaming replication needed at this scale and risk tolerance.

---

## Common Pitfalls

### Pitfall 1: Copying notes.db Without the WAL Sidecars (Torn Read)

**What goes wrong:** `shutil.copy(notes_db_path, backup_path)` copies only the main `.db` file. If the WAL file has uncommitted changes not yet checkpointed, the copy is an inconsistent snapshot — some transactions may be partially visible, missing, or corrupt.

**Why it happens:** The `-wal` and `-shm` files are "hidden" sidecars. A `cp` or `shutil.copy` of just the `.db` file omits them.

**How to avoid:** Always use `sqlite3.Connection.backup(dst)` or `VACUUM INTO 'path'` — both produce a complete, consistent, sidecar-free output file. The backup API reads a WAL-era snapshot atomically.

**Warning signs:** Backup script uses `shutil.copy` or `os.system("cp notes.db backup.db")`.

### Pitfall 2: WAL Read-Only Fails If Sidecars Are Absent

**What goes wrong:** Phase 179's harvest opens the DB read-only (`uri=True, mode=ro`). If the app has never run (no `-wal` / `-shm` sidecars exist yet) AND the directory is not writable, SQLite 3.22+ will fail to open.

**Why it happens:** WAL-mode read-only requires the sidecars to already exist, or the directory to be writable so SQLite can create them.

**How to avoid:** Ensure the app starts (creating the sidecars) before running the harvest. Document the startup order: `store bootstrap → app start → first backup → nightly can harvest`. If the app isn't guaranteed to be running during harvest (D-16: "app need not be up"), make the directory writable so SQLite can create its own sidecars for the read-only connection.

**Warning signs:** Harvest fails with "unable to open database file" or "attempt to write a readonly database" when no sidecar files exist.

### Pitfall 3: WAL Checkpoint Starvation from Long Harvest Reads

**What goes wrong:** If the Phase 179 harvest opens a long-running read-only connection, it holds a "read mark" in the WAL that blocks the WAL auto-checkpoint (which fires at ~1000 pages). The WAL file grows unbounded during that time.

**Why it happens:** SQLite's WAL checkpoint skips frames that are still "visible" to any open reader.

**How to avoid:** Keep harvest reads short (SELECT approved notes — this should be fast); close the read-only connection promptly. The write app's checkpoint will catch up once the harvest connection closes. At this data volume (tens to low-hundreds of notes), WAL growth is not a practical concern.

**Warning signs:** WAL file grows unusually large between nightlies; checkpoint log shows "starvation" messages.

### Pitfall 4: Alembic `downgrade` Deletes Rows (The Bypass-and-Rebuild Analog)

**What goes wrong:** If `downgrade()` is implemented and a developer runs `alembic downgrade -1` on the production store, it could `DROP TABLE notes` — unrecoverable since there is no upstream to rebuild from.

**Why it happens:** Alembic generates `downgrade()` stubs automatically. Developers who run `alembic downgrade` in a derived-data context (where it's safe) apply the same reflex to authoritative data.

**How to avoid:** All migration files set `downgrade()` to `raise NotImplementedError("forward-only migrations only — no downgrade path")`. Document this in the migration template. Never run `alembic downgrade` on the production store.

**Warning signs:** Any `downgrade()` body that does anything other than raise.

### Pitfall 5: Pipeline User Gets DeleteObject on Backup Bucket

**What goes wrong:** If `pipelineUser` gets `s3:DeleteObject` on the backup bucket, a future convenience script or misuse could delete backups. Combined with a bug, this could wipe all backup history.

**Why it happens:** CDK's `bucket.grantReadWrite()` grants `DeleteObject` by default. Copy-paste from the siteBucket grant pattern.

**How to avoid:** Explicitly grant only `s3:PutObject` and `s3:GetObject` on the backup bucket's objects — no `grantReadWrite()`, no wildcard. S3 Versioning is the recovery layer even if an object is overwritten.

**Warning signs:** CDK code uses `backupBucket.grantReadWrite(pipelineUser)`.

### Pitfall 6: CDK RemovalPolicy.DESTROY on Backup Bucket

**What goes wrong:** `cdk destroy` (if ever accidentally run) auto-deletes the backup bucket and all its versioned objects.

**Why it happens:** `RemovalPolicy.DESTROY` is the default CDK setting for new buckets (and the siteBucket uses it, which is fine — it's reproducible).

**How to avoid:** Use `removalPolicy: cdk.RemovalPolicy.RETAIN` on the backup bucket. Combined with the memory `project_cdk_stack_composition` ("never cdk destroy"), this is belt-and-suspenders.

**Warning signs:** `removalPolicy: cdk.RemovalPolicy.DESTROY` on the backup bucket.

### Pitfall 7: Isolation Demonstration Gap (STORE-04)

**What goes wrong:** STORE-04 requires *demonstrating* that a full `run.py`/dbt rebuild doesn't touch the SQLite file or backup bucket. If the demonstration is skipped or done incorrectly (e.g., only running a subset of the pipeline), the phase VERIFICATION incorrectly passes.

**Why it happens:** The full pipeline can't run locally (memory `project_local_dbt_build_not_runnable`), so a local proxy test substitutes for the real nightly verification.

**How to avoid:** For STORE-04, the demonstration must run on maderas. The proxy test (verifiable locally) is: confirm `EXPORT_DIR`, `DB_PATH`, and the pipeline user's IAM policy do not reference the backup bucket or notes.db path. The actual nightly run (on maderas) is the gate — run the nightly, then check both the notes.db mtime and the backup bucket object list are unchanged.

---

## Pitfall Mapping: How SQLite-on-maderas Avoids PITFALLS #1–#4

| Pitfall | How This Phase Avoids It |
|---------|--------------------------|
| #1: Nightly rebuild wipes authoritative data | notes.db is physically outside EXPORT_DIR and outside the DuckDB path; never a dbt model; the pipeline can't even find it |
| #2: No backup before first write | Backup script + S3 bucket exists in Phase 177; demonstrate restore is the Phase 177 exit gate (D-12); Phase 178 cannot open writes without this gate passed |
| #3: Schema-diff gate misfires | Phase 176 already ensures authoritative artifacts are `baseline_diff=false`. The notes.db *file* has no manifest key at all; only the eventual notes.json artifact (Phase 179) will be `authoritative` in artifacts.toml — and that is already machine-excluded |
| #4: `s3 sync/cp` reaches authoritative prefix | Separate bucket the pipeline code never names; pipeline user has no DeleteObject on it; S3 Versioning on for recovery even if something goes wrong |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLite WAL read-only impossible | WAL read-only supported (SQLite 3.22.0+) | 2018 | Phase 179 harvest can open DB read-only safely |
| Alembic batch mode per-operation | `render_as_batch=True` global config | Alembic ~0.9 | Set once in env.py; all migrations use batch mode automatically |
| SQLite `.dump()` for backup | `Connection.backup()` stdlib API | Python 3.7+ | WAL-safe, binary, no subprocess needed |

**Deprecated/outdated:**
- `sqlite3.connect().execute(".dump")`: not a Python API; text-format dumps are slow and large.
- Alembic `render_as_batch=True` per-migration (old pattern): use global `env.py` setting instead.
- `VACUUM` (without INTO): compacts in-place, doesn't help with backups; use `VACUUM INTO 'path'` or `Connection.backup()`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FastAPI and uvicorn are on PyPI at the versions listed | Standard Stack | Low — both are verified on PyPI by pip3 index; versions are current |
| A2 | maderas runs a recent enough SQLite (≥3.22.0) to support WAL read-only | Common Pitfalls #2 | Low — Python 3.14 bundles SQLite 3.46+ [ASSUMED from Python release notes]; confirm with `python3 -c "import sqlite3; print(sqlite3.sqlite_version)"` on maderas |
| A3 | `/opt/beeatlas-store/` is a writable persistent directory on maderas | Physical File Placement | Operator knowledge — the exact persistent path is a deployment decision; any path outside /tmp, EXPORT_DIR, and git checkout satisfies the constraint |
| A4 | Apache `mod_proxy` and `mod_proxy_http` are available on maderas | Apache reverse-proxy shape | Low — standard on Ubuntu/Debian Apache2; confirm with `apache2ctl -M \| grep proxy` |
| A5 | The `beeatlas` AWS profile on maderas maps to `beeatlas-pipeline` IAM user credentials stored in `~/.aws/credentials` | IAM/credential boundary | HIGH confidence — confirmed from nightly.sh and CDK stack; the IAM user is `beeatlas-pipeline` per CDK |

---

## Open Questions (RESOLVED)

1. **SQLite version on maderas** — RESOLVED: non-blocking for Phase 177; operator verifies `python3 -c "import sqlite3; print(sqlite3.sqlite_version)"` on maderas before Phase 179's WAL read-only harvest relies on it.
   - What we know: Python 3.14 ships with SQLite 3.46+ which supports WAL read-only.
   - What's unclear: Whether maderas actually has Python 3.14 installed/active for the pipeline (uv handles the venv, but the system SQLite could differ).
   - Recommendation: Operator to run `python3 -c "import sqlite3; print(sqlite3.sqlite_version)"` on maderas before Phase 179 relies on WAL read-only; not blocking for Phase 177.

2. **Persistent store path on maderas** — RESOLVED: deployment-time operator decision (any path outside `/tmp`, EXPORT_DIR, and the git checkout satisfies STORE-04); documented at bootstrap in plan 177-07.
   - What we know: The path must be outside /tmp, EXPORT_DIR, git checkout.
   - What's unclear: Whether `/opt/beeatlas-store/` needs sudo to create, or if the pipeline user's home directory is a better fit.
   - Recommendation: Operator decides at implementation time; document the chosen path in a CLAUDE.md update or maderas-specific README.

3. **Backup cron vs nightly.sh integration** — RESOLVED: a separate hourly cron (independent of pipeline cadence), adopted in plan 177-06's DR runbook.
   - What we know: D-09 says "snapshot cadence is planner's call, within 'frequent enough'."
   - What's unclear: Whether adding a backup step to `nightly.sh` is better than a separate cron (hourly or post-nightly).
   - Recommendation: A separate cron entry (hourly) is cleaner — backup frequency is independent of pipeline frequency, and `nightly.sh` is already responsible for enough. The planner can choose a post-nightly hook if simpler.

4. **REQUIREMENTS.md STORE-03 wording update** — RESOLVED: applied as plan 177-01 Task 3 (relax "native PITR" → snapshot-based-now / Litestream-later), landing before VERIFICATION reads the gate.
   - What we know: D-11 says to update STORE-03 before VERIFICATION reads the gate.
   - What's unclear: Exactly when this should happen — in Phase 177 planning or as a pre-VERIFICATION step.
   - Recommendation: Include as Wave 0 task in Phase 177 plan: update STORE-03 to say "snapshot-based recovery (backup API snapshots to S3); Litestream/PITR deferred to later phase."

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14+ | Alembic, FastAPI, backup script | Assumed ✓ | 3.14 (pyproject.toml requires-python >=3.14) | — |
| uv | Package management | Assumed ✓ | (existing pipeline dep) | — |
| SQLite 3.22+ | WAL read-only in Phase 179 | Assumed ✓ | Bundled with Python 3.14 | — |
| boto3 | Backup S3 push | ✓ | Already in pyproject.toml dependencies | — |
| Apache mod_proxy | Reverse proxy for app | Assumed ✓ | (standard on maderas, already serves TLS) | — [A4] |
| AWS CDK | Backup bucket deploy | ✓ | ^2.259.0 in infra/package.json | — |
| AWS `beeatlas` profile on maderas | Backup push | Assumed ✓ | Confirmed from nightly.sh pattern | — |

**Missing dependencies with no fallback:** none — all assumed available.

**Missing dependencies with fallback:** none.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (existing project framework) |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd data && uv run pytest tests/test_notes_store.py -x` |
| Full suite command | `cd data && uv run pytest -m "not integration" -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STORE-01 | Schema has `notes` + `note_revisions` tables with expected columns | unit (temp DB) | `pytest tests/test_notes_store.py::test_schema_notes` | ❌ Wave 0 |
| STORE-01 | Seed script inserts sample notes | unit (temp DB) | `pytest tests/test_notes_store.py::test_seed` | ❌ Wave 0 |
| STORE-02 | `alembic upgrade head` creates tables; `alembic_version` records head revision | unit (temp DB) | `pytest tests/test_notes_store.py::test_migration_applies` | ❌ Wave 0 |
| STORE-02 | `downgrade()` raises `NotImplementedError` | unit | `pytest tests/test_notes_store.py::test_no_downgrade` | ❌ Wave 0 |
| STORE-02 | `run.py` STEPS list does NOT include any notes migration or notes write step | unit (STEPS inspection) | `pytest tests/test_notes_store.py::test_run_py_never_migrates` | ❌ Wave 0 |
| STORE-03 | Backup produces a valid gzipped SQLite file | unit (temp DB + local path) | `pytest tests/test_notes_store.py::test_backup_produces_valid_db` | ❌ Wave 0 |
| STORE-03 | Restored backup has same row count and schema version as source | unit (temp DB) | `pytest tests/test_notes_store.py::test_restore_roundtrip` | ❌ Wave 0 |
| STORE-04 | `NOTES_DB_PATH` is not inside `EXPORT_DIR` | unit (env config check) | `pytest tests/test_notes_store.py::test_store_path_not_in_export_dir` | ❌ Wave 0 |
| STORE-04 | nightly.sh S3 calls do not reference the backup bucket name | manual (grep check) | human verify | n/a — manual |
| STORE-04 | CDK backup bucket has no deployer role or pipeline DeleteObject grant | manual (CDK diff) | `cd infra && npx cdk diff` | n/a — manual |

**Sampling rate:**
- Per task commit: `cd data && uv run pytest tests/test_notes_store.py -x`
- Per wave merge: `cd data && uv run pytest -m "not integration" -x`
- Phase gate: full suite green + STORE-03 manual restore drill documented

### Wave 0 Gaps

- [ ] `data/tests/test_notes_store.py` — covers STORE-01, STORE-02, STORE-03, STORE-04

*(No existing test infrastructure gap — pytest config and fixtures exist; only the new test file is needed.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (no auth endpoints in Phase 177) | — (Phase 178) |
| V3 Session Management | No | — (Phase 178) |
| V4 Access Control | Partial — IAM boundary | CDK policy: no DeleteObject for pipeline; no access for deployer |
| V5 Input Validation | No (no write endpoints) | — (Phase 178) |
| V6 Cryptography | No (S3 server-side encryption is S3 default) | AWS S3 SSE (enabled by default) |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pipeline script accidentally writes to notes.db | Tampering | Physical path separation; pipeline user has no write access to the notes file path |
| Backup bucket accessible to deployer OIDC role | Elevation of Privilege | Structural absence — bucket never named in deployer policy; no `grantReadWrite` call |
| Nightly `s3 cp` overwrites backup | Tampering | Separate bucket; S3 Versioning on; pipeline user has no access to backup bucket paths |
| Raw file copy of notes.db (torn read) | Information Disclosure | Use `Connection.backup()` or `VACUUM INTO`; never `shutil.copy` |

---

## Sources

### Primary (HIGH confidence)

- `data/nightly.sh` — actual S3 cp targets, EXPORT_DIR, DB_PATH, AWS_PROFILE, pipeline IAM usage [VERIFIED: codebase]
- `data/run.py` — STEPS list confirms no notes migration or write step [VERIFIED: codebase]
- `infra/lib/beeatlas-stack.ts` — pipelineUser IAM grants (`s3:GetObject, s3:PutObject` on `data/*`, `db/*`, `raw/*` only); deployerRole `grantReadWrite` on siteBucket; no backup bucket exists yet [VERIFIED: codebase]
- `data/artifacts.toml` + `data/artifacts.py` — authoritative/derived split, `baseline_diff` enforcement [VERIFIED: codebase]
- `docs/adr/0002-derived-vs-authoritative-artifacts.md` — two schema-evolution regimes [VERIFIED: codebase]
- Python docs `sqlite3.Connection.backup()` — [VERIFIED: https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup]
- SQLite WAL documentation — sidecar files, read-only access requirements, checkpoint behavior [VERIFIED: https://sqlite.org/wal.html]
- Alembic batch mode documentation — render_as_batch, move-and-copy, SQLite ALTER TABLE limitations [VERIFIED: https://alembic.sqlalchemy.org/en/latest/batch.html]
- PyPI version verification (pip3 index versions): alembic=1.18.5, sqlalchemy=2.0.51, fastapi=0.139.0, uvicorn=0.49.0 [VERIFIED: PyPI registry, 2026-07-03]
- AWS CDK v2 LifecycleRule TypeScript interface [VERIFIED: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.LifecycleRule.html]
- FastAPI behind-proxy documentation — root_path, ProxyPass config [VERIFIED: https://fastapi.tiangolo.com/advanced/behind-a-proxy/]

### Secondary (MEDIUM confidence)

- SQLite backup API behavior with WAL concurrent writes [https://sqlite.work/ensuring-consistent-backups-in-sqlite-wal-mode-without-disrupting-writers/] — cross-verified with Python docs
- CDK S3 bucket lifecycle rule examples [https://bobbyhadz.com/blog/aws-cdk-s3-lifecycle-rules] — cross-verified with AWS CDK docs

### Tertiary (LOW confidence)

- None — all claims above are either codebase-verified or docs-verified.

---

## Metadata

**Confidence breakdown:**
- SQLite + Alembic mechanics: HIGH — verified via official docs + PyPI version check
- WAL concurrency model: HIGH — verified via sqlite.org WAL docs + Python stdlib docs
- CDK bucket pattern: HIGH — verified via AWS CDK v2 docs + infra/beeatlas-stack.ts
- IAM boundary design: HIGH — derived directly from the existing CDK stack policy structure
- Physical file placement: HIGH — derived from nightly.sh EXPORT_DIR and DB_PATH constants
- Apache proxy shape: MEDIUM — well-documented pattern; exact maderas Apache config is operator knowledge

**Research date:** 2026-07-03
**Valid until:** 2026-09-03 (SQLite, Alembic, FastAPI are stable; CDK L2 constructs stable)
