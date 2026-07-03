"""STORE-03 snapshot-valid + restore-roundtrip + no-raw-copy tests.

Covers plan 177-06 Task 2 acceptance criteria:
  test_backup_produces_valid_db  — make_snapshot() returns a .db.gz that, when
                                   gunzipped, is a valid SQLite DB with a 'notes' table
  test_restore_roundtrip         — restored DB has same note count AND alembic_version
                                   as the source (STORE-03 integrity; a silently corrupt
                                   backup would fail here)
  test_no_raw_copy               — backup_notes.py uses .backup() and neither
                                   shutil.copy nor os.system (Pitfall 1 guard)
  test_upload_snapshot_mocked    — upload_snapshot() calls s3.upload_file() with the
                                   correct bucket and key prefix; no real S3 call

All tests are fast-tier (no @pytest.mark.integration). S3 is never contacted.
Each test uses function-scoped tmp_path for full isolation.

Pitfall 1 (RESEARCH.md): copying notes.db without WAL sidecars yields a torn
read; Connection.backup() is the correct WAL-safe API.
"""

import gzip
import pathlib
import sqlite3
import datetime

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_seeded_db(tmp_path: pathlib.Path, note_count: int = 3) -> pathlib.Path:
    """Create a SQLite DB with Base schema + seeded notes + alembic_version row.

    Returns the path to the .db file. Uses make_engine so WAL mode is set
    (matching production behaviour) and Base.metadata.create_all for the ORM
    schema.

    The alembic_version table is created manually (it's an Alembic-managed
    table, not in Base.metadata) with version_num='0001'.
    """
    from notes_store.db import make_engine
    from notes_store.models import Base, Note
    from sqlalchemy.orm import Session

    db = tmp_path / "src_notes.db"
    engine = make_engine(db)
    Base.metadata.create_all(engine)

    now = datetime.datetime(2026, 7, 3, 12, 0, 0)
    with Session(engine) as session:
        for i in range(note_count):
            session.add(
                Note(
                    canonical_name=f"species_{i}",
                    author_id=f"author_{i}",
                    body=f"Note body {i}.",
                    created_at=now,
                    updated_at=now,
                )
            )
        session.commit()

    engine.dispose()

    # Create alembic_version manually (Alembic-managed; not in Base.metadata)
    raw = sqlite3.connect(str(db))
    raw.execute(
        "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"
    )
    raw.execute("INSERT INTO alembic_version (version_num) VALUES ('0001')")
    raw.commit()
    raw.close()

    return db


# ---------------------------------------------------------------------------
# test_backup_produces_valid_db — STORE-03: gzipped SQLite output
# ---------------------------------------------------------------------------


