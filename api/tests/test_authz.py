"""Tests for api/auth.py authz decorators (WRITE-03; D-05/D-07/D-09 + CSRF).

Uses a throwaway Flask app + test_client mounting a `@require_author`
no-op route. All allowlist/session/gate state is monkeypatched per-test —
no dependency on the real committed roles_allowlist.toml or real secrets.

Covers:
  - No cookie -> 401.
  - Valid cookie, login not in the (monkeypatched) allowlist -> 403 (revocation).
  - Allowlisted + allowed Origin + gate on -> 200.
  - Allowlisted but foreign/absent Origin -> 403.
  - Allowlisted + allowed Origin but gate off -> 503.
  - Forged author_id in the request body is ignored; derived identity wins.
  - origin_allowed() pure helper.
"""

import tomllib

import pytest
from flask import Flask, g, jsonify, request

import api.auth as auth
import api.config as config
import api.session as session


TEST_SIGNING_KEY = "throwaway-test-signing-key"


@pytest.fixture
def app():
    app = Flask(__name__)

    @app.post("/protected")
    @auth.require_author
    def protected():
        body = request.get_json(silent=True) or {}
        return jsonify(
            {
                "author_login": g.identity["login"],
                "forged_author_id_in_body": body.get("author_id"),
            }
        )

    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def _base_env(monkeypatch):
    """Sane defaults for every test: real signing key, gate on, no allowlist."""
    monkeypatch.setattr(config, "SESSION_SIGNING_KEY", TEST_SIGNING_KEY)
    monkeypatch.setattr(config, "WRITES_ENABLED", True)


def _mint(login="allowed_author", role="author", uid=1):
    serializer = session.make_serializer(TEST_SIGNING_KEY)
    return session.mint_cookie(serializer, internal_id=uid, inat_login=login, role=role)


def _allowlist_toml(tmp_path, roles: dict):
    path = tmp_path / "roles_allowlist.toml"
    body = "[roles]\n" + "\n".join(f'{login} = "{role}"' for login, role in roles.items())
    path.write_text(body)
    return path


ALLOWED_ORIGIN = "https://beeatlas.net"


# ---------------------------------------------------------------------------
# No cookie -> 401
# ---------------------------------------------------------------------------


def test_no_cookie_is_401(client):
    resp = client.post("/protected", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 401


def test_garbage_cookie_is_401(client):
    client.set_cookie(session.COOKIE_NAME, "not-a-real-token", domain="localhost")
    resp = client.post("/protected", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Allowlist revocation
# ---------------------------------------------------------------------------


def test_valid_cookie_login_not_in_allowlist_is_403(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {})  # nobody is an author
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="removed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/protected", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 403


def test_allowlisted_author_allowed_origin_gate_on_is_200(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/protected", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 200
    assert resp.get_json()["author_login"] == "allowed_author"


def test_allowlist_recheck_reflects_disk_change_not_cookie_role(client, monkeypatch, tmp_path):
    """The cookie's baked role must never be trusted for the authz decision."""
    allowlist_path = _allowlist_toml(tmp_path, {})  # revoked on disk
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    # Cookie itself still claims role="author" -- must not matter.
    token = _mint(login="allowed_author", role="author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/protected", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Origin / CSRF gate
# ---------------------------------------------------------------------------


def test_foreign_origin_is_403(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/protected", headers={"Origin": "https://evil.example.com"})
    assert resp.status_code == 403


def test_absent_origin_on_post_is_403(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/protected")  # no Origin header
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Launch gate (WRITE-04)
# ---------------------------------------------------------------------------


def test_launch_gate_off_is_503(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)
    monkeypatch.setattr(config, "WRITES_ENABLED", False)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/protected", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Forged-author rejection (D-07)
# ---------------------------------------------------------------------------


def test_forged_author_id_in_body_is_ignored(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post(
        "/protected",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"author_id": "someone_else_entirely"},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["author_login"] == "allowed_author"
    assert body["forged_author_id_in_body"] == "someone_else_entirely"  # visible to the view...
    assert body["author_login"] != body["forged_author_id_in_body"]  # ...but never used as author


# ---------------------------------------------------------------------------
# _is_curator_fresh (180-02; D-04/D-05 curator-only fresh recheck)
# ---------------------------------------------------------------------------


def test_is_curator_fresh_true_for_curator_only(monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"curator_login": "curator"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    assert auth._is_curator_fresh("curator_login") is True


def test_is_curator_fresh_false_for_author(monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    assert auth._is_curator_fresh("allowed_author") is False


def test_curator_recheck_reflects_disk_change_not_cookie_role(monkeypatch, tmp_path):
    """A demoted curator loses takedown/restore power on the very next check (D-05)."""
    allowlist_path = _allowlist_toml(tmp_path, {"curator_login": "curator"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)
    assert auth._is_curator_fresh("curator_login") is True

    # Operator demotes the curator on disk mid-session.
    allowlist_path.write_text('[roles]\ncurator_login = "author"')
    assert auth._is_curator_fresh("curator_login") is False


# ---------------------------------------------------------------------------
# origin_allowed pure helper
# ---------------------------------------------------------------------------


def test_origin_allowed_exact_match():
    assert auth.origin_allowed("https://beeatlas.net") is True
    assert auth.origin_allowed("https://www.beeatlas.net") is True


def test_origin_allowed_rejects_foreign_and_none():
    assert auth.origin_allowed("https://evil.example.com") is False
    assert auth.origin_allowed(None) is False
    assert auth.origin_allowed("http://beeatlas.net") is False  # scheme must match too
