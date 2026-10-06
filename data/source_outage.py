"""Keep the last good copy when an upstream source is down (beeatlas-fjzg).

An iNaturalist outage used to fail its loader task, and Stelis skips everything
downstream of a failed task — dbt-build included — so one upstream outage held back
that night's Ecdysis and checklist changes too. Decided 2026-10-06: on an outage,
publish with the previous night's iNaturalist data instead.

What makes "the previous night's data" true rather than hoped for: every HTTP request
a dlt loader makes happens in dlt's EXTRACT step, and a failed extract writes nothing
to the destination — no rows, no incremental cursor, no load record, no pending
package for the next run to replay. So a loader that catches the outage leaves its
tables exactly as the last good run left them, and the next good run fetches from the
old cursor and picks up what the outage hid.

The loader then tells Stelis so through the boundary-receipt contract (stelis
st-ml9.9): `{"unreachable": true, "error": ...}` at STELIS_BOUNDARY_RECEIPT, so the
build log reads "source unreachable" rather than a quiet day. A transform (which is
never handed a receipt path) just says so on its log.

Only an OUTAGE degrades: no connection, a timeout, or a 429/5xx that survived the
caller's retries. A 4xx or a malformed response is a bug in us, and still fails.
"""
import json
import os
import re
from pathlib import Path
from typing import Callable, TypeVar

import requests

T = TypeVar("T")

_MAX_ERROR_CHARS = 300

# urllib3 puts the whole request URL in its message; the query string is noise in a
# build log (iNat's field list alone runs to 600 characters).
_QUERY = re.compile(r"\?[^\s)'\"]*")

# No connection, a timeout, or a connection dropped mid-body (ChunkedEncodingError is
# not a ConnectionError subclass).
_UNREACHABLE = (
    requests.ConnectionError,
    requests.Timeout,
    requests.exceptions.ChunkedEncodingError,
)


def outage_cause(exc: BaseException) -> BaseException | None:
    """The exception in `exc`'s chain that says the source was unreachable, or None.

    dlt wraps a resource's exception twice (PipelineStepFailed -> ResourceExtraction-
    Error -> the requests error), so the chain is walked: `.exception` where dlt keeps
    the step's error, else `__cause__`/`__context__`.
    """
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if isinstance(cur, _UNREACHABLE):
            return cur
        if isinstance(cur, requests.HTTPError):
            status = cur.response.status_code if cur.response is not None else None
            return cur if status is not None and (status == 429 or status >= 500) else None
        nxt = getattr(cur, "exception", None)
        cur = nxt if isinstance(nxt, BaseException) else (cur.__cause__ or cur.__context__)
    return None


def write_unreachable_receipt(error: str) -> None:
    """Hand Stelis the `unreachable` arm of the boundary-receipt contract.

    Silent outside Stelis (no env var). Advisory: a write failure must never turn the
    kept copy back into a failed task.
    """
    path = os.environ.get("STELIS_BOUNDARY_RECEIPT")
    if not path:
        return
    try:
        Path(path).write_text(json.dumps({"unreachable": True, "error": error}))
    except Exception as e:  # noqa: BLE001 — telemetry; never break the run
        print(f"  WARNING: could not write Stelis boundary receipt ({e})")  # noqa: T201


def run_or_keep_last(label: str, run: Callable[[], T], *, receipt: bool = True) -> T | None:
    """Call `run`; if it fails because the source is down, keep what we hold.

    Returns run's result, or None when the source was unreachable and nothing was
    written. Any other failure propagates. `receipt=False` for a transform, which
    has no receipt path to write.
    """
    try:
        return run()
    except Exception as e:
        cause = outage_cause(e)
        if cause is None:
            raise
        error = _QUERY.sub("", f"{type(cause).__name__}: {cause}")[:_MAX_ERROR_CHARS]
        print(  # noqa: T201
            f"{label}: source unreachable ({error}); keeping the last good copy"
        )
        if receipt:
            write_unreachable_receipt(error)
        return None
