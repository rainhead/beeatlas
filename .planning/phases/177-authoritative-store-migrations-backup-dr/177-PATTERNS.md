# Phase 177: Authoritative Store, Migrations & Backup/DR - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 10 new/modified files
**Analogs found:** 8 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/notes_store/__init__.py` | package marker | — | `data/tests/__init__.py` | structural |
| `data/notes_store/db.py` | utility | request-response | `data/config.py` | role-match (module-level singleton init) |
| `data/notes_store/models.py` | model | CRUD | `data/artifacts.py` (declarative config pattern) | partial |
| `data/notes_store/migrations/env.py` | config | request-response | `data/config.py` | role-match |
| `data/notes_store/migrations/versions/0001_initial_schema.py` | migration | CRUD | no existing analog | no-match |
| `data/notes_store/seed.py` | utility | CRUD | `data/tests/conftest.py` `_seed_data()` | role-match |
| `data/notes_app/__init__.py` | package marker | — | `data/tests/__init__.py` | structural |
| `data/notes_app/main.py` | service | request-response | no existing analog (first web service) | no-match |
| `data/backup_notes.py` | utility | file-I/O | `data/nightly.sh` (S3 cp pattern) + `data/sqlite_export.py` (SQLite I/O) | role-match |
| `data/tests/test_notes_store.py` | test | CRUD + file-I/O | `data/tests/test_sqlite_export.py` + `data/tests/test_artifacts.py` | exact |
| `infra/lib/beeatlas-stack.ts` (surgical edit) | config | — | itself (lines 255–268, pipelineUser block) | self-analog |
| `data/roles_allowlist.toml` | config | — | `data/artifacts.toml` | role-match |

---

## Pattern Assignments

---

### `data/notes_store/db.py` (utility, module-level engine init)

**Analog:** `data/config.py` (lines 1–22) — module-level singleton read from an env/config source.

**Module-level init pattern** (`data/config.py` lines 1–22):
```python
import tomllib
from pathlib import Path

_PYPROJECT = Path(__file__).parent / "pyproject.toml"
with _PYPROJECT.open("rb") as fh:
    _CFG = tomllib.load(fh)
```

**Apply to `db.py`:** Use the same module-level pattern but create a SQLAlchemy engine from `NOTES_DB_PATH` env var. Follow the RESEARCH.md Pattern 2 exactly:

```python
# data/notes_store/db.py
import os
from pathlib import Path
from sqlalchemy import create_engine, event

NOTES_DB_PATH = Path(os.environ.get("NOTES_DB_PATH", "/opt/beeatlas-store/notes.db"))

def make_engine(db_path: str | Path | None = None):
    path = str(db_path or NOTES_DB_PATH)
    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def set_wal_pragmas(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA foreign_keys=ON")
        dbapi_conn.execute("PRAGMA synchronous=NORMAL")

    return engine
```

**No error handling needed** — any engine creation failure should propagate loudly, same as `config.py`.

---

### `data/notes_store/models.py` (model, SQLAlchemy ORM)

**Analog:** No exact ORM model analog exists in this codebase. Use RESEARCH.md Pattern 1 directly.

**Schema notes from decisions:**
- `notes`: `id`, `canonical_name` (string, matches `species_traits` key convention), `author_id` (iNat login), `body` (sanitized Markdown), `status` (enum: `approved` / `pending` / `removed`), `created_at`, `updated_at`
- `note_revisions`: `id`, `note_id` (FK), `body`, `editor_id`, `revised_at`, `action` (`create` / `edit` / `remove`)

Follow SQLAlchemy 2.0 mapped-class style (not legacy `Base = declarative_base()`):

```python
# data/notes_store/models.py
import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Note(Base):
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canonical_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    author_id: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="approved")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    revisions: Mapped[list["NoteRevision"]] = relationship(back_populates="note")

class NoteRevision(Base):
    __tablename__ = "note_revisions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    editor_id: Mapped[str] = mapped_column(String, nullable=False)
    revised_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)  # create/edit/remove
    note: Mapped["Note"] = relationship(back_populates="revisions")
```

---

### `data/notes_store/migrations/env.py` (config, Alembic)

**Analog:** `data/config.py` — env-var-driven path resolution pattern. RESEARCH.md Pattern 1 specifies the full content.

**Critical settings** to copy from RESEARCH.md Pattern 1:
- `NOTES_DB_PATH` read from `os.environ`
- `render_as_batch=True` in `context.configure()` — required for all SQLite schema changes
- Use `create_engine(f"sqlite:///{NOTES_DB_PATH}", connect_args={"check_same_thread": False})`

---

### `data/notes_store/migrations/versions/0001_initial_schema.py` (migration)

**Analog:** No existing migration files. Use RESEARCH.md Pattern 1 template exactly.

**Key forward-only convention** (apply to every migration file):
```python
def downgrade():
    raise NotImplementedError("forward-only migrations only — no downgrade path")
