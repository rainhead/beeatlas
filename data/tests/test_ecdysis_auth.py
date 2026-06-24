"""Phase 163 — fast-tier unit tests for the authenticated Ecdysis download.

Six behaviors covering the locked decisions D-2 (authenticated session + response
guard) and D-3 (cache-fallback resilience), plus the V7 logging requirement (the
password value must never reach an error string or stdout):

  - login_fields        — login POST hits /profile/index.php with {login, password,
                          action=login, remember}.
  - session_reuse       — the download POST reuses the SAME requests.Session used for
                          login, in login-then-download order.
  - json_error_raises   — a non-ZIP download body (401/JSON, bad magic bytes) raises
                          when no usable cache exists.
  - cache_fallback      — a valid cached ZIP is reused (warn) on download failure, with
                          NO further network call.
  - no_cache_hard_fail  — download fails AND no usable cache → raises.
  - password_not_logged — the password value appears in neither the raised exception
                          string nor captured stdout.

HTTP is mocked at the requests boundary per "Pattern D" (see test_resolve_taxon_ids.py):
patch ``ecdysis_pipeline.requests.Session`` so ``Session().post`` has a
``side_effect=[login_resp, download_resp]``. Credentials are injected by monkeypatching
``_get_credentials`` — never a real secrets.toml. All tests are fast tier (no live
network); there is NO ``@pytest.mark.integration`` marker here.
"""
import io
import zipfile
from unittest.mock import MagicMock, patch

import pytest
import requests

import ecdysis_pipeline


