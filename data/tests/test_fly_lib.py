"""Calls to the Fly Machine are retried when Fly fails, not when the command does
(data/fly-lib.sh, beeatlas-uibw.10).

A fake flyctl fails a given number of times before it succeeds, with the message Fly's
API gave on 2026-11-01, or with the message flyctl gives when the remote command ran
and exited non-zero. These run the real fly_retry in bash with the waits set to zero.
"""

import subprocess
from pathlib import Path

import pytest

FLY_LIB = Path(__file__).resolve().parents[1] / "fly-lib.sh"

FAKE_FLYCTL = """#!/usr/bin/env bash
# Fails while the counter file holds a number above zero, then prints its stdout.
n=$(cat "$COUNTER")
echo $((n - 1)) > "$COUNTER"
echo "call" >> "$CALLS"
if [ "$n" -gt 0 ]; then
    echo "$FAILURE" >&2
    exit 1
fi
printf 'payload\\n'
"""

API_503 = (
    "Error: failed retrieving organization for app beeatlas: failed to get organization "
    "peter-abrahamsen (status 503): <html><body><h1>503 Service Unavailable</h1>"
)
REMOTE_FAILED = "Error: ssh shell: Process exited with status 7"


@pytest.fixture
def fake(tmp_path):
    flyctl = tmp_path / "flyctl"
    flyctl.write_text(FAKE_FLYCTL)
    flyctl.chmod(0o755)
    return tmp_path


def run(fake: Path, failures: int, message: str, waits: str = "0 0 0"):
    (fake / "counter").write_text(str(failures))
    (fake / "calls").write_text("")
    script = f'. "{FLY_LIB}"; fly_retry "{fake}/flyctl" ssh console -C true'
    r = subprocess.run(
        ["bash", "-c", script],
        capture_output=True, text=True,
        env={"PATH": "/usr/bin:/bin", "COUNTER": str(fake / "counter"),
             "CALLS": str(fake / "calls"), "FAILURE": message,
             "FLY_RETRY_WAITS": waits},
    )
    calls = len((fake / "calls").read_text().splitlines())
    return r, calls


def test_a_call_that_fails_at_fly_is_tried_again(fake):
    r, calls = run(fake, failures=2, message=API_503)
    assert r.returncode == 0
    assert calls == 3
    assert r.stdout == "payload\n", "stdout passes through untouched"
    assert "503" in r.stderr, "each failure is still shown in the log"


def test_retries_stop_after_the_last_wait(fake):
    r, calls = run(fake, failures=10, message=API_503, waits="0 0")
    assert r.returncode == 1
    assert calls == 3


def test_a_remote_command_that_ran_and_failed_is_not_tried_again(fake):
    """Running it again would fail again, or wait out the same lock a second time."""
    r, calls = run(fake, failures=1, message=REMOTE_FAILED)
    assert r.returncode == 1
    assert calls == 1


def test_a_call_that_succeeds_runs_once(fake):
    r, calls = run(fake, failures=0, message=API_503)
    assert r.returncode == 0
    assert calls == 1
