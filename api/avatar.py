"""Inline the iNaturalist avatar so identity survives going offline.

WHY THE SERVER DOES THIS. The avatar was the one part of the identity that was
not local. Everything else whoami returns is persisted to
`localStorage['beeatlas.auth.lastKnown']` and replayed on an offline cold start
(ADR 0027); the avatar was an `<img>` against `static.inaturalist.org`, so
offline it was a doomed cross-origin request — and on iOS, inside an installed
app, a failed request raises the system "Turn On Wi-Fi to Use the Internet"
modal over a map that is working perfectly. `bee-header.ts` therefore hid the
avatar behind `verified === true`, which is exactly the case that never holds
offline.

The browser cannot fix this by itself: `static.inaturalist.org` sends no
`Access-Control-Allow-Origin` (its OPTIONS preflight 403s), so a page-side
`fetch` gets an OPAQUE response whose bytes it cannot read. Caching that opaque
response in the service worker was the alternative, and it is the thing ADR 0029
had just finished rejecting for the read path: unreadable status, a 404 caching
as a success, and megabytes of quota padding charged against a device already
carrying a 288 MB basemap.

So the fetch happens HERE, where there is no origin to be cross, and the bytes
ride back inside whoami as a `data:` URL. Offline the avatar then costs zero
requests, and it lands in the same identity blob as the login and the role —
one mechanism, not two.

THE COSTS, since they are real:
  · whoami's response grows by roughly the size of the image (base64 is +33%).
    Bounded by MAX_BYTES; a normal iNat thumbnail is ~6 KB.
  · the first whoami for a given avatar pays an outbound fetch. Hence the cache
    below, and a deliberately short timeout: a slow iNat must not make signing
    in feel broken, and this is decoration — every failure path returns None and
    whoami answers exactly as it did before.
"""

from __future__ import annotations

import base64
import logging
import threading
import time
from urllib.parse import urlsplit

import requests

_log = logging.getLogger("api.avatar")

# Hosts we will fetch an avatar from. The URL arrives from iNat's API and is
# then carried in OUR signed session cookie, so it is not attacker-controlled in
# any ordinary sense — but this function makes the SERVER fetch a URL that came
# over the wire, and that is the shape of an SSRF whether or not today's source
# is trustworthy. An allowlist costs one comparison.
ALLOWED_HOSTS = frozenset({
    "static.inaturalist.org",
    "inaturalist-open-data.s3.amazonaws.com",
})

# Generous next to a ~6 KB thumbnail and small next to a JSON response anyone
# would tolerate. Enforced by streaming rather than by trusting Content-Length,
# which a server is free to lie about or omit.
MAX_BYTES = 256 * 1024

# (connect, read). Shorter than api/oauth.py's REQUEST_TIMEOUT deliberately:
# that one guards an OAuth exchange the user is waiting on and cannot proceed
# without, while this one guards a picture. whoami is called on every page load,
# so the ceiling on how slow this can make the app matters more than the
# likelihood of getting the image.
REQUEST_TIMEOUT: tuple[int, int] = (2, 3)

# How long a fetched avatar is reused. iNat's URLs carry a cache-busting query
# param that changes when the user changes their picture, so the KEY changes on
# its own and this TTL is only about re-checking a URL that has not — an hour is
# far more responsive than anyone needs a profile picture to be.
TTL_SECONDS = 3600

# Bounds the cache. Waitress runs ONE process with a thread pool, so a plain
# dict under a lock is the whole of the concurrency story here; there is no
# cross-process coherence problem to have. The eviction is oldest-first and
# approximate — this is a decoration cache, not a store.
MAX_ENTRIES = 64

_cache: dict[str, tuple[float, str | None]] = {}
_lock = threading.Lock()


def _cached(url: str) -> tuple[bool, str | None]:
    """(hit, value). A cached None is a HIT — see _fetch's note on negatives."""
    with _lock:
        entry = _cache.get(url)
        if entry is None:
            return False, None
        stored_at, value = entry
        if time.monotonic() - stored_at > TTL_SECONDS:
            del _cache[url]
            return False, None
        return True, value


def _store(url: str, value: str | None) -> None:
    with _lock:
        if len(_cache) >= MAX_ENTRIES:
            oldest = min(_cache, key=lambda k: _cache[k][0])
            del _cache[oldest]
        _cache[url] = (time.monotonic(), value)


def _fetch(url: str) -> str | None:
    """Fetch *url* and return it as a `data:` URL, or None if anything is off.

    Every failure is a None rather than an exception: the caller is whoami, and
    a missing picture must never turn signing in into a 500.
    """
    try:
        with requests.get(url, timeout=REQUEST_TIMEOUT, stream=True) as resp:
            if not resp.ok:
                _log.info("avatar %s -> %s", url, resp.status_code)
                return None
            content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if not content_type.startswith("image/"):
                _log.info("avatar %s -> non-image %r", url, content_type)
                return None
            # Read one byte past the cap so a file AT the cap is kept and one
            # over it is rejected, without ever holding more than the cap + 1.
            body = resp.raw.read(MAX_BYTES + 1, decode_content=True)
            if len(body) > MAX_BYTES:
                _log.info("avatar %s -> larger than %d bytes", url, MAX_BYTES)
                return None
            if not body:
                return None
    except requests.RequestException as err:
        _log.info("avatar %s -> %s", url, err)
        return None
    return f"data:{content_type};base64,{base64.b64encode(body).decode('ascii')}"


def data_url(icon_url: str | None) -> str | None:
    """The avatar at *icon_url* as a `data:` URL, or None.

    None on every unhappy path — no icon, a host we do not fetch from, a
    non-image, an oversized body, a timeout. The caller keeps returning
    `icon_url` alongside this, so a None costs the offline avatar and nothing
    else: an online client still renders the remote image exactly as before.
    """
    if not icon_url:
        return None

    parts = urlsplit(icon_url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        _log.info("avatar refused: %s", icon_url)
        return None

    hit, value = _cached(icon_url)
    if hit:
        return value

    value = _fetch(icon_url)
    # Negatives are cached too, and on purpose. A user whose avatar 404s would
    # otherwise make every whoami — one per page load — pay an outbound request
    # that is known to fail, which is precisely the per-request cost this cache
    # exists to remove. TTL_SECONDS bounds how long a fixed avatar stays missing.
    _store(icon_url, value)
    return value
