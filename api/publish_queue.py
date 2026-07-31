"""Coalescing publish queue (beeatlas-3nz).

A note write commits and then republishes the site before responding (ADR 0007's
synchronous burned-in publish). One author never notices. N authors serialize: each
write ran its own build behind the same flock, so the k-th concurrent writer waited
k build-times, and once the wait passed PUBLISH_LOCK_WAIT it got exit 75 and a
truthful-but-baffling "saved; publish pending".

The fix is to let concurrent writers SHARE a build instead of queueing one each.

WHAT MAKES THIS SOUND, and it is worth stating because it is the whole design: since
beeatlas-4oa, publish-notes.sh derives which species to render from the committed
store itself (stelis --moved-keys over the notes-store digest). So a build does not
belong to the write that triggered it — **any build that STARTS after my commit
necessarily includes my note.** That turns "did my note get published?" from a
question about key sets into a question about ordering, which a counter answers:

    ticket = ++requested          (taken AFTER the caller's commit is durable)
    a build captures `target = requested` at its start
    ...so on success it has published everything with ticket <= target.

A waiter therefore blocks until a build has CONCLUDED on its ticket
(`settled_through >= ticket`) and then reads `published_through` to learn which way it
went. Note the two counters are not interchangeable and the distinction is not
cosmetic: waiting on `published_through` instead would hang every waiter of a FAILED
build forever, since a failure never advances it. Writes arriving while a build is in
flight get tickets above that build's target, so they are covered by the NEXT build —
one extra build for the whole group, not one each.

The waiter's own deadline is therefore about TWO builds, not one (see the `timeout`
argument): its legitimate worst case is the remainder of the in-flight build plus a
full one of its own.

The POST still blocks, deliberately. ADR 0007 chose the synchronous publish with eyes
open, and coalescing removes the reason to revisit it: concurrent writers now all get
"live" within at most two builds rather than degrading one-by-one into "pending".
Making the POST return early is a separate, larger question (the client would need to
learn about not-yet-baked state) and is no longer forced by this failure mode.

Single-process by design: waitress serves this app with threads in ONE process, so a
lock and a counter here coordinate every writer. The flock inside publish-notes.sh is
still the CROSS-process guard, against the nightly.
"""

from __future__ import annotations

import threading
import time
from typing import Callable

_NOOP = lambda _msg: None  # noqa: E731


