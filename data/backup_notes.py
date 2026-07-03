"""Consistent-snapshot backup for the BeeAtlas authoritative notes store.

Uses the stdlib sqlite3.Connection.backup() API to take a WAL-safe snapshot
of the live notes.db (no torn reads — Pitfall 1 guard from RESEARCH.md). The
snapshot is gzipped at compresslevel=9 and pushed to the dedicated
AuthoritativeBackupBucket via boto3, using the 'beeatlas' AWS profile
(matching the nightly.sh convention).

Three public functions for testability — S3 is NOT exercised locally:
  make_snapshot(db_path, out_dir) -> Path   # snapshot + gzip; no S3 call
  upload_snapshot(gz_path, bucket, ...)     # S3 push only; no file I/O
  backup_notes()                            # orchestrator: reads env, calls both

Design decisions (from 177-CONTEXT.md / 177-RESEARCH.md):
  D-09: Consistent snapshot via sqlite3.Connection.backup() — NOT a raw file copy
  D-13: Upload to dedicated AuthoritativeBackupBucket (isolated from siteBucket)
  D-14: Versioning + lifecycle managed at the bucket level (not here)
  D-15: Source DB lives outside EXPORT_DIR; path from NOTES_DB_PATH env var

Pitfall 1 guard: NEVER copy the live notes.db directly (e.g., raw system copy
commands) — copying only the .db file without WAL sidecars yields a torn,
inconsistent snapshot. The backup() API handles WAL atomically.
"""

import gzip
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import boto3


def make_snapshot(db_path: "str | Path", out_dir: "str | Path") -> Path:
    """Take a WAL-safe consistent snapshot of db_path and gzip it into out_dir.

    Opens the source read-only via URI mode (?mode=ro) so the backup is
    invisible to concurrent writers. Copies all pages with src.backup(dst) —
    the stdlib online-backup API — which produces a complete, sidecar-free,
    consistent copy even if the WAL has uncommitted frames. Raw file copy
    utilities are never used (Pitfall 1 torn read).

    Args:
        db_path: Path to the live notes.db (opened read-only).
        out_dir: Directory for the gzipped output.

    Returns:
        Path to the gzipped snapshot: <out_dir>/notes_<UTC-ts>.db.gz
    """
    db_path = Path(db_path)
    out_dir = Path(out_dir)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    # Step 1: Consistent snapshot via the online-backup API.
    # ?mode=ro: source opened read-only — we never write to the live store here.
    # src.backup(dst): WAL-aware atomic copy; pages=-1 (default) = full copy in
    # one step. Output is a fully-checkpointed SQLite file with no WAL sidecars.
    src = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        tmp_fd, tmp_name = tempfile.mkstemp(suffix=".db")
        os.close(tmp_fd)
        tmp_db = Path(tmp_name)
        dst = sqlite3.connect(str(tmp_db))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()

    # Step 2: Gzip the snapshot (compresslevel=9 per plan spec).
    gz_path = out_dir / f"notes_{ts}.db.gz"
    with open(tmp_db, "rb") as f_in, gzip.open(gz_path, "wb", compresslevel=9) as f_out:
        while chunk := f_in.read(65536):
            f_out.write(chunk)
    tmp_db.unlink()

    return gz_path


def upload_snapshot(
    gz_path: "str | Path",
    bucket: str,
    profile: str = "beeatlas",
    key_prefix: str = "backups/",
) -> str:
    """Push a gzipped snapshot to the dedicated AuthoritativeBackupBucket.

    Uses boto3.Session(profile_name=profile) to pick up the named AWS profile,
    mirroring the `AWS_PROFILE=beeatlas` convention in nightly.sh line 40.
    The pipeline IAM user has PutObject + GetObject on the backup bucket
    (no DeleteObject — structural boundary; plan 177-02).

    Args:
        gz_path: Local path to the .db.gz snapshot.
        bucket:  S3 bucket name (NOTES_BACKUP_BUCKET CDK output).
        profile: AWS named profile (default: "beeatlas").
        key_prefix: S3 key prefix (default: "backups/").

    Returns:
        The S3 key the snapshot was uploaded to (e.g. "backups/notes_20260703_120000.db.gz").
    """
    gz_path = Path(gz_path)
    key = f"{key_prefix}{gz_path.name}"
    session = boto3.Session(profile_name=profile)
    s3 = session.client("s3")
    s3.upload_file(str(gz_path), bucket, key)
    return key


def backup_notes() -> None:
    """Orchestrate a full notes-store backup: snapshot → gzip → S3 push.

    Reads env vars:
      NOTES_DB_PATH       — path to the live notes.db
                            (default: /opt/beeatlas-store/notes.db per D-15)
      NOTES_BACKUP_BUCKET — target S3 bucket (REQUIRED; KeyError if absent)
      AWS_PROFILE         — AWS named profile (default: "beeatlas")

    Workflow:
      1. Snapshot the live DB into a temp directory via make_snapshot()
      2. Upload to S3 via upload_snapshot()
      3. Clean up the temp gz file
      4. Print a structured log line: === notes backup <ts> → s3://<bucket>/<key> ===

    Raises:
      KeyError: If NOTES_BACKUP_BUCKET is not set in the environment. This is
                intentional fail-fast behaviour — running without a target bucket
                is always a misconfiguration (never silently skip the upload).
    """
    db_path = os.environ.get("NOTES_DB_PATH", "/opt/beeatlas-store/notes.db")
    bucket = os.environ["NOTES_BACKUP_BUCKET"]  # KeyError if unset — fail-fast
    aws_profile = os.environ.get("AWS_PROFILE", "beeatlas")

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    staging_dir = Path(tempfile.mkdtemp(prefix="notes_backup_"))
    try:
        gz_path = make_snapshot(db_path, staging_dir)
        key = upload_snapshot(gz_path, bucket, profile=aws_profile)
        gz_path.unlink(missing_ok=True)
    finally:
        # Best-effort cleanup of the staging dir (may still contain gz on error).
        try:
            staging_dir.rmdir()
        except OSError:
            pass  # Non-empty on failure path — not fatal; /tmp cleanup is fine

    print(f"=== notes backup {ts} → s3://{bucket}/{key} ===")


if __name__ == "__main__":
    backup_notes()
