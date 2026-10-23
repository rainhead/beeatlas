"""The API's configuration on Fly (beeatlas-cjyz): secrets from the environment, and
a staging deployment on its own https://<app>.fly.dev host.

The production pin and the dev exception are tested in test_dev_mode.py; these tests
cover what was added beside them, and that the pin still refuses everything else.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

import api.config as config

REPO = Path(__file__).resolve().parents[2]


# --- the staging redirect class ------------------------------------------------


def test_staging_redirect_uri_is_accepted_and_not_dev_mode():
    uri, dev = config.resolve_redirect_uri("https://beeatlas-staging.fly.dev/api/auth/callback")
    assert uri == "https://beeatlas-staging.fly.dev/api/auth/callback"
    assert dev is False  # real TLS: cookies stay Secure, loopback stays refused


def test_staging_origin_is_the_site_host():
    assert config.staging_origin("https://beeatlas-staging.fly.dev/api/auth/callback") == (
        "https://beeatlas-staging.fly.dev"
    )


@pytest.mark.parametrize(
    "lookalike",
    [
        "http://beeatlas-staging.fly.dev/api/auth/callback",  # no TLS
        "https://a.b.fly.dev/api/auth/callback",  # nested label
        "https://beeatlas-staging.fly.dev.evil.example/api/auth/callback",  # suffix
        "https://evil.example/x.fly.dev/api/auth/callback",  # fly.dev in the path
        "https://beeatlas-staging.fly.dev/auth/callback",  # missing the /api prefix
        "https://beeatlas-staging.fly.dev/api/auth/callback/extra",  # drifted path
        "https://-staging.fly.dev/api/auth/callback",  # not a DNS label
        "https://user@beeatlas-staging.fly.dev/api/auth/callback",  # userinfo
    ],
)
def test_staging_lookalikes_are_refused(lookalike):
    assert config.staging_origin(lookalike) is None
    with pytest.raises(AssertionError):
        config.resolve_redirect_uri(lookalike)


def test_the_production_pin_is_not_a_staging_origin():
    assert config.staging_origin("https://api.beeatlas.net/auth/callback") is None


# --- secrets from the environment ------------------------------------------------


def test_an_environment_secret_wins_over_the_toml(monkeypatch):
    monkeypatch.setenv("INAT_CLIENT_SECRET", "from-env")
    assert config._secret("INAT_CLIENT_SECRET", "from-toml") == "from-env"


def test_an_absent_or_empty_environment_secret_keeps_the_toml(monkeypatch):
    monkeypatch.delenv("INAT_CLIENT_SECRET", raising=False)
    assert config._secret("INAT_CLIENT_SECRET", "from-toml") == "from-toml"
    monkeypatch.setenv("INAT_CLIENT_SECRET", "")
    assert config._secret("INAT_CLIENT_SECRET", "from-toml") == "from-toml"


def test_surrounding_whitespace_is_stripped(monkeypatch):
    """A pasted value with a stray space (INAT_CLIENT_ID did, 2026-10-23)."""
    monkeypatch.setenv("INAT_CLIENT_ID", " abc-123\n")
    assert config._secret("INAT_CLIENT_ID", "") == "abc-123"
    monkeypatch.setenv("INAT_CLIENT_ID", "   ")
    assert config._secret("INAT_CLIENT_ID", " from-toml ") == "from-toml"


# --- end to end, at import, as the Machine starts it ---------------------------------
# config and auth fix their values at import, so these run a fresh interpreter with
# the environment a Machine would have.

_PROBE = """
import api.auth as auth, api.config as config
print(config.REDIRECT_URI)
print(config.STAGING_ORIGIN)
print(config.DEV_MODE)
print(config.INAT_CLIENT_ID)
print(sorted(auth.ALLOWED_ORIGINS))
print(auth.origin_allowed("https://beeatlas-staging.fly.dev"))
"""


def _import_with(env: dict[str, str]) -> list[str]:
    clean = {k: v for k, v in os.environ.items()
             if k not in ("INAT_REDIRECT_URI", "INAT_CLIENT_ID", "INAT_CLIENT_SECRET",
                          "SESSION_SIGNING_KEY")}
    p = subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=REPO, env={**clean, **env, "PYTHONPATH": f"{REPO}:{REPO / 'data'}"},
        capture_output=True, text=True, check=True,
    )
    return p.stdout.splitlines()


def test_a_staging_machine_admits_its_own_origin():
    out = _import_with({
        "INAT_REDIRECT_URI": "https://beeatlas-staging.fly.dev/api/auth/callback",
        "INAT_CLIENT_ID": "staging-client",
    })
    assert out[0] == "https://beeatlas-staging.fly.dev/api/auth/callback"
    assert out[1] == "https://beeatlas-staging.fly.dev"
    assert out[2] == "False"
    assert out[3] == "staging-client"
    assert "https://beeatlas-staging.fly.dev" in out[4]
    assert out[5] == "True"


def test_a_production_machine_admits_no_staging_origin():
    out = _import_with({"INAT_REDIRECT_URI": "https://api.beeatlas.net/auth/callback"})
    assert out[1] == "None"
    assert out[4] == "['https://beeatlas.net', 'https://www.beeatlas.net']"
    assert out[5] == "False"
