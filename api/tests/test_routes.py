"""Route-level integration tests for api/main.py (178-06 Task 3; WRITE-01..03).

Drives `api.main.app` via Flask's test_client. Session cookies are minted
in-test with `api/session.py` (a throwaway signing key monkeypatched into
`api.config.SESSION_SIGNING_KEY`); `notes_store.roles.ROLES`/the allowlist
TOML are monkeypatched to control allowlist membership (the `test_authz.py`
pattern); `api.config.WRITES_ENABLED` is monkeypatched for the launch-gate
cases; the Origin header drives the CSRF cases; and `api.oauth` is mocked
(the `test_oauth.py` "Pattern D" boundary) for the OAuth-callback tests. All
tests are fast-tier: no live network, DB via a tmp-path
`notes_store.db.make_engine`.
"""

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.orm import Session

import api.auth as auth
import api.config as config
import api.main as main
import api.session as session
from notes_store.db import make_engine
from notes_store.models import Base, User

TEST_SIGNING_KEY = "throwaway-test-signing-key"
ALLOWED_ORIGIN = "https://beeatlas.net"


@pytest.fixture
def client():
    return main.app.test_client()


@pytest.fixture(autouse=True)
def _base_env(monkeypatch):
    """Sane defaults for every test: real-looking signing key, gate on."""
    monkeypatch.setattr(config, "SESSION_SIGNING_KEY", TEST_SIGNING_KEY)
    monkeypatch.setattr(config, "WRITES_ENABLED", True)


@pytest.fixture
def tmp_engine(tmp_path, monkeypatch):
    engine = make_engine(tmp_path / "notes.db")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(main, "_ENGINE", engine)
    return engine


def _mint(login="allowed_author", role="author", uid=1):
    serializer = session.make_serializer(TEST_SIGNING_KEY)
    return session.mint_cookie(serializer, internal_id=uid, inat_login=login, role=role)


def _allowlist_toml(tmp_path, roles: dict):
    path = tmp_path / "roles_allowlist.toml"
    body = "[roles]\n" + "\n".join(f'{login} = "{role}"' for login, role in roles.items())
    path.write_text(body)
    return path


# ---------------------------------------------------------------------------
# GET /auth/whoami
# ---------------------------------------------------------------------------


def test_whoami_no_cookie_is_anonymous(client):
    resp = client.get("/auth/whoami")
    assert resp.status_code == 200
    assert resp.get_json() == {"authenticated": False}


def test_whoami_garbage_cookie_is_anonymous(client):
    client.set_cookie(session.COOKIE_NAME, "not-a-real-token", domain="localhost")
    resp = client.get("/auth/whoami")
    assert resp.status_code == 200
    assert resp.get_json() == {"authenticated": False}


