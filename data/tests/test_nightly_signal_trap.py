"""An interrupted nightly must not be reported as a failed gate (beeatlas-bbo9).

Every gate in data/nightly.sh is a plain `if ! <cmd>; then <abort>; fi`, so a
signal that stops <cmd> lands in the failure branch. The stelis gate's abort used
to name a CAUSE there ("the engine disagrees with this repo"), which an operator's
^C is not. Reading the exit code cannot distinguish the two — Racket handles
SIGINT as an exn:break and exits 1, exactly like a failing test — so nightly.sh
traps the signal instead and leaves before any failure branch is reached.

These tests run THE REAL TRAP BLOCK, spliced out of data/nightly.sh, around a
stand-in gate. The stand-in is a Python child that mimics Racket's behaviour
(handle SIGINT, print "user break", exit 1) so the suite needs no Racket, and so
the test still means something if the stelis gate is ever run by something else.

Splicing rather than copying is the point: delete or break the trap in nightly.sh
and these fail. A copy would keep passing.
"""

import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

NIGHTLY = Path(__file__).resolve().parents[1] / "nightly.sh"

# The gate's shape, reproduced exactly: a bare `if !`, whose failure branch
# asserts something. If the trap works, GATE-FAILURE-BRANCH is never printed.
GATE = """
_stage="stelis-gate"
echo "--- gate ---"
if ! "$FAKE_GATE_CMD" "$FAKE_GATE_MODE"; then
    echo "GATE-FAILURE-BRANCH" >&2
    exit 1
fi
echo "GATE-PASSED"
"""

# Stands in for `raco test`. In "break" mode it does what Racket does with
# SIGINT: catches it, says so, and exits 1 — NOT 130. In "fail" mode it is an
# ordinary test failure. In "pass" mode the gate succeeds.
FAKE_GATE = """\
import signal, sys, time

mode = sys.argv[1]
SLEEP = 3  # long enough to be signalled mid-command, short enough for a fast suite

def on_int(signum, frame):
    print("user break", file=sys.stderr)
    sys.exit(1)

signal.signal(signal.SIGINT, on_int)
if mode == "fail":
    print("contract-check: the engine really does disagree", file=sys.stderr)
    sys.exit(1)
if mode == "pass":
    sys.exit(0)
time.sleep(SLEEP)
"""


def _trap_block() -> str:
    """The signal-handling code out of nightly.sh, verbatim.

    Bounded by the `_stage` initialisation and the last `trap ... HUP` line, both
    of which the source marks as belonging together.
    """
    src = NIGHTLY.read_text()
    start = src.index('_stage="startup"')
    end = src.index("trap '_on_signal HUP'")
    end = src.index("\n", end) + 1
    block = src[start:end]
    assert "_on_signal()" in block, "trap handler missing from nightly.sh"
    return block


@pytest.fixture(scope="module")
def harness(tmp_path_factory) -> tuple[Path, Path]:
    d = tmp_path_factory.mktemp("nightly-signal")
    fake = d / "fake_gate.py"
    fake.write_text(FAKE_GATE)
    script = d / "gate.sh"
    script.write_text("#!/usr/bin/env bash\nset -euo pipefail\n" + _trap_block() + GATE)
    script.chmod(0o755)
    return script, fake


def _run(harness, mode: str, sig: int | None, group: bool = False):
    script, fake = harness
    runner = script.parent / "run_fake.sh"
    runner.write_text(f'#!/usr/bin/env bash\nexec "{sys.executable}" "{fake}" "$1"\n')
    runner.chmod(0o755)
    env = {**os.environ, "FAKE_GATE_CMD": str(runner), "FAKE_GATE_MODE": mode}

    # Output goes to a FILE, not a pipe. On a PID-only signal the stand-in gate
    # is orphaned and keeps running; if it held the read end of a pipe, reading
    # it would block until that orphan exited, which is the whole 20s it sleeps.
    log = script.parent / f"out-{mode}-{sig}-{group}.log"
    with log.open("w") as fh:
        p = subprocess.Popen(
            ["bash", str(script)],
            env=env,
            stdout=fh,
            stderr=subprocess.STDOUT,
            text=True,
            # A new session reproduces an interactive ^C faithfully: the signal
            # can then be sent to the whole process group, as a terminal does.
            start_new_session=True,
        )
        if sig is not None:
            _wait_for_gate(p)
            if group:
                os.killpg(p.pid, sig)  # what ^C does
            else:
                p.send_signal(sig)  # what `kill -INT <pid>` does
        p.wait(timeout=60)
    # Reap the orphan so it cannot outlive the test session.
    subprocess.run(["pkill", "-9", "-P", str(p.pid)], capture_output=True)
    return p.returncode, log.read_text()


