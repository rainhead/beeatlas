"""Secrets loader for BeeAtlas's auth + write API (D-14).

Reads the gitignored `api/secrets.toml` (client_id/secret, redirect_uri,
session signing key) via tomllib, mirroring the `data/config.py` +
`data/notes_store/roles.py` load-from-file conventions. Never committed,
never shipped in the client bundle.

Loaded defensively at import time: if `api/secrets.toml` is absent (CI, a
fresh checkout that hasn't run the operator seeding step, or the frontend
build), placeholder values are exposed instead of crashing at import — so
tests and the static build never need real secrets. Call
`require_real_secrets()` from request/route code (later 178 plans) to fail
loudly before any route that actually needs a real secret.
"""

import os
import tomllib
from pathlib import Path

_SECRETS_PATH = Path(__file__).parent / "secrets.toml"

_PLACEHOLDER = "REPLACE_ME"

if _SECRETS_PATH.exists():
    with _SECRETS_PATH.open("rb") as _fh:
        _CFG = tomllib.load(_fh)
else:
    _CFG = {}

_OAUTH = _CFG.get("inaturalist_oauth", {})
_SESSION = _CFG.get("session", {})

INAT_CLIENT_ID: str = _OAUTH.get("client_id", "")
INAT_CLIENT_SECRET: str = _OAUTH.get("client_secret", _PLACEHOLDER)
SESSION_SIGNING_KEY: str = _SESSION.get("signing_key", _PLACEHOLDER)

# Exact-match pin (D-12/D-13) — the iNat app's registered redirect URI.
# This is the authoritative production value regardless of what secrets.toml
# carries; we assert the toml agrees rather than trusting the file's copy.
#
# DEV MODE exception: a localhost/127.0.0.1 redirect_uri in the (gitignored)
# secrets.toml switches the app into local-development mode — a separate dev
# iNat app registration whose redirect points at the local api/serve.py
# process. This can never fire in production without the operator rewriting
# maderas's secrets.toml to a URI that iNat's prod app would refuse anyway.
_PROD_REDIRECT_URI = "https://api.beeatlas.net/auth/callback"
_DEV_REDIRECT_PREFIXES = ("http://localhost:", "http://127.0.0.1:")


def resolve_redirect_uri(toml_value: str | None) -> tuple[str, bool]:
    """Return ``(redirect_uri, dev_mode)`` for a secrets.toml redirect value.

    - absent → the production pin, dev_mode False
    - a localhost/127.0.0.1 ``/auth/callback`` URI → that URI, dev_mode True
    - anything else MUST equal the production pin exactly (D-12/D-13),
      otherwise AssertionError at import.
    """
    if toml_value is None:
        return _PROD_REDIRECT_URI, False
    if toml_value.startswith(_DEV_REDIRECT_PREFIXES) and toml_value.endswith(
        "/auth/callback"
    ):
        return toml_value, True
    assert toml_value == _PROD_REDIRECT_URI, (
        f"api/secrets.toml redirect_uri {toml_value!r} does not match "
        f"the pinned constant {_PROD_REDIRECT_URI!r} (D-12/D-13 exact-match "
        "requirement; only localhost dev URIs are exempt)"
    )
    return _PROD_REDIRECT_URI, False


REDIRECT_URI, DEV_MODE = resolve_redirect_uri(_OAUTH.get("redirect_uri"))


_LAUNCH = _CFG.get("launch", {})
_SERVE = _CFG.get("serve", {})

# WRITE-04 launch gate: writes are refused (503) until the operator confirms
# the 177-07 restore drill and flips this on. Default False (writes closed)
# so a fresh checkout or CI never accidentally serves writes. Primary source
# is the `[launch] writes_enabled` key in api/secrets.toml (a non-secret
# operational switch, documented in api/secrets.example.toml); the
# WRITES_ENABLED env var — added in 178-05 as a Rule-3 blocking fix, before
# this toml key existed — always overrides the toml value when set, so an
# operator can flip the gate (e.g. from the systemd unit / cron entry) without
# touching the secrets file. See 178-06/178-08 for where the operator sets
# this true on maderas after confirming the restore.
_env_writes_enabled = os.environ.get("WRITES_ENABLED")
WRITES_ENABLED: bool
if _env_writes_enabled is not None:
    WRITES_ENABLED = _env_writes_enabled.lower() == "true"
