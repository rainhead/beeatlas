"""The offsite backup's credentials, its check that S3 holds what was sent, and
what the nightly does when it fails (beeatlas-gcdo.1, beeatlas-pqfr).

S3 is never contacted: a fake client stands in, and the credential tests point
botocore at config files under tmp_path. The nightly tests run THE REAL EXIT TRAP,
cut out of data/nightly.sh the way test_nightly_signal_trap.py cuts out the signal
handler, with `uv` and `curl` replaced on PATH by stubs that record their calls.
"""

from __future__ import annotations

import datetime as dt
import io
import os
import subprocess
from pathlib import Path

import pytest
from boto3.exceptions import S3UploadFailedError
from botocore.exceptions import ClientError

import s3_backup

NIGHTLY = Path(__file__).resolve().parents[1] / "nightly.sh"
T0 = dt.datetime(2026, 10, 1, 3, 0, tzinfo=dt.timezone.utc)


# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------


@pytest.fixture
def aws_files(tmp_path, monkeypatch):
    """Empty AWS config and credentials files, so the developer's own are never read."""
    config = tmp_path / "config"
    creds = tmp_path / "credentials"
    config.write_text("")
    creds.write_text("")
    monkeypatch.setenv("AWS_CONFIG_FILE", str(config))
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", str(creds))
    for var in ("AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    return config, creds


def test_a_configured_profile_is_used(aws_files):
    """maderas: the beeatlas profile exists, so it supplies the credentials."""
    config, creds = aws_files
    config.write_text("[profile beeatlas]\nregion = us-west-2\n")
    creds.write_text("[beeatlas]\naws_access_key_id = AKIAPROFILE\naws_secret_access_key = s\n")
    sess, source = s3_backup.session("beeatlas", environ={})
    assert source == "profile beeatlas"
    assert sess.get_credentials().access_key == "AKIAPROFILE"


def test_a_missing_profile_falls_back_to_the_environment(aws_files, monkeypatch):
    """The container: AWS_PROFILE names a profile no file defines, and the keys are
    in the environment. boto3 alone refuses this outright (the pqfr failure)."""
    monkeypatch.setenv("AWS_PROFILE", "beeatlas")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIAENV")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "s")
    sess, source = s3_backup.session(environ=os.environ)
    assert source == "environment"
    assert sess.get_credentials().access_key == "AKIAENV"


def test_no_profile_and_no_keys_is_refused(aws_files):
    with pytest.raises(s3_backup.BackupError, match="no AWS credentials"):
        s3_backup.session("beeatlas", environ={"AWS_ACCESS_KEY_ID": "AKIAONLYHALF"})


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


class FakeS3:
    """Holds objects as {key: (size, LastModified)}, an unversioned bucket. `stored`
    decides what an upload actually leaves behind, so a test can make S3 disagree
    with the file."""

    def __init__(self, objects=None, stored=None, fail_keys=()):
        self.objects = dict(objects or {})
        self.stored = stored  # (key, size, now) -> (size, LastModified) or False; None = the truth
        self.fail_keys = set(fail_keys)
        self.uploads: list[str] = []
        self.clock = T0

    def head_object(self, Bucket, Key):  # noqa: N803
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        size, modified = self.objects[Key]
        return {"ContentLength": size, "LastModified": modified}

    def upload_file(self, Filename, Bucket, Key):  # noqa: N803
        if Key in self.fail_keys:
            # What boto3's transfer manager raises, wrapping the ClientError.
            raise S3UploadFailedError(f"Failed to upload {Filename} to {Bucket}/{Key}: AccessDenied")
        self.uploads.append(Key)
        size = Path(Filename).stat().st_size
        self.clock += dt.timedelta(hours=1)
        result = (size, self.clock)
        if self.stored is not None:
            result = self.stored(Key, size, self.clock)
        if result is not False:  # False: the upload left nothing behind
            self.objects[Key] = result

    def download_file(self, Bucket, Key, Filename):  # noqa: N803
        Path(Filename).write_bytes(b"x" * self.objects[Key][0])


def _file(tmp_path, name, size):
    p = tmp_path / name
    p.write_bytes(b"x" * size)
    return p


def test_an_upload_that_replaces_an_older_object_verifies(tmp_path):
    s3 = FakeS3(objects={"db/beeatlas.duckdb": (5, T0)})
    meta = s3_backup.upload_verified(s3, _file(tmp_path, "db", 7), "b", "db/beeatlas.duckdb")
    assert meta["ContentLength"] == 7 and meta["LastModified"] > T0


def test_a_first_upload_verifies(tmp_path):
    s3 = FakeS3()
    s3_backup.upload_verified(s3, _file(tmp_path, "db", 7), "b", "k")
    assert s3.uploads == ["k"]


def test_an_object_that_did_not_change_is_a_failure(tmp_path):
    """pqfr's gate: the object must change. Here the upload 'succeeds' but S3
    still holds yesterday's object (an unversioned bucket, so by LastModified)."""
    s3 = FakeS3(objects={"k": (7, T0)}, stored=lambda key, size, now: (7, T0))
    with pytest.raises(s3_backup.BackupError, match="did not change"):
        s3_backup.upload_verified(s3, _file(tmp_path, "db", 7), "b", "k")


class VersionedFakeS3(FakeS3):
    """A versioned bucket: every upload is a new version, whatever its timestamp."""

    def __init__(self, *a, same_version=False, **kw):
        super().__init__(*a, **kw)
        self.same_version = same_version
        self.versions = {k: "v0" for k in self.objects}

    def head_object(self, Bucket, Key):  # noqa: N803
        return {**super().head_object(Bucket, Key), "VersionId": self.versions[Key]}

    def upload_file(self, Filename, Bucket, Key):  # noqa: N803
        super().upload_file(Filename, Bucket, Key)
        if not self.same_version:
            self.versions[Key] = f"v{len(self.uploads)}"


def test_a_new_version_in_the_same_second_verifies(tmp_path):
    """Two uploads within one LastModified second are still two versions."""
    s3 = VersionedFakeS3(objects={"k": (7, T0)}, stored=lambda key, size, now: (size, T0))
    s3_backup.upload_verified(s3, _file(tmp_path, "db", 7), "b", "k")


def test_the_same_version_after_upload_is_a_failure(tmp_path):
    s3 = VersionedFakeS3(objects={"k": (7, T0)}, same_version=True)
    with pytest.raises(s3_backup.BackupError, match="version is still v0"):
        s3_backup.upload_verified(s3, _file(tmp_path, "db", 7), "b", "k")


def test_a_size_mismatch_is_a_failure(tmp_path):
    s3 = FakeS3(stored=lambda key, size, now: (size - 1, now))
    with pytest.raises(s3_backup.BackupError, match="bytes after the upload"):
        s3_backup.upload_verified(s3, _file(tmp_path, "db", 7), "b", "k")


def test_an_object_absent_after_upload_is_a_failure(tmp_path):
    s3 = FakeS3(stored=lambda key, size, now: False)
    with pytest.raises(s3_backup.BackupError, match="absent after the upload"):
        s3_backup.upload_verified(s3, _file(tmp_path, "db", 7), "b", "k")


def test_upload_skips_absent_files_and_attempts_every_other(tmp_path):
    """A failure on the DuckDB must not stop the taxonomy backup, and a missing
    taxonomy cache (a first run) is not a failure."""
    s3 = FakeS3(fail_keys={"db/beeatlas.duckdb"})
    out = io.StringIO()
    ok = s3_backup.upload(
        "b",
        [
            ("db/beeatlas.duckdb", _file(tmp_path, "db", 3)),
            ("raw/taxa.csv.gz", _file(tmp_path, "taxa", 4)),
            ("raw/taxa_cache.json", tmp_path / "absent.json"),
        ],
        s3=s3,
        out=out,
    )
    assert ok is False
    assert s3.uploads == ["raw/taxa.csv.gz"]
    assert "FAILED db/beeatlas.duckdb" in out.getvalue()
    assert "skip raw/taxa_cache.json" in out.getvalue()


def test_upload_all_present_and_verified_is_ok(tmp_path):
    s3 = FakeS3()
    assert s3_backup.upload("b", [("k", _file(tmp_path, "f", 2))], s3=s3, out=io.StringIO())


def test_restore_refuses_to_overwrite(tmp_path):
    dest = _file(tmp_path, "beeatlas.duckdb", 1)
    with pytest.raises(s3_backup.BackupError, match="exists"):
        s3_backup.restore("b", "k", dest, s3=FakeS3(objects={"k": (9, T0)}), out=io.StringIO())


def test_restore_lands_the_whole_file(tmp_path):
    dest = tmp_path / "beeatlas.duckdb"
    s3_backup.restore("b", "k", dest, s3=FakeS3(objects={"k": (9, T0)}), out=io.StringIO())
    assert dest.stat().st_size == 9
    assert not (tmp_path / "beeatlas.duckdb.partial").exists()


# ---------------------------------------------------------------------------
# The nightly's EXIT trap
# ---------------------------------------------------------------------------


def _exit_trap() -> str:
    """The EXIT trap out of nightly.sh, verbatim."""
    src = NIGHTLY.read_text()
    start = src.index("trap '\n_exit_rc=$?")
    end = src.index("' EXIT", start) + len("' EXIT")
    return src[start:end]


def _run_nightly_end(tmp_path, run_rc: int, backup_rc: int) -> tuple[int, str, list[str]]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    calls = tmp_path / "calls"
    calls.write_text("")
    (bin_dir / "uv").write_text(f'#!/bin/sh\necho "uv $*" >> "{calls}"\nexit {backup_rc}\n')
    (bin_dir / "curl").write_text(f'#!/bin/sh\necho "curl $*" >> "{calls}"\n')
    for stub in bin_dir.iterdir():
        stub.chmod(0o755)
    db = _file(tmp_path, "beeatlas.duckdb", 3)
    script = tmp_path / "nightly-end.sh"
    script.write_text(
        "set -euo pipefail\n"
        f'SCRIPT_DIR="{tmp_path}"\nDB_PATH="{db}"\n'
        'BACKUP_BUCKET=bucket\nAWS_PROFILE=beeatlas\n'
        'DB_S3_KEY=db/beeatlas.duckdb\nTAXA_S3_KEY=raw/taxa.csv.gz\nTAXA_CACHE_S3_KEY=raw/taxa_cache.json\n'
        f'TAXA_PATH="{tmp_path}/taxa.csv.gz"\nTAXA_CACHE_PATH="{tmp_path}/taxa_cache.json"\n'
        f'STELIS_DIR="{tmp_path}"\nSTELIS_STATE_DIR="{tmp_path}/stelis"\nSITE_ROOT="{tmp_path}/site"\n'
        "HEALTHCHECK_URL=https://hc-ping.invalid/check\n"
        '_sb_num=""\n'
        "_hash() { echo fakehash; }\n"
        + _exit_trap()
        + f"\nexit {run_rc}\n"
    )
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    p = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr, calls.read_text().splitlines()


def test_a_good_night_backs_up_then_pings(tmp_path):
    rc, out, calls = _run_nightly_end(tmp_path, run_rc=0, backup_rc=0)
    assert rc == 0, out
    assert calls[0].startswith("uv run --directory") and "s3_backup.py upload" in calls[0]
    assert "db/beeatlas.duckdb=" in calls[0]
    assert calls[1].startswith("curl") and "hc-ping.invalid" in calls[1]


def test_a_good_night_whose_backup_failed_withholds_the_ping(tmp_path):
    """beeatlas-pqfr: the miss must raise the alarm, and the exit says why."""
    rc, out, calls = _run_nightly_end(tmp_path, run_rc=0, backup_rc=1)
    assert rc == 74, out
    assert not any(c.startswith("curl") for c in calls), calls
    assert "offsite backup did not" in out


def test_a_failed_night_still_backs_up_keeps_its_code_and_does_not_ping(tmp_path):
    rc, out, calls = _run_nightly_end(tmp_path, run_rc=3, backup_rc=0)
    assert rc == 3, out
    assert any("s3_backup.py upload" in c for c in calls)
    assert not any(c.startswith("curl") for c in calls), calls