def _wait_for_gate(p: subprocess.Popen, timeout: float = 10.0) -> None:
    """Block until the stand-in gate is actually running, so the signal lands
    mid-command rather than before the trap is installed."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if p.poll() is not None:
            return
        children = subprocess.run(
            ["pgrep", "-P", str(p.pid)], capture_output=True, text=True
        )
        if children.stdout.strip():
            time.sleep(0.2)  # let the child reach its sleep
            return
        time.sleep(0.05)
    raise AssertionError("the stand-in gate never started")


@pytest.mark.parametrize(
    "sig,expected_rc",
    [(signal.SIGINT, -signal.SIGINT), (signal.SIGTERM, -signal.SIGTERM),
     (signal.SIGHUP, -signal.SIGHUP)],
)
def test_signal_is_reported_as_an_abort_not_a_gate_failure(harness, sig, expected_rc):
    """AC-1/2/3/6: the abort is named, the failure branch is not reached, and the
    run dies of the signal rather than of the gate's synthesized exit 1."""
    rc, out = _run(harness, "break", sig)
    assert "GATE-FAILURE-BRANCH" not in out, f"gate failure branch reached:\n{out}"
    assert re.search(rf"ABORTED BY SIG{signal.Signals(sig).name[3:]}\b", out), out
    assert "stelis-gate" in out, "the abort should name the stage it stopped in"
    assert rc == expected_rc, f"expected death by signal, got {rc}:\n{out}"


def test_interactive_ctrl_c_reaches_the_trap(harness):
    """AC-1: ^C signals the whole process group — the child dies too, and Racket's
    exit-1-after-'user break' is exactly the case that used to be misreported."""
    rc, out = _run(harness, "break", signal.SIGINT, group=True)
    assert "GATE-FAILURE-BRANCH" not in out, out
    assert "ABORTED BY SIGINT" in out, out
    assert rc == -signal.SIGINT, out


def test_a_pid_only_signal_is_honest_but_not_prompt(harness):
    """The documented limitation, pinned so it is not rediscovered as a bug.

    Bash will not run a trap while it is waiting on a foreground command, so a
    signal sent to THIS PID alone (a `timeout` wrapper's SIGTERM, an operator's
    `kill <pid>`) is not acted on until the running gate finishes on its own.
    The report is still honest — that is what beeatlas-bbo9 is about — it just
    arrives late. Signalling the process GROUP, as a terminal's ^C does, is what
    makes it immediate; see test_interactive_ctrl_c_reaches_the_trap.
    """
    start = time.monotonic()
    rc, out = _run(harness, "break", signal.SIGINT)  # PID only
    deferred = time.monotonic() - start
    assert rc == -signal.SIGINT and "ABORTED BY SIGINT" in out, out
    assert deferred >= 2.0, (
        "the trap fired before the gate finished — bash's deferral changed, so the "
        "note in nightly.sh about signalling the group is now wrong"
    )


def test_a_real_gate_failure_still_aborts_the_publish(harness):
    """AC-5: the trap must not swallow real failures."""
    rc, out = _run(harness, "fail", None)
    assert "GATE-FAILURE-BRANCH" in out, out
    assert "ABORTED BY SIG" not in out, out
    assert rc == 1, f"a failed gate must exit 1, got {rc}:\n{out}"


def test_a_passing_gate_is_unaffected(harness):
    rc, out = _run(harness, "pass", None)
    assert "GATE-PASSED" in out
    assert rc == 0


def test_interrupt_and_failure_exit_statuses_differ(harness):
    """AC-6, stated directly: whatever reads the exit code can tell them apart."""
    interrupted, _ = _run(harness, "break", signal.SIGINT)
    failed, _ = _run(harness, "fail", None)
    assert interrupted != failed


def test_the_stelis_gate_no_longer_asserts_a_cause():
    """The second half of beeatlas-bbo9: a gate that cannot distinguish a cause
    must not name one. Its two siblings state the outcome and stop."""
    src = NIGHTLY.read_text()
    gate = src[src.index("STELIS TEST GATE FAILED") :]
    gate = gate[: gate.index("exit 1")]
    assert "The engine disagrees with this repo" not in gate
    assert "cannot name it" in gate, "the gate should say it does not know the cause"


def test_every_gate_is_covered_by_the_trap():
    """AC-2: the trap is installed once, before the first gate — not per gate."""
    src = NIGHTLY.read_text()
    trap_at = src.index("trap '_on_signal INT'")
    for marker in (
        "STELIS TEST GATE FAILED",
        "INTEGRATION GATE FAILED",
        "JS DATA TEST GATE FAILED",
    ):
        assert trap_at < src.index(marker), f"{marker} is not covered by the trap"


def test_the_exit_trap_still_runs_after_an_interrupt(tmp_path):
    """AC-4: the backups must not be skipped on an interrupted run. Re-raising
    from the default handler is the step that could plausibly bypass them."""
    marker = tmp_path / "exit-trap-ran"
    script = tmp_path / "gate.sh"
    script.write_text(
        "#!/usr/bin/env bash\nset -euo pipefail\n"
        + _trap_block()
        + f"trap 'echo ran > {marker}' EXIT\n"
        + "sleep 3\n"
    )
    p = subprocess.Popen(["bash", str(script)], start_new_session=True)
    _wait_for_gate(p)
    p.send_signal(signal.SIGINT)
    p.wait(timeout=30)
    assert marker.exists(), "the EXIT trap did not run — backups would be skipped"
