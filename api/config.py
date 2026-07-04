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
# This is the authoritative value regardless of what secrets.toml carries;
# we assert the toml agrees rather than trusting the file's copy.
REDIRECT_URI: str = "https://api.beeatlas.net/auth/callback"

_toml_redirect_uri = _OAUTH.get("redirect_uri")
if _toml_redirect_uri is not None:
    assert _toml_redirect_uri == REDIRECT_URI, (
        f"api/secrets.toml redirect_uri {_toml_redirect_uri!r} does not match "
        f"the pinned constant {REDIRECT_URI!r} (D-12/D-13 exact-match requirement)"
    )


def require_real_secrets() -> None:
    """Raise loudly if any secret still carries a REPLACE_ME placeholder.

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