```

---

### `data/notes_store/seed.py` (utility, CRUD)

**Analog:** `data/tests/conftest.py` `_seed_data()` function (lines 161–551) — the project's established pattern for inserting sample/fixture rows into a SQLite/DuckDB database.

**Seed pattern** (`data/tests/conftest.py` lines 161–165):
```python
def _seed_data(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        INSERT INTO geographies.us_states VALUES (
            '53', 'Washington', 'WA', ?
        )
    """, [WA_STATE_WKT])
```

**Apply to `seed.py`:** Use SQLAlchemy Session (not raw `execute`) since this is the SQLAlchemy-managed notes store. Accept `db_path` as CLI argument or env var (same env-var pattern as `config.py`):

```python
# data/notes_store/seed.py
"""Seed the notes store with sample notes for testing. D-04."""
import datetime
import os
from pathlib import Path
from sqlalchemy.orm import Session
from notes_store.db import make_engine
from notes_store.models import Note

def seed(db_path: str | None = None):
    engine = make_engine(db_path)
    now = datetime.datetime.utcnow()
    with Session(engine) as session:
        session.add(Note(
            canonical_name="apis mellifera",
            author_id="example_inat_login",
            body="Sample expert note about *Apis mellifera*.",
            status="approved",
            created_at=now,
            updated_at=now,
        ))
        session.commit()
    print(f"Seeded notes store at {db_path or os.environ.get('NOTES_DB_PATH')}")

if __name__ == "__main__":
    seed()
```

---

### `data/backup_notes.py` (utility, file-I/O + S3 push)

**Analogs:**
1. `data/nightly.sh` lines 88–88 — `aws --profile "$AWS_PROFILE" s3 cp` pattern; environment variable `AWS_PROFILE=beeatlas`
2. `data/tests/test_sqlite_export.py` lines 70–80 — pattern for opening SQLite files via `sqlite3.connect()` and verifying results

**S3 push pattern from `nightly.sh`** (line 88):
```bash
aws --profile "$AWS_PROFILE" s3 cp --no-progress "$DB_PATH" "s3://$BUCKET/$DB_S3_KEY"
```
The Python equivalent uses `boto3.Session(profile_name=...)` — the RESEARCH.md Pattern 3 excerpt is the authoritative template. Key points:
- `AWS_PROFILE` env var defaults to `"beeatlas"` (matches nightly.sh line 40)
- `NOTES_DB_PATH` and `NOTES_BACKUP_BUCKET` are required env vars (fail-fast with `KeyError` if absent)
- Use `sqlite3.connect(f"file:{NOTES_DB_PATH}?mode=ro", uri=True)` for read-only backup source
- Use `src.backup(dst)` — never `shutil.copy`
- Gzip with `compresslevel=9`; clean up `/tmp` files after upload

**Full backup pattern:** Use RESEARCH.md Pattern 3 exactly, with one addition — print a structured log line matching nightly.sh's `echo` style:
```python
print(f"=== notes backup {ts} → s3://{BACKUP_BUCKET}/{s3_key} ===")
```

---

### `data/notes_app/main.py` (service, FastAPI health check)

**Analog:** No existing web service in this codebase. Use RESEARCH.md Pattern 6 exactly.

```python
# data/notes_app/main.py
from fastapi import FastAPI
import os

app = FastAPI(root_path=os.environ.get("NOTES_APP_ROOT_PATH", "/notes-api"))

@app.get("/health")
def health():
    return {"status": "ok"}
```

Run with: `uvicorn data.notes_app.main:app --host 127.0.0.1 --port 8001`

---

### `data/tests/test_notes_store.py` (test, CRUD + file-I/O)

**Analogs (two, complementary):**

**1. `data/tests/test_sqlite_export.py`** — SQLite-producing test structure with `tmp_path` fixtures, `sqlite3.connect()` verification, and `pytest.MonkeyPatch` for env vars (lines 70–185).

**Test structure pattern** (`test_sqlite_export.py` lines 70–80):
```python
def test_creates_occurrences_table(src_parquet: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet, dst)

    assert dst.exists(), "SQLite file was not created"
    con = sqlite3.connect(dst)
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    con.close()
    assert "occurrences" in tables, ...
```

**2. `data/tests/test_artifacts.py`** — `tmp_path`-based TOML writing + `pytest.raises(ValueError, match=...)` pattern for fail-loud invariant testing (lines 91–197).

**Fail-loud invariant pattern** (`test_artifacts.py` lines 130–140):
```python
def test_validate_unknown_kind(tmp_path):
    """validate() raises ValueError on an unknown artifact kind."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "derived"
kind = "bogus"
...
""")
    spec = load(p)
    with pytest.raises(ValueError, match="unknown kind"):
        validate(spec)
```

**Apply to `test_notes_store.py`:**
- Use `tmp_path` (function-scoped) for each test's `notes.db` — never share state between tests
- Use `monkeypatch.setenv("NOTES_DB_PATH", ...)` to point modules at the temp DB (mirrors `test_sqlite_export.py` lines 160–176 `monkeypatch.setattr` pattern)
- Import from `notes_store.*` using relative local imports (same module-import style as `from sqlite_export import generate_sqlite`)
- All tests are fast-tier (no `@pytest.mark.integration`) — backup S3 push is mocked/skipped via monkeypatch

**Test naming map** (from RESEARCH.md Validation Architecture):
```
test_schema_notes          — STORE-01: tables + columns
test_seed                  — STORE-01: seed inserts rows
test_migration_applies     — STORE-02: alembic upgrade head
test_no_downgrade          — STORE-02: downgrade() raises
test_run_py_never_migrates — STORE-02: run.py STEPS inspection
test_backup_produces_valid_db  — STORE-03: gzipped SQLite output
test_restore_roundtrip     — STORE-03: row count + schema version match
test_store_path_not_in_export_dir — STORE-04: path config check
```

**conftest.py autouse fixture `_guard_real_db_path`** (lines 601–643) is already in place and will guard `NOTES_DB_PATH` env var automatically — no notes-specific fixture needed for the hermeticity guard.

---

### `infra/lib/beeatlas-stack.ts` surgical edit (CDK bucket)

**Self-analog:** `infra/lib/beeatlas-stack.ts` lines 255–274 — the `pipelineUser` block. The backup bucket block is added immediately after line 274.

**Existing pipelineUser policy pattern** (lines 255–268):
```typescript
const pipelineUser = new iam.User(this, 'PipelineUser', {
  userName: 'beeatlas-pipeline',
});

pipelineUser.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:GetObject', 's3:PutObject'],
  resources: [
    siteBucket.arnForObjects('data/*'),
    siteBucket.arnForObjects('db/*'),
    siteBucket.arnForObjects('raw/*'),
  ],
}));
```

**Apply for backup bucket:** Add a second `pipelineUser.addToPolicy()` call granting only `s3:PutObject` + `s3:GetObject` on `backupBucket.arnForObjects('*')`. Do NOT use `backupBucket.grantReadWrite(pipelineUser)` — that adds `DeleteObject`. Do NOT grant `deployerRole` anything on `backupBucket`.

**RemovalPolicy:** `siteBucket` uses `cdk.RemovalPolicy.DESTROY`. `backupBucket` MUST use `cdk.RemovalPolicy.RETAIN` (authoritative data — D-13).

**Full CDK snippet:** Use RESEARCH.md Pattern 4 exactly.

---

### `data/roles_allowlist.toml` (committed config, TOML)

**Analog:** `data/artifacts.toml` — the project's established pattern for a committed, declarative TOML config file that is git-tracked as the audit trail and loaded by a Python module.

**TOML structure pattern** from `data/artifacts.toml` (section header + key-value fields per entry):
```toml
[artifacts.occurrences]
provenance = "derived"
kind = "hashed"
source_file = "occurrences.parquet"
```

**Apply to `roles_allowlist.toml`:**
```toml
# data/roles_allowlist.toml
# Maps iNat login → role. Git history is the audit trail (D-07).
# Roles: author = can create notes; curator = can take down any note.

[roles]
# example_inat_login = "author"
```

Load it in a small `roles.py` helper using the same `tomllib` pattern as `config.py` (lines 1–15).

---

## Shared Patterns

### Env-var-driven path resolution
**Source:** `data/config.py` lines 1–22; `data/nightly.sh` lines 34–44
**Apply to:** `db.py`, `backup_notes.py`, `env.py`

Pattern: module-level constant read from `os.environ.get("KEY", default)`. Use `os.environ["KEY"]` (no default, raises `KeyError`) for required vars (`NOTES_DB_PATH` when not guarded, `NOTES_BACKUP_BUCKET`).

### `tmp_path` fixture for file-I/O tests
**Source:** `data/tests/test_sqlite_export.py` lines 70–80, 160–185
**Apply to:** `test_notes_store.py` — every test that touches the SQLite DB or backup output uses `tmp_path` for hermeticity.

### `monkeypatch` for module-level constants
**Source:** `data/tests/test_sqlite_export.py` lines 160–176; `data/tests/conftest.py` lines 601–643
**Apply to:** `test_notes_store.py` tests that call `backup_notes.py` — monkeypatch `NOTES_DB_PATH`, `NOTES_BACKUP_BUCKET`, and mock `boto3.Session.client` to avoid real S3 calls.

### AWS profile pattern
**Source:** `data/nightly.sh` line 40 (`AWS_PROFILE="${AWS_PROFILE:-beeatlas}"`)
**Apply to:** `backup_notes.py` — `AWS_PROFILE = os.environ.get("AWS_PROFILE", "beeatlas")`; then `boto3.Session(profile_name=AWS_PROFILE)`.

### `set -euo pipefail` + structured echo
**Source:** `data/nightly.sh` line 27
**Not applicable** to the Python files — but the backup script should print structured log lines (`=== ... ===`) matching nightly.sh conventions so operator logs are consistent.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `data/notes_app/main.py` | service | request-response | First web service in this codebase; no FastAPI/Flask analog exists |
| `data/notes_store/migrations/versions/0001_initial_schema.py` | migration | CRUD | First Alembic migration; no migration files exist in the codebase |

Both files should be written directly from RESEARCH.md Patterns 1 and 6.

---

## Metadata

**Analog search scope:** `data/*.py`, `data/tests/`, `infra/lib/`, `data/nightly.sh`
**Files scanned:** 12
**Pattern extraction date:** 2026-07-03