else:
    WRITES_ENABLED = bool(_LAUNCH.get("writes_enabled", False))

# st-nee publish gate (stelis ADR 0007): after a note write commits, the API
# synchronously republishes the site (data/publish-notes.sh). Default False so
# tests, CI, and dev checkouts never shell out to a build; the operator flips
# it on (systemd unit env, or `[launch] note_publish_enabled` in secrets.toml)
# once the maderas htdocs+var layout exists (Model Y step C). While off,
# writes still succeed and respond "publish": "pending" — the nightly bakes
# them. Same precedence pattern as WRITES_ENABLED: env override > toml >
# default-off.
_env_note_publish = os.environ.get("NOTE_PUBLISH_ENABLED")
NOTE_PUBLISH_ENABLED: bool
if _env_note_publish is not None:
    NOTE_PUBLISH_ENABLED = _env_note_publish.lower() == "true"
else:
    NOTE_PUBLISH_ENABLED = bool(_LAUNCH.get("note_publish_enabled", False))

# Loopback port Waitress binds (api/serve.py); Apache mod_proxy_http reverse-
# proxies https://api.beeatlas.net -> 127.0.0.1:<port> (D-17). Sourced from
# the `[serve] port` key in api/secrets.toml, default 8080 if absent; a
# SERVE_PORT env var override takes precedence, mirroring WRITES_ENABLED.
def resolve_serve_port(env_value: str | None, toml_value: int | None) -> int:
    """SERVE_PORT precedence: env var > `[serve] port` toml key > 8080."""
    if env_value is not None:
        return int(env_value)
    if toml_value is not None:
        return int(toml_value)
    return 8080


SERVE_PORT: int = resolve_serve_port(
    os.environ.get("SERVE_PORT"), _SERVE.get("port")
)

# DEV_MODE consistency guard: the loopback redirect URI must point at the
# port this process actually binds, or the OAuth callback lands on nothing
# (or shadows the Eleventy dev server on 8080 — found live during dev-loop
# setup). Fail at import with an actionable message rather than a dead
# callback at sign-in time.
if DEV_MODE:
    from urllib.parse import urlsplit as _urlsplit

    _redirect_port = _urlsplit(REDIRECT_URI).port
    assert _redirect_port == SERVE_PORT, (
        f"DEV_MODE port mismatch: redirect_uri points at port {_redirect_port} "
        f"but the server binds SERVE_PORT={SERVE_PORT}. Align them — set "
        '`[serve] port` in api/secrets.toml to the redirect port (8081 per '
        "api/README.md; 8080 is the Eleventy dev server)."
    )


def require_real_secrets() -> None:
    """Raise loudly if any secret is still a placeholder or missing.

    Call this from request/route code (later 178 plans), NOT at import
    time — tests and the static-site build must never need real secrets.
    """
    placeholders = {
        name: value
        for name, value in (
            ("INAT_CLIENT_SECRET", INAT_CLIENT_SECRET),
            ("SESSION_SIGNING_KEY", SESSION_SIGNING_KEY),
        )
        if _PLACEHOLDER in value
    }
    if placeholders:
        raise RuntimeError(
            "api/secrets.toml has unfilled REPLACE_ME placeholder(s) for: "
            f"{', '.join(sorted(placeholders))}. The operator must fill in "
            "real values before the write layer can serve authenticated "
            "requests."
        )
    # INAT_CLIENT_ID defaults to "" (not the REPLACE_ME sentinel) when
    # secrets.toml is absent or the key unset — a deployment that filled the
    # secret + signing key but omitted the client_id would otherwise pass
    # this gate and send `client_id=` (empty) to iNat, failing opaquely on
    # their side instead of loudly here.
    if not INAT_CLIENT_ID or _PLACEHOLDER in INAT_CLIENT_ID:
        raise RuntimeError(
            "api/secrets.toml is missing inaturalist_oauth.client_id (empty "
            "or placeholder). The operator must fill in the real iNat app "
            "client_id before the write layer can serve authenticated "
            "requests."
        )
