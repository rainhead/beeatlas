"""DEV_MODE (local development loop) — added during the 178-08 go-live.

DEV_MODE turns on iff the gitignored api/secrets.toml carries a loopback
redirect_uri (a separate dev iNat app registration). It admits loopback
origins through the CSRF origin gate and drops the Secure cookie flag so
the full OAuth flow can run against http://localhost without a maderas
round-trip. Production behavior (the D-12/D-13 exact-match pin, the strict
origin allow-list) must be provably unchanged when DEV_MODE is off.
"""

import pytest

import api.auth as auth
import api.config as config


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


def test_prod_origins_still_allowed_in_both_modes(monkeypatch):
    for dev in (False, True):
        monkeypatch.setattr(config, "DEV_MODE", dev)
        assert auth.origin_allowed("https://beeatlas.net") is True
        assert auth.origin_allowed("https://www.beeatlas.net") is True