LOGIN_URL = "https://ecdysis.org/profile/index.php"
DOWNLOAD_URL = "https://ecdysis.org/collections/download/downloadhandler.php"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fake_zip_bytes() -> bytes:
    """A real, minimal ZIP (starts with PK\\x03\\x04) that passes both the download
    guard and ``_is_valid_cached_zip`` (testzip() is None)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("occurrences.tab", "id\tcanonical_name\n1\tapis mellifera\n")
        zf.writestr("identifications.tab", "recordID\tid\n1\t1\n")
    data = buf.getvalue()
    assert data.startswith(b"PK\x03\x04")
    return data


def _zip_response() -> MagicMock:
    """A 200 response whose body is a real ZIP."""
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {"Content-Type": "application/zip"}
    resp.content = _fake_zip_bytes()
    resp.raise_for_status = MagicMock()
    return resp


def _login_response() -> MagicMock:
    """A benign login response — the design does not gate on its body (the download
    guard is the authoritative success signal, RESEARCH Q2)."""
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {"Content-Type": "text/html"}
    resp.content = b"<html>ok</html>"
    resp.text = "<html>ok</html>"
    resp.raise_for_status = MagicMock()
    return resp


def _json_401_response() -> MagicMock:
    """The live anonymous-download failure: 401 + application/json error body."""
    resp = MagicMock()
    resp.status_code = 401
    resp.headers = {"Content-Type": "application/json"}
    resp.content = b'{"error":"Unauthorized access"}'
    resp.text = '{"error":"Unauthorized access"}'
    err = requests.exceptions.HTTPError("401 Client Error", response=resp)
    resp.raise_for_status = MagicMock(side_effect=err)
    return resp


def _session_with(post_side_effect) -> MagicMock:
    """A MagicMock standing in for a requests.Session whose .post is scripted."""
    session = MagicMock()
    session.post = MagicMock(side_effect=post_side_effect)
    return session


@pytest.fixture(autouse=True)
def _isolate_cache(tmp_path, monkeypatch):
    """Reroute the on-disk cache into tmp_path and force past the TTL fast-path so the
    network/fallback path is always exercised (RESEARCH Pitfall 2)."""
    monkeypatch.setattr(ecdysis_pipeline, "ECDYSIS_CACHE_DIR", tmp_path)
    monkeypatch.setattr(ecdysis_pipeline, "ECDYSIS_CACHE_TTL_SECONDS", 0)
    # Default creds seam — individual tests may override.
    monkeypatch.setattr(ecdysis_pipeline, "_get_credentials", lambda: ("u", "p"))
    return tmp_path


def _write_valid_cache(cache_dir, dataset_id: int = 44) -> bytes:
    data = _fake_zip_bytes()
    (cache_dir / f"{dataset_id}.zip").write_bytes(data)
    return data


# ---------------------------------------------------------------------------
# D-2 — authenticated session
# ---------------------------------------------------------------------------

def test_login_fields_posted_to_profile_index(_isolate_cache):
    """The login POST hits /profile/index.php carrying login / password / action=login
    / remember, with `login` carrying the username and `action` == 'login'."""
    session = _session_with([_login_response(), _zip_response()])
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        ecdysis_pipeline._download_zip(44)

    login_call = session.post.call_args_list[0]
    # URL is first positional or the `url` kwarg.
    url = login_call.args[0] if login_call.args else login_call.kwargs.get("url")
    assert url == LOGIN_URL
    data = login_call.kwargs.get("data") or (
        login_call.args[1] if len(login_call.args) > 1 else {}
    )
    assert data["login"] == "u"
    assert data["password"] == "p"
    assert data["action"] == "login"
    assert "remember" in data


def test_session_reuse_for_download(_isolate_cache):
    """The download POST hits downloadhandler.php on the SAME Session used for login,
    login first then download."""
    session = _session_with([_login_response(), _zip_response()])
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        ecdysis_pipeline._download_zip(44)

    assert session.post.call_count == 2
    first_url = (
        session.post.call_args_list[0].args[0]
        if session.post.call_args_list[0].args
        else session.post.call_args_list[0].kwargs.get("url")
    )
    second_url = (
        session.post.call_args_list[1].args[0]
        if session.post.call_args_list[1].args
        else session.post.call_args_list[1].kwargs.get("url")
    )
    assert first_url == LOGIN_URL
    assert second_url == DOWNLOAD_URL


def test_json_error_raises_when_no_cache(_isolate_cache):
    """A 401/JSON download body (not a real ZIP) raises when no cache exists."""
    session = _session_with([_login_response(), _json_401_response()])
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        with pytest.raises(Exception):
            ecdysis_pipeline._download_zip(44)


# ---------------------------------------------------------------------------
# D-3 — cache-fallback resilience
# ---------------------------------------------------------------------------

def test_cache_fallback_reuses_valid_zip(_isolate_cache, capsys):
    """With a valid cached ZIP present and the download failing, _download_zip returns
    the cached bytes, emits a warning, and makes no successful download."""
    cached = _write_valid_cache(_isolate_cache)
    session = _session_with([_login_response(), _json_401_response()])
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        result = ecdysis_pipeline._download_zip(44)

    assert result == cached
    out = capsys.readouterr().out.lower()
    assert "warn" in out or "cached" in out


def test_no_cache_hard_fail(_isolate_cache):
    """Download fails AND no usable cache → raises (no silent zeroing)."""
    session = _session_with([_login_response(), _json_401_response()])
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        with pytest.raises(Exception):
            ecdysis_pipeline._download_zip(44)


# ---------------------------------------------------------------------------
# V7 — the password value never reaches an error string or stdout
# ---------------------------------------------------------------------------

def test_password_not_logged(_isolate_cache, capsys, monkeypatch):
    """Force a download failure whose error path runs; the password value 'sekret' must
    appear in NEITHER the raised exception string NOR captured stdout."""
    monkeypatch.setattr(ecdysis_pipeline, "_get_credentials", lambda: ("u", "sekret"))
    session = _session_with([_login_response(), _json_401_response()])
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        with pytest.raises(Exception) as excinfo:
            ecdysis_pipeline._download_zip(44)

    assert "sekret" not in str(excinfo.value)
    captured = capsys.readouterr()
    assert "sekret" not in captured.out
    assert "sekret" not in captured.err