def test_whoami_valid_cookie_allowlisted_reports_authenticated_and_is_author(
    client, monkeypatch, tmp_path
):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(main.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.get("/auth/whoami")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body == {
        "authenticated": True,
        "login": "allowed_author",
        "role": "author",
        "is_author": True,
    }


def test_whoami_valid_cookie_not_allowlisted_reports_authenticated_not_author(
    client, monkeypatch, tmp_path
):
    """The cookie's baked role must never be trusted -- whoami re-reads the
    allowlist fresh (D-05), same as the write-path recheck."""
    allowlist_path = _allowlist_toml(tmp_path, {})  # revoked on disk
    monkeypatch.setattr(main.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author", role="author")  # stale baked role
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.get("/auth/whoami")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["authenticated"] is True
    assert body["is_author"] is False
    assert body["role"] is None


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


def test_logout_clears_session_cookie(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(main.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/auth/logout", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 200

    set_cookie_headers = resp.headers.get_all("Set-Cookie")
    assert any(session.COOKIE_NAME in h for h in set_cookie_headers)
    cleared = next(h for h in set_cookie_headers if session.COOKIE_NAME in h)
    assert f"{session.COOKIE_NAME}=;" in cleared or f'{session.COOKIE_NAME}="";' in cleared

    # A subsequent whoami with the browser's cookie jar (now cleared) is anonymous.
    resp2 = client.get("/auth/whoami")
    assert resp2.get_json() == {"authenticated": False}


def test_logout_rejects_foreign_origin(client):
    resp = client.post("/auth/logout", headers={"Origin": "https://evil.example.com"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/write-check status matrix
# ---------------------------------------------------------------------------


def test_write_check_no_cookie_is_401(client):
    resp = client.post("/api/write-check", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 401


def test_write_check_not_allowlisted_is_403(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {})  # nobody is an author
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="stranger")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/api/write-check", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 403


def test_write_check_allowlisted_allowed_origin_gate_on_is_200(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author", role="author", uid=7)
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/api/write-check", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 200
    assert resp.get_json() == {"uid": 7, "login": "allowed_author", "role": "author"}


def test_write_check_foreign_origin_is_403(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/api/write-check", headers={"Origin": "https://evil.example.com"})
    assert resp.status_code == 403


def test_write_check_writes_disabled_is_503(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)
    monkeypatch.setattr(config, "WRITES_ENABLED", False)

    token = _mint(login="allowed_author")
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post("/api/write-check", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 503


def test_write_check_forged_author_id_in_body_is_ignored(client, monkeypatch, tmp_path):
    allowlist_path = _allowlist_toml(tmp_path, {"allowed_author": "author"})
    monkeypatch.setattr(auth.roles_module, "_ALLOWLIST", allowlist_path)

    token = _mint(login="allowed_author", uid=1)
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")

    resp = client.post(
        "/api/write-check",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"author_id": "someone_else_entirely", "uid": 999},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["login"] == "allowed_author"
    assert body["uid"] == 1


# ---------------------------------------------------------------------------
# GET /auth/callback
# ---------------------------------------------------------------------------


def test_callback_no_flow_cookie_is_400(client):
    resp = client.get("/auth/callback?state=whatever&code=abc123")
    assert resp.status_code == 400


def test_callback_state_mismatch_is_400(client, monkeypatch):
    """oauth is mocked so this test can never accidentally reach a live call --
    the state check must reject before exchange_code is ever invoked."""
    monkeypatch.setattr(config, "INAT_CLIENT_SECRET", "real-looking-secret")
    exchange_mock = MagicMock()
    monkeypatch.setattr(main.oauth, "exchange_code", exchange_mock)

    login_resp = client.get("/auth/login")
    assert login_resp.status_code == 302

    resp = client.get("/auth/callback?state=not-the-real-state&code=abc123")
    assert resp.status_code == 400
    exchange_mock.assert_not_called()


def test_callback_happy_path_mints_session_and_redirects(client, monkeypatch, tmp_engine):
    monkeypatch.setattr(config, "INAT_CLIENT_SECRET", "real-looking-secret")

    login_resp = client.get("/auth/login")
    assert login_resp.status_code == 302
    authorize_url = login_resp.headers["Location"]
    state = dict(
        part.split("=", 1) for part in authorize_url.split("?", 1)[1].split("&")
    )["state"]

    identity = {"id": 55, "login": "new_bee_person"}
    with patch.object(main.oauth, "exchange_code", return_value="access-tok") as exchange_mock, \
         patch.object(main.oauth, "fetch_identity", return_value=identity) as fetch_mock:
        resp = client.get(f"/auth/callback?state={state}&code=the-code")

    exchange_mock.assert_called_once()
    fetch_mock.assert_called_once_with("access-tok")
    assert resp.status_code == 302
    assert resp.headers["Location"] == main.DEFAULT_RETURN_TO

    set_cookie_headers = resp.headers.get_all("Set-Cookie")
    assert any(session.COOKIE_NAME in h for h in set_cookie_headers)

    with Session(tmp_engine) as db_session:
        rows = db_session.query(User).all()
        assert len(rows) == 1
        assert rows[0].inat_login == "new_bee_person"
        assert rows[0].inat_user_id == 55


# ---------------------------------------------------------------------------
# Forced error -> generic body, no traceback (app.debug False + error handler)
# ---------------------------------------------------------------------------


def test_forced_error_returns_generic_body_no_traceback(client, monkeypatch, tmp_engine):
    """Simulate an unhandled exception mid-callback (e.g. a DB error) and
    confirm the response is the generic {"error": "internal error"} body --
    never a traceback, matching Waitress's own no-cgitb behavior plus
    Flask's app.debug=False (Pitfall 3 restated)."""
    monkeypatch.setattr(config, "INAT_CLIENT_SECRET", "real-looking-secret")

    login_resp = client.get("/auth/login")
    authorize_url = login_resp.headers["Location"]
    state = dict(
        part.split("=", 1) for part in authorize_url.split("?", 1)[1].split("&")
    )["state"]

    boom = RuntimeError("simulated unexpected failure -- must never leak in the response")
    with patch.object(main.oauth, "exchange_code", return_value="access-tok"), \
         patch.object(main.oauth, "fetch_identity", side_effect=boom):
        resp = client.get(f"/auth/callback?state={state}&code=the-code")

    assert resp.status_code == 500
    body_text = resp.get_data(as_text=True)
    assert "internal error" in body_text
    assert "RuntimeError" not in body_text
    assert "simulated unexpected failure" not in body_text
    assert "Traceback" not in body_text