class CoalescingPublisher:
    """Serializes builds and lets concurrent writers share one.

    `build` runs a publish and returns True when the site was published. It is called
    with no lock held, one call at a time. Exceptions are treated as failure — a
    publish that raised has published nothing, and the caller's commit must survive it
    regardless (commit-first, ADR 0007).

    `timeout` is how long a WAITER will wait, which must cover about TWO builds: the
    remainder of one already in flight plus a full one of its own. Sizing it to a single
    build makes a writer report "pending" for a note that goes live moments later —
    precisely the baffling response this queue exists to remove.
    """

    def __init__(
        self,
        build: Callable[[], bool],
        timeout: float,
        log: Callable[[str], None] = _NOOP,
    ) -> None:
        self._build = build
        self._timeout = timeout
        self._log = log
        self._cv = threading.Condition()
        # Every counter below is touched ONLY under _cv.
        self._requested = 0          # tickets handed out
        self._published_through = 0  # highest ticket covered by a successful build
        self._settled_through = 0    # highest ticket a build has *concluded* on,
                                     # success or failure — what releases waiters
        self._worker_running = False
        self._builds = 0             # completed build attempts, for tests/diagnostics

    @property
    def worker_running(self) -> bool:
        """Whether a worker is currently draining. Diagnostics, and it lets a test
        wait for the worker to actually EXIT before issuing the next write — without
        that, a test for the restart path usually just finds the previous worker still
        alive and never exercises a restart at all."""
        with self._cv:
            return self._worker_running

    @property
    def requested(self) -> int:
        """Tickets handed out so far. Diagnostics, and it lets a test wait until every
        writer it spawned is actually queued before releasing a build — otherwise
        "these N coalesced" is a race, not an assertion."""
        with self._cv:
            return self._requested

    def publish(self) -> str:
        """Block until a build covering this caller's commit finishes.

        Returns "live" (published) or "pending" (the build failed, or the wait timed
        out). Never raises: the caller has already committed and nothing here may
        unwind that.
        """
        with self._cv:
            self._requested += 1
            ticket = self._requested
            waiters = ticket - self._settled_through
            if not self._start_worker_locked():
                # Nothing is going to publish this ticket right now. "pending" is the
                # honest answer and it UNDER-promises: the ticket stays outstanding, so
                # whichever later request does start a worker covers this note too.
                return "pending"
            deadline = time.monotonic() + self._timeout
            while self._settled_through < ticket:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self._safe_log(f"publish ticket {ticket} timed out after {self._timeout}s")
                    return "pending"
                self._cv.wait(remaining)
            live = self._published_through >= ticket
        if waiters > 1:
            self._safe_log(f"publish ticket {ticket} shared a build with {waiters - 1} other write(s)")
        return "live" if live else "pending"

    def _start_worker_locked(self) -> bool:
        """Ensure a worker is draining; False if none could be started. MUST hold _cv.

        The running flag is owned by the lock rather than inferred from
        Thread.is_alive(), and that is load-bearing: a worker decides to exit while
        holding the lock, so there is no window in which a new request sees a live
        thread that is already on its way out. With is_alive() such a request would
        start no worker and wait for a build nobody was going to run.
        """
        if self._worker_running:
            return True
        self._worker_running = True
        try:
            threading.Thread(target=self._drain, name="publish-queue", daemon=True).start()
        except BaseException:
            # Thread.start() can fail — "can't start new thread" under fd/thread/memory
            # pressure, which a small host running concurrent 8.5s builds can reach. The
            # flag is set by this point, so leaving it set would wedge the queue for
            # good: no later request would start a worker and every write would sit out
            # its full timeout. Clear it, wake anyone waiting, and report the failure
            # rather than raising into a route whose note is already committed.
            self._worker_running = False
            self._cv.notify_all()
            self._safe_log("publish: could not start the publisher thread")
            return False
        return True

    def _safe_log(self, msg: str) -> None:
        """Logging must never be able to break the queue. See _drain."""
        try:
            self._log(msg)
        except Exception:
            pass

    def _drain(self) -> None:
        # The outer guard is the important one. If ANYTHING escapes this loop, the
        # thread dies with _worker_running still True — and then no future request
        # ever starts a worker, because they all see one running. Every writer would
        # wait out its full timeout and report "pending" while the site never
        # republished, until someone restarted the service. So the flag is released on
        # every exit path, not just the tidy one, and waiters are woken to re-check
        # rather than left on a condition nobody will signal again.
        try:
            while True:
                with self._cv:
                    target = self._requested
                    if target <= self._settled_through:
                        # Nothing outstanding. Clearing the flag under the lock is what
                        # makes the handoff to a future request safe.
                        self._worker_running = False
                        return
                    pending = target - self._settled_through
                if pending > 1:
                    self._safe_log(f"publish: coalescing {pending} write(s) into one build")
                ok = False
                try:
                    ok = bool(self._build())
                except Exception as exc:  # a raising build published nothing; say so and continue
                    self._safe_log(f"publish build raised: {exc!r}")
                finally:
                    # In a finally, so a build that raises something not caught above
                    # (a BaseException — KeyboardInterrupt, SystemExit) still settles
                    # its batch instead of stranding those waiters.
                    with self._cv:
                        self._builds += 1
                        if ok:
                            self._published_through = max(self._published_through, target)
                        self._settled_through = max(self._settled_through, target)
                        self._cv.notify_all()
        except BaseException:
            with self._cv:
                self._worker_running = False
                self._cv.notify_all()
            raise
