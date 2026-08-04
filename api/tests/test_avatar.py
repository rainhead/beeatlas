"""Tests for the inlined iNaturalist avatar (api/avatar.py).

HTTP is mocked at the `requests` boundary ("Pattern D", as in test_oauth.py) —
no live calls to static.inaturalist.org.

The thing under test is a decoration, and that shapes what is worth pinning. It
must never raise, never let a whoami hang, never fetch a host it was not meant
to, and never grow without bound — the picture itself is the least important
property here.
"""

import base64
from unittest.mock import MagicMock, patch

import pytest
import requests

import api.avatar as avatar

ICON_URL = "https://static.inaturalist.org/attachments/users/icons/1/thumb.jpg?1475527316"
JPEG = b"\xff\xd8\xff\xe0 not really a jpeg, but bytes are bytes"


@pytest.fixture(autouse=True)
def _clear_cache():
    """The cache is module-level and the suite runs in random order (pytest-randomly)."""
    avatar._cache.clear()
    yield
    avatar._cache.clear()


def _response(*, ok=True, status=200, content_type="image/jpeg", body=JPEG):
    resp = MagicMock()
    resp.ok = ok
    resp.status_code = status
    resp.headers = {"Content-Type": content_type}
    resp.raw.read.return_value = body
    resp.__enter__ = lambda self: self
    resp.__exit__ = lambda self, *a: False
    return resp


# ---------------------------------------------------------------------------
# The happy path
# ---------------------------------------------------------------------------


def test_returns_a_data_url_carrying_the_bytes():
    with patch("api.avatar.requests.get", return_value=_response()) as get:
        result = avatar.data_url(ICON_URL)

    assert result is not None
    header, _, payload = result.partition(",")
    assert header == "data:image/jpeg;base64"
    assert base64.b64decode(payload) == JPEG
    # A short timeout is the whole reason this is safe to call from whoami, which
    # runs on every page load.
    assert get.call_args.kwargs["timeout"] == avatar.REQUEST_TIMEOUT


def test_content_type_parameters_are_stripped():
    # "image/jpeg; charset=binary" must not end up inside the data: URL header,
    # where it would produce a media type no browser will render.
    with patch("api.avatar.requests.get", return_value=_response(content_type="image/png; charset=binary")):
        assert avatar.data_url(ICON_URL).startswith("data:image/png;base64,")


# ---------------------------------------------------------------------------
# Refusals. Every one of these must be a None, never an exception: the caller is
# whoami, and a missing picture must not turn signing in into a 500.
# ---------------------------------------------------------------------------


def test_no_icon_url_is_none_without_fetching():
    with patch("api.avatar.requests.get") as get:
        assert avatar.data_url(None) is None
        assert avatar.data_url("") is None
    get.assert_not_called()


@pytest.mark.parametrize(
    "url",
    [
        "http://static.inaturalist.org/x.jpg",          # not https
        "https://evil.example.com/x.jpg",               # not an allowed host
        "https://static.inaturalist.org.evil.com/x.jpg",  # suffix trick
        "file:///etc/passwd",
        "https://169.254.169.254/latest/meta-data/",    # cloud metadata
    ],
)
def test_refuses_urls_outside_the_allowlist_without_fetching(url):
    # This function makes the SERVER fetch a URL that arrived over the wire. The
    # source is iNat and the value travels in our own signed cookie, so it is not
    # attacker-controlled in any ordinary sense — but the SHAPE is SSRF, and an
    # allowlist costs one comparison.
    with patch("api.avatar.requests.get") as get:
        assert avatar.data_url(url) is None
    get.assert_not_called()


def test_non_ok_status_is_none():
    with patch("api.avatar.requests.get", return_value=_response(ok=False, status=404)):
        assert avatar.data_url(ICON_URL) is None


def test_non_image_content_type_is_none():
    # Refusing this is what stops an HTML error page becoming a data: URL the
    # header would then hand to an <img>.
    with patch("api.avatar.requests.get", return_value=_response(content_type="text/html")):
        assert avatar.data_url(ICON_URL) is None


def test_body_larger_than_the_cap_is_none():
    # Enforced by reading one byte past the cap rather than by trusting
    # Content-Length, which a server may omit or misreport.
    oversized = b"x" * (avatar.MAX_BYTES + 1)
    with patch("api.avatar.requests.get", return_value=_response(body=oversized)) as get:
        assert avatar.data_url(ICON_URL) is None
    assert get.return_value.raw.read.call_args.args[0] == avatar.MAX_BYTES + 1


def test_body_exactly_at_the_cap_is_kept():
    with patch("api.avatar.requests.get", return_value=_response(body=b"x" * avatar.MAX_BYTES)):
        assert avatar.data_url(ICON_URL) is not None


def test_empty_body_is_none():
    with patch("api.avatar.requests.get", return_value=_response(body=b"")):
        assert avatar.data_url(ICON_URL) is None


@pytest.mark.parametrize(
    "err",
    [requests.exceptions.Timeout(), requests.exceptions.ConnectionError(), requests.exceptions.RequestException()],
)
def test_network_failures_are_none_not_exceptions(err):
    with patch("api.avatar.requests.get", side_effect=err):
        assert avatar.data_url(ICON_URL) is None


# ---------------------------------------------------------------------------
# The cache. whoami is called on every page load, so "one fetch per whoami" is
# the failure this exists to prevent.
# ---------------------------------------------------------------------------


def test_second_call_for_the_same_url_does_not_refetch():
    with patch("api.avatar.requests.get", return_value=_response()) as get:
        first = avatar.data_url(ICON_URL)
        second = avatar.data_url(ICON_URL)
    assert first == second
    get.assert_called_once()


def test_a_different_url_is_fetched_separately():
    # iNat's URLs carry a cache-busting query param, so changing your picture
    # changes the KEY — which is what makes the hour-long TTL harmless.
    other = ICON_URL.replace("1475527316", "1600000000")
    with patch("api.avatar.requests.get", return_value=_response()) as get:
        avatar.data_url(ICON_URL)
        avatar.data_url(other)
    assert get.call_count == 2


def test_failures_are_cached_too():
    # Otherwise a user whose avatar 404s pays an outbound request that is known
    # to fail on every single page load — exactly the cost the cache exists to
    # remove, and only for the user already having the worse time.
    with patch("api.avatar.requests.get", return_value=_response(ok=False, status=404)) as get:
        assert avatar.data_url(ICON_URL) is None
        assert avatar.data_url(ICON_URL) is None
    get.assert_called_once()


def test_an_expired_entry_is_refetched(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(avatar.time, "monotonic", lambda: clock[0])
    with patch("api.avatar.requests.get", return_value=_response()) as get:
        avatar.data_url(ICON_URL)
        clock[0] += avatar.TTL_SECONDS + 1
        avatar.data_url(ICON_URL)
    assert get.call_count == 2


def test_the_cache_is_bounded():
    with patch("api.avatar.requests.get", return_value=_response()):
        for i in range(avatar.MAX_ENTRIES + 10):
            avatar.data_url(f"{ICON_URL}{i}")
    assert len(avatar._cache) <= avatar.MAX_ENTRIES
