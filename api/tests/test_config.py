"""Tests for api/config.py require_real_secrets() — the loud fail-fast gate
the secret-consuming routes (/auth/login, /auth/callback) call before doing
anything that needs a real credential.

Module globals are monkeypatched (the function reads them at call time), so
these tests are hermetic to whatever the developer's gitignored
api/secrets.toml carries — never assert on the import-time snapshot values.
"""

import pytest

import api.config as config


@pytest.fixture(autouse=True)
def _real_looking_secrets(monkeypatch):
    """Baseline: everything filled in; individual tests break one value."""
    monkeypatch.setattr(config, "INAT_CLIENT_ID", "real-client-id")
    monkeypatch.setattr(config, "INAT_CLIENT_SECRET", "real-client-secret")
    monkeypatch.setattr(config, "SESSION_SIGNING_KEY", "real-signing-key")


def test_passes_when_all_values_are_real():
    config.require_real_secrets()  # must not raise


def test_raises_on_placeholder_client_secret(monkeypatch):
    monkeypatch.setattr(config, "INAT_CLIENT_SECRET", "REPLACE_ME")
    with pytest.raises(RuntimeError, match="INAT_CLIENT_SECRET"):
        config.require_real_secrets()


def test_raises_on_placeholder_signing_key(monkeypatch):
    monkeypatch.setattr(config, "SESSION_SIGNING_KEY", "REPLACE_ME")
    with pytest.raises(RuntimeError, match="SESSION_SIGNING_KEY"):
        config.require_real_secrets()


def test_raises_on_empty_client_id(monkeypatch):
    """WR-05: INAT_CLIENT_ID defaults to "" (not REPLACE_ME) when
    secrets.toml is absent or the key unset. A deploy that filled the secret
    and signing key but omitted client_id must fail loudly server-side, not
    opaquely at iNat with `client_id=` empty."""
    monkeypatch.setattr(config, "INAT_CLIENT_ID", "")
    with pytest.raises(RuntimeError, match="client_id"):
        config.require_real_secrets()


def test_raises_on_placeholder_client_id(monkeypatch):
    monkeypatch.setattr(config, "INAT_CLIENT_ID", "REPLACE_ME")
    with pytest.raises(RuntimeError, match="client_id"):
        config.require_real_secrets()
