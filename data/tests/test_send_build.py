"""How data/send-build.sh reads the Machine's check of the staged build (ADR 0046).

A stale build (exit 79) sends Hostess off to build again, so only the receipt's own
verdict may produce it, and a check that ran on the Machine and failed must not be
retried: it would only fail again, or wait out the same lock again. These run THE
REAL SCRIPT, from a scratch checkout, with stand-ins for rsync and flyctl.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

DATA = Path(__file__).resolve().parents[1]

FAKE_RSYNC = """#!/usr/bin/env bash
echo "Number of files: 1"
"""

# Fails at Fly while FLY_FAILURES > calls so far; then answers the check with CHECK.
FAKE_FLYCTL = """#!/usr/bin/env bash
n=$(( $(cat "$CALLS") + 1 )); echo $n > "$CALLS"
if [ "$n" -le "${FLY_FAILURES:-0}" ]; then
    echo "Error: failed to get organization (status 503)" >&2; exit 1
fi
case "$CHECK" in
    current) echo "build receipt current (3 files in _site)" ;;
    stale)   echo "build receipt stale: render changed since the last full build (a → b)" >&2
             echo "Error: ssh shell: Process exited with status 1" >&2; exit 1 ;;
    lock)    echo "Error: ssh shell: Process exited with status 1" >&2; exit 1 ;;
esac
"""


@pytest.fixture
def hostess(tmp_path):
    repo = tmp_path / "beeatlas"
    for f in ("send-build.sh", "fly-lib.sh", "fly-rsh.sh"):
        (repo / "data").mkdir(parents=True, exist_ok=True)
        shutil.copy(DATA / f, repo / "data" / f)
    # Hostess's layout: _site and .cache are links to site/ and cache/.
    for d in ("site", "cache/beeatlas-build", "cache/beeatlas-vite"):
        (tmp_path / d).mkdir(parents=True)
    (repo / "_site").symlink_to(tmp_path / "site")
    (repo / ".cache").symlink_to(tmp_path / "cache")
    var = tmp_path / "var"
    (var / "export").mkdir(parents=True)
    (var / "stelis").mkdir()
    (var / "stelis/build-log.html").write_text("log")
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    for name, body in (("rsync", FAKE_RSYNC), ("flyctl", FAKE_FLYCTL)):
        (bin_ / name).write_text(body)
        (bin_ / name).chmod(0o755)
    (tmp_path / "calls").write_text("0")
    return {"repo": repo, "tmp": tmp_path, "env": {
        "PATH": f"{bin_}:/usr/bin:/bin", "FLYCTL": str(bin_ / "flyctl"),
        "SEND_TO_FLY_APP": "beeatlas", "EXPORT_DIR": str(var / "export"),
        "STELIS_STATE_DIR": str(var / "stelis"), "CALLS": str(tmp_path / "calls"),
        "FLY_RETRY_WAITS": "0 0 0",
    }}


def send(h, **env):
    r = subprocess.run(["bash", str(h["repo"] / "data/send-build.sh")],
                       capture_output=True, text=True, env={**h["env"], **env})
    return r, int((h["tmp"] / "calls").read_text())


def test_a_current_build_passes(hostess):
    r, calls = send(hostess, CHECK="current")
    assert r.returncode == 0, r.stderr
    assert calls == 1


def test_a_stale_receipt_is_79_and_is_not_retried(hostess):
    r, calls = send(hostess, CHECK="stale")
    assert r.returncode == 79
    assert calls == 1


def test_a_check_that_failed_otherwise_is_not_stale_and_is_not_retried(hostess):
    """The lock timing out, say: not a reason to build again, nor to wait again."""
    r, calls = send(hostess, CHECK="lock")
    assert r.returncode not in (0, 79)
    assert calls == 1


def test_a_check_that_failed_at_fly_is_retried(hostess):
    r, calls = send(hostess, CHECK="current", FLY_FAILURES="2")
    assert r.returncode == 0, r.stderr
    assert calls == 3
