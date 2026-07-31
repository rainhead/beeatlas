# ADR 0018: Concurrent note writes share a build instead of queueing one each

**Status:** Accepted (implemented 2026-07-31; issue beeatlas-3nz, epic beeatlas-0gx)

---

## Context

A note write commits and then republishes the site before responding — [ADR
0007](0007-pipeline-runs-as-maderas-cron.md)'s synchronous burned-in publish, chosen with eyes
open. One author never notices. N authors did:

Each write ran **its own** build behind the shared publish flock, so the k-th
concurrent writer waited k build-times. Past `PUBLISH_LOCK_WAIT` (60s) it got exit 75
and the response `"publish": "pending"` — truthful (the note is committed, the nightly
will bake it) and impossible to explain to someone who just pressed Save. Throughput
was roughly two writes a minute. [ADR 0017](0017-scoped-note-render.md) cut the build
from ~23s to ~8.5s, which lowers the constant and changes nothing structural: a
shorter critical section is still a serial one.

## Decision

**Concurrent writers share a build.** `api/publish_queue.py` owns one publisher for the
process; a write joins whatever build will cover it rather than starting its own.

What makes sharing sound is a property ADR 0017 established for a different reason:
`publish-notes.sh` derives which species to render from the *committed store* (stelis
`--moved-keys` over the notes-store digest), not from the write that triggered it. So a
build does not belong to a writer — **any build that starts after my commit necessarily
includes my note.** "Did my note get published?" stops being a question about key sets
and becomes a question about ordering, which a counter answers:

```
ticket = ++requested            # taken AFTER the caller's commit is durable
a build captures target = requested at its start
  ⇒ on success it has published everything with ticket ≤ target
```

A writer blocks until `published_through ≥ its ticket`. Writes arriving mid-build take
tickets above that build's target, so one further build covers all of them.

**The worst-case wait is now O(1) builds, not O(N).** A writer waits for the remainder
of the in-flight build plus at most one more — about 17s at today's 8.5s build,
*regardless* of how many others arrive alongside it. Four concurrent writers cost two
builds, not four; forty cost two as well.

**The POST still blocks.** beeatlas-3nz asked whether it must. Coalescing removes the
reason to revisit: concurrent writers now all get `"live"` within a bounded wait instead
of degrading one-by-one into `"pending"`. Returning early is a larger change — the
client would have to represent not-yet-baked state — and it is no longer forced by this
failure mode.

Single-process by design: waitress serves the app with threads in **one** process (one
systemd unit), so a lock and a counter coordinate every writer. The flock inside
`publish-notes.sh` remains the *cross*-process guard, against the nightly.

## Consequences

**The running flag is owned by the lock, not inferred from the thread.** The worker
exits when idle, and a later write starts a new one. Deciding that with
`Thread.is_alive()` leaves a window where a request sees a thread that is already
returning, starts no replacement, and waits for a build nobody runs — a hang rather than
a wrong answer. So the worker clears the flag *while holding the lock*, which is also
why a request that arrives at that moment either bumps the counter first (and the worker
keeps going) or finds the flag clear (and starts one).

**A failed build reports `pending` to everyone it covered.** Nothing was published, so
nobody is live. A later write gets a fresh attempt rather than inheriting the verdict.
Commit-first is unchanged: a build that raises degrades to `pending`, never propagating
into a response for a note that is already durable.

**`_run_publish_script()` no longer takes a `canonical_name`.** It used to log one. With
sharing, attributing a build to a single name would be a lie in exactly the case that
matters — several authors in one build — so the routes log the names on the way in and
the build logs its own outcome.

**Concurrency is asserted, not reasoned about.** `api/tests/test_publish_queue.py`
drives the interleavings with an Event: four writers arriving mid-build produce exactly
two builds and four `"live"` results, builds never overlap, failure and timeout both
report `pending`, and the worker restarts after draining. The coalescing test waits
until every writer holds a ticket before releasing the build — without that it would
race the very property it asserts and fail intermittently.

**What this does not do.** It does not make builds concurrent — they share `_site` and a
flock, and must stay serial. It does not help a write that arrives while the *nightly*
holds the flock; that still ends in `pending`, though now the whole waiting group learns
it together rather than each burning its own 60s. And it is bounded by one process: if
the API is ever run as multiple workers, the coordination has to move to something they
share (the flock already is such a thing).
