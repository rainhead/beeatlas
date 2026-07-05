"""Write authorization gate: session verification, allowlist recheck, Origin
CSRF gate, and the WRITE-04 launch gate (D-05/D-07/D-09).

`require_session` verifies the app session cookie (api/session.py) and
exposes the server-derived identity on `flask.g.identity`.

`require_author` wraps `require_session` and additionally:
  1. Re-reads the committed allowlist TOML from disk on every call (D-05
     revocation) -- never trusts the role baked into the cookie payload.
  2. Rejects any state-changing request whose Origin header is not in the
     configured allow-list (the authoritative server-side CSRF gate;
     SameSite=Strict on the cookie is defense-in-depth, not the sole
     protection -- RESEARCH.md Pattern 3).
  3. Refuses writes with 503 unless the WRITE-04 launch gate
     (`api.config.WRITES_ENABLED`) is on.

Author identity is always derived from `flask.g.identity` (the verified
session), never from request body/query data -- a client-supplied
`author_id` is simply never consulted (D-07, T-178-09).
"""

import tomllib
from functools import wraps
from urllib.parse import urlsplit

from flask import abort, g, request

import api.config as config
import api.session as session
from notes_store import roles as roles_module

# Server-side Origin allow-list -- the authoritative CSRF gate (Pattern 3).
# beeatlas.net and api.beeatlas.net share a registrable domain (same-site)
# but are different origins, so this check is required independent of the
# cookie's SameSite policy.
ALLOWED_ORIGINS = {"https://beeatlas.net", "https://www.beeatlas.net"}

# Verbs for which a missing/foreign Origin header is treated as a forged
# cross-site write attempt (RESEARCH.md Pattern 3 -- "state-changing verb").
_STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _is_loopback_origin(origin: str) -> bool:
    """Strictly parse a local-dev-server origin (the Eleventy/Vite dev loop):
    plain http, hostname exactly localhost/127.0.0.1, explicit numeric port.

    Parsed with urlsplit rather than a string prefix check (WR-04): a raw
    `startswith("http://localhost:")` also admits lookalikes such as
    `http://localhost:80.evil.com` (bogus port) and
    `http://127.0.0.1:80@attacker.test` (loopback in the userinfo, real host
    attacker.test). Any loopback PORT is fine: the dev-server port is not
    security-relevant on a laptop setup.
    """
    try:
        parts = urlsplit(origin)
        port = parts.port  # raises ValueError on a non-numeric port
    except ValueError:
        return False
    return (
        parts.scheme == "http"
        and parts.hostname in ("localhost", "127.0.0.1")
        and port is not None
    )


def origin_allowed(origin: str | None) -> bool:
    """Return True if *origin* is one of the configured allowed origins
    (exact match), or a strictly-parsed loopback origin when DEV_MODE is on
    (i.e. the gitignored secrets.toml carries a localhost redirect_uri for a
    separate dev iNat app — see api/config.py; DEV_MODE cannot be on in
    production without breaking the prod OAuth app)."""
    if origin in ALLOWED_ORIGINS:
        return True
    return config.DEV_MODE and origin is not None and _is_loopback_origin(origin)


def _current_roles() -> dict[str, str]:
    """Re-parse the committed allowlist TOML from disk (D-05 revocation).

    Reads `roles_module._ALLOWLIST` fresh on every call (not the
    module-level `roles.ROLES` cached at import time) so an operator's
    allowlist edit takes effect on the very next request, without an app
    restart.
    """
    with roles_module._ALLOWLIST.open("rb") as fh:
        cfg = tomllib.load(fh)
    return cfg.get("roles", {})


def _is_author_fresh(login: str) -> bool:
    return _current_roles().get(login) in ("author", "curator")


def _is_curator_fresh(login: str) -> bool:
    """Curator-only fresh recheck (D-04/D-05) — mirrors `_is_author_fresh`
    exactly but with a strict `== "curator"` equality, not the "author OR
    curator" union that `_is_author_fresh` uses. Never reuse
    `notes_store.roles.is_curator()`: it reads the import-time-cached
    `ROLES` dict, so a demoted curator would keep curator power until the
    Waitress worker restarts (RESEARCH.md Pitfall 1)."""
    return _current_roles().get(login) == "curator"


def require_session(view):
    """Reject (401) any request without a valid, unexpired session cookie.

    On success, exposes the server-derived identity {uid, login, role} as
    `flask.g.identity` for the wrapped view (and for `require_author`).
    """

    @wraps(view)
    def wrapper(*args, **kwargs):
        token = request.cookies.get(session.COOKIE_NAME)
        if not token:
            abort(401)

        serializer = session.make_serializer(config.SESSION_SIGNING_KEY)
        payload = session.verify_cookie(serializer, token, session.COOKIE_MAX_AGE)
        if payload is None:
            abort(401)

        g.identity = payload
        return view(*args, **kwargs)

    return wrapper


def require_author(view):
    """Guard a write endpoint: session + allowlist recheck + Origin + launch gate.

    Author identity for the wrapped view must come from `flask.g.identity`
    (set by `require_session`) -- never from request body/query data.
    """

    @wraps(view)
    def author_view(*args, **kwargs):
        login = g.identity["login"]

        if not _is_author_fresh(login):
            abort(403)

        if request.method in _STATE_CHANGING_METHODS:
            if not origin_allowed(request.headers.get("Origin")):
                abort(403)

        if not config.WRITES_ENABLED:
            abort(503)

        return view(*args, **kwargs)

    return require_session(author_view)
