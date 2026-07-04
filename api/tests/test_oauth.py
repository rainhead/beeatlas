"""Tests for the server-side iNaturalist OAuth2 PKCE exchange (WRITE-02, D-01/D-02).

All HTTP is mocked at the `requests` boundary ("Pattern D", see
data/tests/test_ecdysis_auth.py) — no live iNat calls. Covers:

  - make_pkce_pair    — RFC 7636 verifier/challenge shape, no double-hashing.
  - authorize_url     — response_type/state/code_challenge/redirect_uri wiring.
  - exchange_code     — POST /oauth/token body + access_token extraction + raise-on-error.
  - fetch_identity    — Bearer-vs-raw header formats at the two call sites, identity
                        return value, and token-discard (no token in the return value).
  - redirect_uri pin  — authorize_url() carries the exact api.config.REDIRECT_URI value.
"""

import base64
import hashlib
from unittest.mock import MagicMock, patch

import pytest
import requests

import api.config as config
import api.oauth as oauth


# ---------------------------------------------------------------------------
# make_pkce_pair
# ---------------------------------------------------------------------------


def test_pkce_verifier_length_in_rfc_range():
    verifier, _challenge = oauth.make_pkce_pair()
    assert 43 <= len(verifier) <= 128


def test_pkce_challenge_no_padding_and_correctly_derived():
    verifier, challenge = oauth.make_pkce_pair()
    assert "=" not in challenge
    expected = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .rstrip(b"=")
        .decode("ascii")
    )
    assert challenge == expected


def test_pkce_pair_is_random_each_call():
    verifier1, challenge1 = oauth.make_pkce_pair()
    verifier2, challenge2 = oauth.make_pkce_pair()
    assert verifier1 != verifier2
    assert challenge1 != challenge2


# ---------------------------------------------------------------------------
# authorize_url
# ---------------------------------------------------------------------------


def test_authorize_url_contains_required_params():
    url = oauth.authorize_url(
        client_id="client-123",
        redirect_uri="https://api.beeatlas.net/auth/callback",
        state="state-abc",
        code_challenge="challenge-xyz",
    )
    assert url.startswith(f"{oauth.INAT_BASE}/oauth/authorize?")
    assert "response_type=code" in url
    assert "code_challenge_method=S256" in url
    assert "state=state-abc" in url
    assert "code_challenge=challenge-xyz" in url
    assert "redirect_uri=https://api.beeatlas.net/auth/callback" in url
    assert "client_id=client-123" in url


def test_authorize_url_pins_exact_redirect_uri_constant():
    """authorize_url() must carry the exact pinned api.config.REDIRECT_URI (D-12/D-13)."""
    url = oauth.authorize_url(
        client_id="client-123",
        redirect_uri=config.REDIRECT_URI,
        state="state-abc",
        code_challenge="challenge-xyz",
    )
    assert config.REDIRECT_URI == "https://api.beeatlas.net/auth/callback"
    assert f"redirect_uri={config.REDIRECT_URI}" in url


# ---------------------------------------------------------------------------
# exchange_code
# ---------------------------------------------------------------------------


def _ok_response(json_body: dict) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.json = MagicMock(return_value=json_body)
    resp.raise_for_status = MagicMock()
    return resp


def _error_response(status_code: int) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    err = requests.exceptions.HTTPError(f"{status_code} Client Error", response=resp)
    resp.raise_for_status = MagicMock(side_effect=err)
    return resp


def test_exchange_code_posts_expected_body_and_returns_access_token():
    resp = _ok_response({"access_token": "at-123"})
    with patch.object(oauth.requests, "post", return_value=resp) as mock_post:
        token = oauth.exchange_code(
            client_id="client-123",
            client_secret="secret-456",
            code="code-789",
            redirect_uri="https://api.beeatlas.net/auth/callback",
            verifier="verifier-abc",
        )

    assert token == "at-123"
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == f"{oauth.INAT_BASE}/oauth/token"
    data = kwargs["data"]
    assert data["client_id"] == "client-123"
    assert data["client_secret"] == "secret-456"
    assert data["code"] == "code-789"
    assert data["redirect_uri"] == "https://api.beeatlas.net/auth/callback"
    assert data["grant_type"] == "authorization_code"
    assert data["code_verifier"] == "verifier-abc"
    resp.raise_for_status.assert_called_once()


def test_exchange_code_raises_on_http_error():
    resp = _error_response(400)
    with patch.object(oauth.requests, "post", return_value=resp):
        with pytest.raises(requests.exceptions.HTTPError):
            oauth.exchange_code(
                client_id="client-123",
                client_secret="secret-456",
                code="bad-code",
                redirect_uri="https://api.beeatlas.net/auth/callback",
                verifier="verifier-abc",
            )


# ---------------------------------------------------------------------------
# fetch_identity
# ---------------------------------------------------------------------------


def _jwt_response(jwt: str = "the-jwt-token") -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.json = MagicMock(return_value={"api_token": jwt})
    resp.raise_for_status = MagicMock()
    return resp


def _me_response(identity: dict) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.json = MagicMock(return_value={"results": [identity]})
    resp.raise_for_status = MagicMock()
    return resp


def test_fetch_identity_uses_bearer_on_api_token_and_raw_on_users_me():
    identity = {"id": 42, "login": "someuser"}
    jwt_resp = _jwt_response("jwt-xyz")
    me_resp = _me_response(identity)

    with patch.object(
        oauth.requests, "get", side_effect=[jwt_resp, me_resp]
    ) as mock_get:
        result = oauth.fetch_identity("access-tok-123")

    assert result == identity
    assert mock_get.call_count == 2

    first_call = mock_get.call_args_list[0]
    assert first_call.args[0] == f"{oauth.INAT_BASE}/users/api_token"
    assert first_call.kwargs["headers"]["Authorization"] == "Bearer access-tok-123"

    second_call = mock_get.call_args_list[1]
    assert second_call.args[0] == "https://api.inaturalist.org/v1/users/me"
    # RAW header — no "Bearer " prefix (matches the official inaturalistjs client).
    assert second_call.kwargs["headers"]["Authorization"] == "jwt-xyz"


def test_fetch_identity_returns_identity_dict_from_results_zero():
    identity = {"id": 7, "login": "bee-person", "name": "Bee Person"}
    with patch.object(
        oauth.requests,
        "get",
        side_effect=[_jwt_response("jwt-1"), _me_response(identity)],
    ):
        result = oauth.fetch_identity("access-tok-456")

    assert result == identity


def test_fetch_identity_raises_on_api_token_http_error():
    with patch.object(oauth.requests, "get", side_effect=[_error_response(403)]):
        with pytest.raises(requests.exceptions.HTTPError):
            oauth.fetch_identity("access-tok-bad")


def test_fetch_identity_discards_token_no_leak_in_return_value():
    """D-03: neither the OAuth access_token nor the 24h JWT may appear in the
    return value — fetch_identity's boundary must expose identity only."""
    identity = {"id": 99, "login": "no-leak"}
    access_token = "SECRET-ACCESS-TOKEN"
    jwt = "SECRET-JWT-VALUE"
    with patch.object(
        oauth.requests,
        "get",
        side_effect=[_jwt_response(jwt), _me_response(identity)],
    ):
        result = oauth.fetch_identity(access_token)

    assert result == identity
    serialized = repr(result)
    assert access_token not in serialized
    assert jwt not in serialized
    # No module-level state retains either token.
    module_state = vars(oauth)
    for value in module_state.values():
        if isinstance(value, str):
            assert access_token not in value
            assert jwt not in value
