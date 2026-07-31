"""Coalescing publish queue (beeatlas-3nz).

The properties here are the reason the module exists, and none of them are visible by
reading it: that concurrent writers SHARE a build instead of each running one, that
they all still learn the truth about their own note, that only one build runs at a
time, and that a writer arriving mid-build is covered by the next build rather than
the one already in flight.

Builds are simulated with an Event the test releases, so the interleavings are chosen
rather than raced.
"""

from __future__ import annotations

import threading
import time

from api.publish_queue import CoalescingPublisher


class FakeBuild:
    """A build the test starts and finishes on command.

    `started` is released when a build begins; `release()` lets it finish. Records
    how many builds ran and how many were concurrent (which must never exceed 1).
    """

    def __init__(self, ok: bool = True) -> None:
        self.ok = ok
        self.calls = 0
        self.max_concurrent = 0
        self._active = 0
        self._lock = threading.Lock()
        self.started = threading.Event()
        self._gate = threading.Event()

    def __call__(self) -> bool:
        with self._lock:
            self.calls += 1
            self._active += 1
            self.max_concurrent = max(self.max_concurrent, self._active)
        self.started.set()
        # Fail loudly rather than completing as if released: silently returning after a
        # timeout would let a test that means to simulate a HUNG build get a successful
        # one instead, and pass for the wrong reason.
        if not self._gate.wait(10):
            with self._lock:
                self._active -= 1
            raise AssertionError("FakeBuild was never released — the test left a build hanging")
        with self._lock:
            self._active -= 1
        return self.ok

    def release(self) -> None:
        self._gate.set()


def _spawn(publisher, results, key):
    def run():
        results[key] = publisher.publish()

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


def test_single_write_publishes_and_reports_live():
    build = FakeBuild()
    build.release()
    p = CoalescingPublisher(build, timeout=5)
    assert p.publish() == "live"
    assert build.calls == 1


def test_writes_arriving_during_a_build_coalesce_into_one_further_build():
    """The headline property: 4 writers arriving mid-build cost ONE extra build.

    Before this queue each of them ran its own, so the 4th waited 4 build-times and,
    past PUBLISH_LOCK_WAIT, was told "publish pending" for a note that was committed.
    """
    build = FakeBuild()
    p = CoalescingPublisher(build, timeout=10)
    results: dict[str, str] = {}

    first = _spawn(p, results, "w0")
    assert build.started.wait(5), "the first write should start a build"

    # Three more arrive while that build is in flight.
    later = [_spawn(p, results, f"w{i}") for i in range(1, 4)]
    # Wait until all three hold tickets. Without this the release below can beat a
    # slow thread to its ticket, that thread lands in a THIRD build, and the
    # coalescing assertion fails intermittently — the test would be racing the
    # property it means to assert.
    deadline = time.monotonic() + 5
    while p.requested < 4 and time.monotonic() < deadline:
        time.sleep(0.005)
    assert p.requested == 4, "all four writers should be queued before the build finishes"

    # Let the in-flight build finish; the three then share one further build.
    build.release()

    first.join(5)
    for t in later:
        t.join(5)

    assert results == {"w0": "live", "w1": "live", "w2": "live", "w3": "live"}
    # 2 builds for 4 writers — one in flight plus one covering all who arrived during
    # it. Not 4, and not 1 (the three arrived after the first build read the store, so
    # publishing them needed a build that starts later).
    assert build.calls == 2
    assert build.max_concurrent == 1, "builds must never overlap — they share a flock and _site"


def test_a_failed_build_reports_pending_to_everyone_it_covered():
    """Truthful, not optimistic: nothing was published, so nobody is live."""
    build = FakeBuild(ok=False)
    build.release()
    p = CoalescingPublisher(build, timeout=5)
    assert p.publish() == "pending"


def test_a_raising_build_is_a_failure_not_a_crash():
    """Commit-first: the caller's note is already durable, so a raising build must
    degrade to 'pending' rather than propagate and lose the response."""

    def boom() -> bool:
        raise RuntimeError("rsync exploded")

    p = CoalescingPublisher(boom, timeout=5)
    assert p.publish() == "pending"


def test_failure_does_not_poison_later_writes():
    """A later write gets its own build attempt rather than inheriting the verdict."""
    calls = {"n": 0}

    def flaky() -> bool:
        calls["n"] += 1
        return calls["n"] > 1  # first fails, then succeeds

    p = CoalescingPublisher(flaky, timeout=5)
    assert p.publish() == "pending"
    assert p.publish() == "live"
    assert calls["n"] == 2


