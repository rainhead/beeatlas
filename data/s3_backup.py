"""Offsite backups to S3: the one place the pipeline talks to S3.

Two callers share it. data/nightly.sh's EXIT trap backs up the pipeline DuckDB and
the taxonomy cache to the pipeline backup bucket, and data/backup_notes.py backs up
the notes store to the authoritative backup bucket. One module means one way to
find credentials and one way to fail (beeatlas-gcdo.1, beeatlas-pqfr).

CREDENTIALS. The named profile (AWS_PROFILE, default "beeatlas") when this machine
has it, which is how maderas runs. Otherwise the key pair in the environment
(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY), which is how a container receives
them, as Fly secrets. Otherwise a refusal that says which of the two is missing.
The fallback exists because boto3 treats an AWS_PROFILE naming a profile that is
not configured as fatal, even when a key pair is right there in the environment;
the AWS CLI's --profile did the same, and the nightly's `|| true` hid it.

VERIFICATION. An upload counts only once S3 says so: after the upload, the object
must have the local file's size, and it must not be the object it replaced, when
there was one. Both buckets are versioned, so that is a new version id; for an
unversioned bucket, a later LastModified. A silent upload to the wrong place would
otherwise look like a backup.

    python s3_backup.py upload --bucket B KEY=PATH [KEY=PATH ...]
    python s3_backup.py restore --bucket B KEY DEST

`upload` skips a PATH that does not exist (a first run has no taxonomy cache yet),
attempts every other one even after a failure, and exits 1 if any failed. `restore`
downloads beside DEST and renames into place, and refuses to overwrite DEST.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import boto3
import botocore.session
from boto3.exceptions import Boto3Error
from botocore.exceptions import BotoCoreError, ClientError


class BackupError(Exception):
    """A backup or restore that did not happen, with the reason."""


# Everything an S3 call can raise. A failed transfer surfaces as boto3's own
# S3UploadFailedError (a Boto3Error), not as the botocore ClientError beneath it.
S3_ERRORS = (BackupError, Boto3Error, BotoCoreError, ClientError, OSError)


def session(profile: str | None = None, environ=os.environ) -> tuple[boto3.Session, str]:
    """A boto3 session, and a description of where its credentials came from.

    The description names the profile or says "environment"; it never carries a key.
    """
    if profile is None:
        profile = environ.get("AWS_PROFILE", "beeatlas")
    # botocore's own session reads the profile list without resolving AWS_PROFILE,
    # which boto3.Session() does on construction and fails on.
    if profile and profile in botocore.session.Session().available_profiles:
        return boto3.Session(profile_name=profile), f"profile {profile}"
    if environ.get("AWS_ACCESS_KEY_ID") and environ.get("AWS_SECRET_ACCESS_KEY"):
        # The profile is not configured here, so boto3 must not go looking for it.
        environ.pop("AWS_PROFILE", None)
        return boto3.Session(), "environment"
    raise BackupError(
        f"no AWS credentials: this machine has no profile {profile!r}, and "
        "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not both set"
    )


def _head(s3, bucket: str, key: str) -> dict | None:
    """The object's metadata, or None when there is no such object."""
    try:
        return s3.head_object(Bucket=bucket, Key=key)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def upload_verified(s3, path: Path, bucket: str, key: str) -> dict:
    """Upload PATH to s3://BUCKET/KEY and confirm S3 holds it. Returns the new
    object's metadata; raises BackupError when the object is not what was sent."""
    size = path.stat().st_size
    before = _head(s3, bucket, key)
    s3.upload_file(str(path), bucket, key)
    after = _head(s3, bucket, key)
    if after is None:
        raise BackupError(f"s3://{bucket}/{key} is absent after the upload")
    if after["ContentLength"] != size:
        raise BackupError(
            f"s3://{bucket}/{key} holds {after['ContentLength']} bytes after the "
            f"upload, but {path} is {size}"
        )
    if before is not None:
        # Both backup buckets are versioned, and every upload is a new version, so
        # the version id is the exact test. LastModified, to the second, is the
        # fallback for an unversioned bucket.
        if before.get("VersionId") and after.get("VersionId"):
            unchanged = after["VersionId"] == before["VersionId"]
            detail = f"its version is still {after['VersionId']}"
        else:
            unchanged = after["LastModified"] <= before["LastModified"]
            detail = f"LastModified is still {after['LastModified'].isoformat()}"
        if unchanged:
            raise BackupError(f"s3://{bucket}/{key} did not change: {detail}")
    return after


def upload(bucket: str, pairs: list[tuple[str, Path]], s3=None, out=sys.stdout) -> bool:
    """Upload each (key, path) whose path exists. True when every one verified."""
    if s3 is None:
        sess, source = session()
        print(f"s3_backup: credentials from {source}", file=out)
        s3 = sess.client("s3")
    ok = True
    for key, path in pairs:
        if not path.exists():
            print(f"s3_backup: skip {key}: {path} does not exist", file=out)
            continue
        try:
            meta = upload_verified(s3, path, bucket, key)
        except S3_ERRORS as e:
            print(f"s3_backup: FAILED {key}: {e}", file=out)
            ok = False
            continue
        print(
            f"s3_backup: {path} -> s3://{bucket}/{key} "
            f"({meta['ContentLength']} bytes, {meta['LastModified'].isoformat()})",
            file=out,
        )
    return ok


def restore(bucket: str, key: str, dest: Path, s3=None, out=sys.stdout) -> None:
    """Download s3://BUCKET/KEY to DEST, which must not exist yet."""
    if dest.exists():
        raise BackupError(f"{dest} exists; move it aside first")
    if s3 is None:
        sess, source = session()
        print(f"s3_backup: credentials from {source}", file=out)
        s3 = sess.client("s3")
    partial = dest.with_name(dest.name + ".partial")
    s3.download_file(bucket, key, str(partial))
    os.replace(partial, dest)
    print(f"s3_backup: s3://{bucket}/{key} -> {dest}", file=out)


def _pair(arg: str) -> tuple[str, Path]:
    key, sep, path = arg.partition("=")
    if not sep or not key or not path:
        raise argparse.ArgumentTypeError(f"expected KEY=PATH, got {arg!r}")
    return key, Path(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    up = sub.add_parser("upload", help="upload KEY=PATH pairs and verify each")
    up.add_argument("--bucket", required=True)
    up.add_argument("pairs", nargs="+", type=_pair, metavar="KEY=PATH")
    rs = sub.add_parser("restore", help="download KEY to DEST")
    rs.add_argument("--bucket", required=True)
    rs.add_argument("key")
    rs.add_argument("dest", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.cmd == "upload":
            return 0 if upload(args.bucket, args.pairs) else 1
        restore(args.bucket, args.key, args.dest)
        return 0
    except S3_ERRORS as e:
        print(f"s3_backup: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
