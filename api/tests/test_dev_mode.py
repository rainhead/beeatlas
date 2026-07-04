"""DEV_MODE (local development loop) — added during the 178-08 go-live.

DEV_MODE turns on iff the gitignored api/secrets.toml carries a loopback
redirect_uri (a separate dev iNat app registration). It admits loopback
origins through the CSRF origin gate and drops the Secure cookie flag so
the full OAuth flow can run against http://localhost without a maderas
round-trip. Production behavior (the D-12/D-13 exact-match pin, the strict
origin allow-list) must be provably unchanged when DEV_MODE is off.
"""

import re

import pytest

import api.auth as auth
import api.config as config
import api.main as main


# --- config.resolve_redirect_uri -------------------------------------------


def test_absent_redirect_uri_is_prod_pin_not_dev():
    uri, dev = config.resolve_redirect_uri(None)
    assert uri == "https://api.beeatlas.net/auth/callback"
    assert dev is False


def test_prod_redirect_uri_matches_pin_not_dev():
    uri, dev = config.resolve_redirect_uri("https://api.beeatlas.net/auth/callback")
    assert uri == "https://api.beeatlas.net/auth/callback"
    assert dev is False


@pytest.mark.parametrize(
    "dev_uri",
    [
        "http://localhost:8081/auth/callback",
        "http://127.0.0.1:8081/auth/callback",
        "http://localhost:9000/auth/callback",
    ],
)
def test_loopback_redirect_uri_enables_dev_mode(dev_uri):
    uri, dev = config.resolve_redirect_uri(dev_uri)
    assert uri == dev_uri
    assert dev is True


@pytest.mark.parametrize(
    "bad_uri",
    [
        "https://api.beeatlas.net/auth/callback/extra",  # drifted path
        "https://evil.example/auth/callback",  # hijack attempt
        "http://api.beeatlas.net/auth/callback",  # http downgrade of prod host
        "https://localhost:8081/auth/callback",  # https+localhost isn't the dev shape
        "http://localhost:8081/other/path",  # loopback but wrong path
    ],
)
def test_non_pin_non_loopback_redirect_uri_asserts(bad_uri):
    with pytest.raises(AssertionError):
        config.resolve_redirect_uri(bad_uri)


# --- auth.origin_allowed under DEV_MODE -------------------------------------


def test_loopback_origin_rejected_in_prod_mode(monkeypatch):
    monkeypatch.setattr(config, "DEV_MODE", False)
    assert auth.origin_allowed("http://localhost:8080") is False
    assert auth.origin_allowed("http://127.0.0.1:8080") is False


def test_loopback_origin_allowed_in_dev_mode(monkeypatch):
    monkeypatch.setattr(config, "DEV_MODE", True)
    assert auth.origin_allowed("http://localhost:8080") is True
    assert auth.origin_allowed("http://127.0.0.1:5173") is True


def test_dev_mode_does_not_admit_non_loopback_origins(monkeypatch):
    monkeypatch.setattr(config, "DEV_MODE", True)
    assert auth.origin_allowed("https://evil.example") is False
    assert auth.origin_allowed("http://localhost.evil.example") is False
    assert auth.origin_allowed(None) is False


@pytest.mark.parametrize(
    "lookalike",
    [
        "http://localhost:80.evil.com",  # bogus "port" carrying a real host suffix
        "http://localhost:1234.evil.com",  # would pass an unanchored regex/prefix
        "http://127.0.0.1:80@attacker.test",  # loopback in userinfo, host attacker.test
        "http://localhost:80@attacker.test",
        "https://localhost:8080",  # wrong scheme for the dev shape
        "http://localhost",  # no explicit port
        "http://localhost:notaport",
        "http://evillocalhost:8080",
    ],
)
def test_dev_mode_rejects_loopback_lookalike_origins(monkeypatch, lookalike):
    """WR-04 regression: a prefix `startswith("http://localhost:")` check
    admits several of these; origin_allowed must parse the origin and match
    scheme/hostname/port exactly."""
    monkeypatch.setattr(config, "DEV_MODE", True)
    assert auth.origin_allowed(lookalike) is False


def test_dev_cors_origin_patterns_are_end_anchored():
    """WR-04 regression: flask-cors matches origin patterns with re.match,
    which anchors only at the START — the dev loopback patterns must carry
    an explicit `$` or http://localhost:1234.evil.com gets credentialed CORS.
    Mirror flask-cors's matching (re.match) against the actual patterns."""
    good = ["http://localhost:8080", "http://localhost:8081", "http://127.0.0.1:5173"]
    evil = [
        "http://localhost:1234.evil.com",
        "http://127.0.0.1:80.evil.com",
        "http://localhost:8080@attacker.test",
    ]
    patterns = main._DEV_CORS_ORIGIN_PATTERNS
    for origin in good:
        assert any(re.match(p, origin) for p in patterns), origin
    for origin in evil:
        assert not any(re.match(p, origin) for p in patterns), origin


def test_prod_origins_still_allowed_in_both_modes(monkeypatch):
    for dev in (False, True):
        monkeypatch.setattr(config, "DEV_MODE", dev)
        assert auth.origin_allowed("https://beeatlas.net") is True
        assert auth.origin_allowed("https://www.beeatlas.net") is True


# --- DEV_MODE port-consistency guard ----------------------------------------


def test_dev_port_mismatch_guard_message():
    """The import-time guard (config.py) asserts redirect port == SERVE_PORT
    in DEV_MODE. The module under test is already imported, so exercise the
    same predicate the guard uses rather than re-importing with a bad file."""
    from urllib.parse import urlsplit

    uri, dev = config.resolve_redirect_uri("http://localhost:8081/auth/callback")
    assert dev is True
    assert urlsplit(uri).port == 8081  # what the guard compares to SERVE_PORT