def test_timeout_reports_pending_without_waiting_for_the_build():
    """A build that never finishes must not hold the request forever."""
    build = FakeBuild()  # never released
    p = CoalescingPublisher(build, timeout=0.2)
    started = time.monotonic()
    try:
        assert p.publish() == "pending"
        # Without a bound this test passes even if publish() ignored the timeout and
        # waited on the build's own 5s gate — "pending" alone does not prove promptness.
        assert time.monotonic() - started < 1
    finally:
        # In a finally: a failed assertion above would otherwise leave the worker
        # blocked on the gate, and a stuck build thread bleeds into later tests.
        build.release()


def _await_worker_exit(publisher, timeout=5):
    deadline = time.monotonic() + timeout
    while publisher.worker_running and time.monotonic() < deadline:
        time.sleep(0.005)
    assert not publisher.worker_running, "worker should have drained and exited"


def test_worker_restarts_after_draining():
    """The worker exits when idle; a later write must start a NEW one.

    Waiting for the exit is what makes this test about the restart. publish() returns
    as soon as its ticket settles, which is typically before the worker has looped,
    found nothing and cleared the flag — so a plain sequence of publishes usually
    finds the old worker still alive and never exercises a restart at all.

    The path being covered is the handoff the lock-owned flag protects: deciding this
    with Thread.is_alive() leaves a window where a request sees a thread that is
    already returning, starts no replacement, and waits for a build nobody runs — a
    hang, not a wrong answer.
    """
    build = FakeBuild()
    build.release()
    p = CoalescingPublisher(build, timeout=5)
    for _ in range(5):
        assert p.publish() == "live"
        _await_worker_exit(p)  # so the NEXT publish must start a fresh worker
    assert build.calls == 5


def test_a_raising_logger_cannot_wedge_the_queue():
    """The failure that would be worst in production: a logger that raises.

    If it escaped _drain, the thread would die with the running flag still set, no
    future request would ever start a worker, and every write would sit out its full
    timeout reporting "pending" while the site silently stopped republishing — until
    someone restarted the service. Logging is diagnostics; it must not be able to do
    that.
    """

    def angry_log(_msg: str) -> None:
        raise RuntimeError("journald is on fire")

    build = FakeBuild()
    build.release()
    p = CoalescingPublisher(build, timeout=5, log=angry_log)

    # The coalescing log fires only with >1 pending, so drive a batch through: hold a
    # build, queue two more writers behind it, then let it go.
    held = FakeBuild()
    p2 = CoalescingPublisher(held, timeout=5, log=angry_log)
    results: dict[str, str] = {}
    first = _spawn(p2, results, "a")
    assert held.started.wait(5)
    later = [_spawn(p2, results, "b"), _spawn(p2, results, "c")]
    deadline = time.monotonic() + 5
    while p2.requested < 3 and time.monotonic() < deadline:
        time.sleep(0.005)
    held.release()
    first.join(5)
    for t in later:
        t.join(5)
    assert results == {"a": "live", "b": "live", "c": "live"}

    # And the queue still works afterwards.
    assert p.publish() == "live"
    _await_worker_exit(p)
    assert p.publish() == "live"


def test_a_worker_that_cannot_start_degrades_instead_of_raising():
    """Thread.start() can fail under fd/thread/memory pressure.

    Two things must not happen: the exception must not reach the route (the note is
    already committed, so a 500 would report failure for a durable write), and the
    running flag must not be left set — that would wedge the queue permanently, since
    every later request would see a worker that does not exist and wait out its whole
    timeout.
    """
    build = FakeBuild()
    build.release()
    p = CoalescingPublisher(build, timeout=1)

    real_thread = threading.Thread

    class ExplodingThread(real_thread):  # type: ignore[misc]
        def start(self):
            raise RuntimeError("can't start new thread")

    threading.Thread = ExplodingThread  # type: ignore[misc]
    try:
        assert p.publish() == "pending"  # degraded, not raised
    finally:
        threading.Thread = real_thread  # type: ignore[misc]

    assert not p.worker_running, "the flag must not be left set, or the queue is wedged"
    assert build.calls == 0

    # And the queue is still usable once threads can be created again — the ticket that
    # went unserved is covered by this build, so nothing is lost, only under-reported.
    assert p.publish() == "live"
    assert build.calls == 1