def test_backup_produces_valid_db(tmp_path: pathlib.Path) -> None:
    """make_snapshot() returns a .db.gz that gunzips to a valid SQLite DB.

    Steps:
      1. Create a seeded source DB.
      2. Call make_snapshot(src, out_dir).
      3. Assert the returned path exists and ends .db.gz.
      4. Gunzip into a temp file.
      5. Open with sqlite3 and assert the 'notes' table is present.
    """
    from backup_notes import make_snapshot

    src = _make_seeded_db(tmp_path)
    out_dir = tmp_path / "out"
    out_dir.mkdir()

    gz = make_snapshot(src, out_dir)

    assert gz.exists(), "make_snapshot() must return a path to an existing file"
    assert gz.name.endswith(".db.gz"), f"Expected .db.gz filename, got {gz.name!r}"

    # Gunzip and verify the restored DB is a valid SQLite file.
    restored = tmp_path / "restored.db"
    with gzip.open(gz, "rb") as f_in, open(restored, "wb") as f_out:
        f_out.write(f_in.read())

    con = sqlite3.connect(str(restored))
    tables = {
        row[0]
        for row in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    con.close()

    assert "notes" in tables, (
        f"Restored DB must contain the 'notes' table; got tables: {tables}"
    )


# ---------------------------------------------------------------------------
# test_restore_roundtrip — STORE-03: row count + schema version parity
# ---------------------------------------------------------------------------


def test_restore_roundtrip(tmp_path: pathlib.Path) -> None:
    """Restored snapshot has identical note count and alembic_version as source.

    A silently-corrupt backup (e.g. torn WAL read from a raw cp) would fail
    this assertion — that's the point. Row count equality proves data integrity;
    alembic_version equality proves schema-version integrity.
    """
    from backup_notes import make_snapshot

    note_count = 5
    src = _make_seeded_db(tmp_path, note_count=note_count)
    out_dir = tmp_path / "out"
    out_dir.mkdir()

    gz = make_snapshot(src, out_dir)

    # Restore: gunzip → open with sqlite3
    restored = tmp_path / "restored.db"
    with gzip.open(gz, "rb") as f_in, open(restored, "wb") as f_out:
        f_out.write(f_in.read())

    # Assert row count equality (data integrity)
    src_con = sqlite3.connect(str(src))
    src_count = src_con.execute("SELECT count(*) FROM notes").fetchone()[0]
    src_version = src_con.execute(
        "SELECT version_num FROM alembic_version"
    ).fetchone()[0]
    src_con.close()

    rst_con = sqlite3.connect(str(restored))
    rst_count = rst_con.execute("SELECT count(*) FROM notes").fetchone()[0]
    rst_version = rst_con.execute(
        "SELECT version_num FROM alembic_version"
    ).fetchone()[0]
    rst_con.close()

    assert rst_count == src_count, (
        f"Row count mismatch: source has {src_count} notes, "
        f"restored snapshot has {rst_count}"
    )
    assert rst_version == src_version, (
        f"alembic_version mismatch: source='{src_version}', "
        f"restored='{rst_version}'"
    )


# ---------------------------------------------------------------------------
# test_no_raw_copy — Pitfall 1 guard: .backup() used; no raw copy utilities
# ---------------------------------------------------------------------------


def test_no_raw_copy() -> None:
    """backup_notes.py uses .backup() and never shutil.copy or os.system.

    This is a source-level guard against Pitfall 1 (RESEARCH.md): copying the
    live notes.db without WAL sidecars yields a torn, inconsistent snapshot.
    The online-backup API (sqlite3.Connection.backup()) handles WAL atomically.
    """
    backup_src = pathlib.Path(__file__).parent.parent / "backup_notes.py"
    assert backup_src.exists(), f"backup_notes.py not found at {backup_src}"
    text = backup_src.read_text()

    assert ".backup(" in text, (
        "Missing sqlite3.Connection.backup() call in backup_notes.py — "
        "the online-backup API is required for WAL-safe consistent snapshots"
    )
    assert "shutil.copy" not in text, (
        "Forbidden: 'shutil.copy' found in backup_notes.py — "
        "raw file copy of notes.db yields a torn WAL snapshot (Pitfall 1)"
    )
    assert "os.system" not in text, (
        "Forbidden: 'os.system' found in backup_notes.py — "
        "shell copy commands bypass the WAL-safe backup API (Pitfall 1)"
    )


# ---------------------------------------------------------------------------
# test_upload_snapshot_mocked — boto3 S3 upload with correct bucket + key prefix
# ---------------------------------------------------------------------------


def test_upload_snapshot_mocked(tmp_path: pathlib.Path, monkeypatch) -> None:
    """upload_snapshot() calls s3.upload_file with the correct bucket and key.

    Mocks boto3.Session so no real S3 call is made. Asserts:
      - The bucket argument equals the value passed to upload_snapshot()
      - The returned key starts with the 'backups/notes_' prefix

    This proves that upload_snapshot() routes to the correct bucket and uses
    the expected key naming convention.
    """
    import boto3
    from backup_notes import upload_snapshot

    # Create a fake .db.gz file (contents don't matter for upload routing)
    gz = tmp_path / "notes_20260703_120000.db.gz"
    gz.write_bytes(b"fake-gzipped-content")

    # Capture upload_file calls without touching S3
    upload_calls: list[dict] = []

    class _FakeS3Client:
        def upload_file(self, Filename: str, Bucket: str, Key: str) -> None:  # noqa: N803
            upload_calls.append({"Filename": Filename, "Bucket": Bucket, "Key": Key})

    class _FakeSession:
        def __init__(self, profile_name: str | None = None) -> None:
            self.profile_name = profile_name

        def client(self, service_name: str) -> _FakeS3Client:
            return _FakeS3Client()

    monkeypatch.setattr(boto3, "Session", _FakeSession)

    key = upload_snapshot(gz, "fake-bucket")

    assert len(upload_calls) == 1, (
        f"Expected 1 upload_file call, got {len(upload_calls)}"
    )
    assert upload_calls[0]["Bucket"] == "fake-bucket", (
        f"Expected Bucket='fake-bucket', got {upload_calls[0]['Bucket']!r}"
    )
    assert key.startswith("backups/notes_"), (
        f"Expected key to start with 'backups/notes_', got {key!r}"
    )
