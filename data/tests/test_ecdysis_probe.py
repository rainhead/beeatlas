"""beeatlas-29j — fast-tier unit tests for the Ecdysis change-probe.

The probe's job is to answer "did anything move at the source?" cheaply, so the
nightly can skip the ~2-minute server-side ZIP build when the answer is no. Its
whole value rests on being conservative in one direction: a missed change means
stale data for a day, so every ambiguity must resolve to "download".

What is pinned here, grouped by the property it protects:

  cheapness      — an unchanged source costs two GETs and NO download POST; a cache
                   still inside the mtime TTL costs nothing at all.
  conservatism   — absent sidecar, either signal moved, probe error, corrupt cache,
                   or ECDYSIS_SKIP_PROBE=0 all download.
  baseline truth — the sidecar is read BEFORE the download (so a record inserted
                   during the ~2-minute build reads as changed next run, rather than
                   being hidden forever), written only on success, and never
                   rewritten by a skip.
  API quirk      — dateLastModifiedMin is always paired with a far-future Max,
                   because Min alone returns HTTP 500 (loose whereRaw binding in
                   Ecdysis's OccurrenceController; verified live 2026-07-23).

HTTP is mocked at the requests boundary, as in test_ecdysis_auth.py: the probe uses
``ecdysis_pipeline.requests.get`` (patched here via the ``api`` fixture) while the
download uses ``requests.Session().post`` (patched per-test). Those are two distinct
seams — patching only the Session, as the auth tests originally did, leaves the probe
hitting ecdysis.org for real. All tests are fast tier: no live network.
"""
import io
import json
import zipfile
from unittest.mock import MagicMock, patch

import pytest

import ecdysis_pipeline


DOWNLOAD_URL = "https://ecdysis.org/collections/download/downloadhandler.php"


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeApi:
    """Stand-in for the v2 occurrence API, carrying the two signals the probe reads.

    `total` answers a bare datasetID query; `changed` answers a dateLastModified-bounded
    one. Both are plain attributes so a test can move the source mid-run. Every call's
    params are recorded so tests can assert on query shape and call count.
    """

    def __init__(self, total: int = 46090, changed: int = 7):
        self.total = total
        self.changed = changed
        self.calls: list[dict] = []
        self.error: Exception | None = None

    def get(self, url, params=None, **kwargs):
        self.calls.append(params or {})
        if self.error is not None:
            raise self.error
        count = self.changed if "dateLastModifiedMin" in (params or {}) else self.total
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json = MagicMock(return_value={"count": count})
        return resp

    def move(self, *, total: int = 0, changed: int = 0) -> None:
        """Simulate the source moving: `total` records added, `changed` records edited."""
        self.total += total
        self.changed += changed


def _fake_zip_bytes(marker: str = "cached") -> bytes:
    """A real, minimal ZIP that passes both the download guard and _is_valid_cached_zip."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("occurrences.tab", f"id\tcanonical_name\n1\t{marker}\n")
    return buf.getvalue()


def _zip_response(marker: str = "fresh") -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {"Content-Type": "application/zip"}
    resp.content = _fake_zip_bytes(marker)
    resp.raise_for_status = MagicMock()
    return resp


def _login_response() -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.headers = {"Content-Type": "text/html"}
    resp.content = b"<html>ok</html>"
    resp.raise_for_status = MagicMock()
    return resp


def _failing_download_session() -> MagicMock:
    """A Session whose download POST blows up (network/auth failure)."""
    session = MagicMock()
    session.post = MagicMock(
        side_effect=[_login_response(), RuntimeError("download exploded")]
    )
    return session


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cache_dir(tmp_path, monkeypatch):
    """Reroute the ZIP + sidecar cache into tmp_path, past the mtime TTL, with the
    probe enabled and credentials stubbed."""
    monkeypatch.setattr(ecdysis_pipeline, "ECDYSIS_CACHE_DIR", tmp_path)
    monkeypatch.setattr(ecdysis_pipeline, "ECDYSIS_CACHE_TTL_SECONDS", 0)
    monkeypatch.setattr(ecdysis_pipeline, "ECDYSIS_SKIP_PROBE", True)
    monkeypatch.setattr(ecdysis_pipeline, "_get_credentials", lambda: ("u", "p"))
    return tmp_path


@pytest.fixture
def api(monkeypatch):
    """Patch the probe's HTTP seam (``requests.get``) with a FakeApi."""
    fake = FakeApi()
    monkeypatch.setattr(ecdysis_pipeline.requests, "get", fake.get)
    return fake


def _write_cache(cache_dir, dataset_id: int = 44, marker: str = "cached") -> bytes:
    data = _fake_zip_bytes(marker)
    (cache_dir / f"{dataset_id}.zip").write_bytes(data)
    return data


def _write_sidecar(cache_dir, dataset_id: int = 44, **overrides) -> dict:
    meta = {
        "dataset_id": dataset_id,
        "since": "2026-07-22",
        "total": 46090,
        "baseline_changed": 7,
        **overrides,
    }
    (cache_dir / f"{dataset_id}.probe.json").write_text(json.dumps(meta))
    return meta


def _sidecar(cache_dir, dataset_id: int = 44) -> dict:
    return json.loads((cache_dir / f"{dataset_id}.probe.json").read_text())


# ---------------------------------------------------------------------------
# API quirk — dateLastModifiedMin alone returns HTTP 500
# ---------------------------------------------------------------------------

def test_changed_since_always_pairs_a_far_future_max(api):
    """The min bound is never sent alone: Ecdysis returns HTTP 500 for a bare
    dateLastModifiedMin, so the far-future Max is load-bearing, not cosmetic."""
    ecdysis_pipeline._api_changed_since_count(44, "2026-07-22")

    params = api.calls[-1]
    assert params["datasetID"] == 44
    assert params["dateLastModifiedMin"] == "2026-07-22"
    assert params["dateLastModifiedMax"] == ecdysis_pipeline._API_FAR_FUTURE


def test_probe_scopes_every_query_by_dataset(api, cache_dir):
    """Both signals are scoped by datasetID — dataset 44 is a subset of the WSUC
    collection, so a collid-scoped query would probe a different population than the
    ZIP pulls."""
    _write_sidecar(cache_dir)
    ecdysis_pipeline._probe_says_unchanged(44)

    assert api.calls, "probe made no API call"
    assert all(call.get("datasetID") == 44 for call in api.calls)


# ---------------------------------------------------------------------------
# Conservatism — every ambiguity resolves to "download"
# ---------------------------------------------------------------------------

def test_no_sidecar_means_download(api, cache_dir):
    """With no baseline there is nothing to compare against, so the probe cannot
    license a skip — and it should not waste an API call finding that out."""
    assert ecdysis_pipeline._probe_says_unchanged(44) is False
    assert api.calls == []


def test_total_moved_means_download(api, cache_dir):
    """A changed total catches deletions and net membership changes, which the
    modified-since signal alone cannot see."""
    _write_sidecar(cache_dir, total=46090)
    api.total = 46089  # a record was deleted

    assert ecdysis_pipeline._probe_says_unchanged(44) is False


def test_modified_since_grew_means_download(api, cache_dir):
    """Adds and edits bump dateLastModified, pushing the modified-since count past the
    baseline even when the total happens to be flat (one deleted, one added)."""
    _write_sidecar(cache_dir, baseline_changed=7)
    api.changed = 8

    assert ecdysis_pipeline._probe_says_unchanged(44) is False


def test_both_signals_matching_means_unchanged(api, cache_dir):
    """The only case that licenses a skip: neither signal moved."""
    _write_sidecar(cache_dir, total=46090, baseline_changed=7)

    assert ecdysis_pipeline._probe_says_unchanged(44) is True


def test_probe_error_means_download(api, cache_dir, capsys):
    """A transport/JSON failure is 'unknown', never a green light to reuse a possibly
    stale cache — and it says so on stdout so a persistently broken probe is visible
    in the nightly log rather than silently costing a download every night."""
    _write_sidecar(cache_dir)
    api.error = RuntimeError("API down")

    assert ecdysis_pipeline._probe_says_unchanged(44) is False
    assert "probe failed" in capsys.readouterr().out.lower()


def test_corrupt_sidecar_means_download(api, cache_dir):
    """A truncated/garbled sidecar must not raise out of the loader — it degrades to
    'no baseline' like any other probe uncertainty."""
    (cache_dir / "44.probe.json").write_text("{not json")

    assert ecdysis_pipeline._probe_says_unchanged(44) is False


# ---------------------------------------------------------------------------
# Baseline truth — read before the download, written only on success
# ---------------------------------------------------------------------------

def test_baseline_since_is_backed_off_one_day(api, monkeypatch):
    """`since` is pulled back a day so day-boundary/timezone skew between us and the
    server can never push a concurrent edit below the min bound."""
    monkeypatch.setattr(ecdysis_pipeline.time, "time", lambda: 1753920000)  # 2025-07-31Z

    baseline = ecdysis_pipeline._read_probe_baseline(44)

    assert baseline["since"] == "2025-07-30"


def test_baseline_records_the_live_count_not_zero(api):
    """The modified-since baseline is the count AT DOWNLOAD TIME, not zero: those
    records are already in the fresh ZIP, so 'changed' later means GREW past this."""
    api.changed = 12

    baseline = ecdysis_pipeline._read_probe_baseline(44)

    assert baseline["baseline_changed"] == 12
    assert baseline["total"] == api.total


def test_baseline_is_read_before_the_download_not_after(api, cache_dir):
    """A record inserted during the ~2-minute ZIP build may or may not be in the ZIP.
    Reading the signals BEFORE the download makes it read as changed on the next run
    (a redundant download); reading them after would fold it into the baseline and
    hide it until some unrelated edit tripped the probe."""
    def _download_and_move(*args, **kwargs):
        api.move(total=1, changed=1)  # a record lands mid-build
        return _zip_response()

    # Dispatch on URL rather than a fixed side_effect list, so the source only moves
    # when the *download* POST is made — which is the moment under test.
    session = MagicMock()
    session.post = MagicMock(
        side_effect=lambda url, **kwargs: (
            _download_and_move() if url == DOWNLOAD_URL else _login_response()
        )
    )
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        ecdysis_pipeline._download_zip(44)

    meta = _sidecar(cache_dir)
    assert meta["total"] == 46090, "sidecar captured the post-download total"
    assert meta["baseline_changed"] == 7, "sidecar captured the post-download edits"


def test_baseline_not_written_when_the_download_fails(api, cache_dir):
    """On a failed download we return the OLD cached ZIP. Writing a baseline that
    describes the CURRENT source would licence skipping forever against a cache that
    never caught up — so the old sidecar (or none) must survive untouched."""
    _write_cache(cache_dir)
    with patch.object(
        ecdysis_pipeline.requests, "Session", return_value=_failing_download_session()
    ):
        ecdysis_pipeline._download_zip(44)  # warns + reuses cache, no raise

    assert not (cache_dir / "44.probe.json").exists()


def test_probe_failure_does_not_break_the_download(api, cache_dir, capsys):
    """The probe is advisory. If the API is down, the download still happens and still
    returns its bytes — the only cost is that the next run cannot skip."""
    api.error = RuntimeError("API down")
    session = MagicMock()
    session.post = MagicMock(side_effect=[_login_response(), _zip_response()])
    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        result = ecdysis_pipeline._download_zip(44)

    assert result == _fake_zip_bytes("fresh")
    assert not (cache_dir / "44.probe.json").exists()
    assert "baseline" in capsys.readouterr().out.lower()


# ---------------------------------------------------------------------------
# Cheapness — the whole point: an unchanged source pays no ZIP build
# ---------------------------------------------------------------------------

def test_unchanged_source_skips_the_zip_build(api, cache_dir, capsys):
    """The headline behavior. Past the mtime TTL, with both signals matching, the
    loader returns the cached ZIP without a single POST — no login, no ~2-minute
    server-side build."""
    cached = _write_cache(cache_dir)
    _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed)
    session = MagicMock()
    session.post = MagicMock(side_effect=AssertionError("paid for a ZIP build"))

    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        result = ecdysis_pipeline._download_zip(44)

    assert result == cached
    assert session.post.call_count == 0
    assert len(api.calls) == 2, "a skip should cost exactly the two probe queries"
    assert "unchanged" in capsys.readouterr().out.lower()


def test_a_skip_does_not_rewrite_the_baseline(api, cache_dir):
    """The baseline stays anchored to the ZIP on disk. Re-stamping it on every skip
    would roll `since` forward past edits the cached ZIP never saw."""
    _write_cache(cache_dir)
    original = _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed)
    session = MagicMock()
    session.post = MagicMock(side_effect=AssertionError("paid for a ZIP build"))

    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        ecdysis_pipeline._download_zip(44)

    assert _sidecar(cache_dir) == original


def test_ttl_fastpath_precedes_the_probe(api, cache_dir, monkeypatch):
    """A cache still inside the mtime TTL is reused with no API call at all — the
    probe is for the nightly, which is always past the TTL."""
    monkeypatch.setattr(ecdysis_pipeline, "ECDYSIS_CACHE_TTL_SECONDS", 21600)
    cached = _write_cache(cache_dir)

    assert ecdysis_pipeline._download_zip(44) == cached
    assert api.calls == []


def test_corrupt_cache_is_never_reused_on_the_probe(api, cache_dir):
    """The probe says whether the SOURCE moved; it says nothing about whether our copy
    is readable. A matching baseline must not resurrect a truncated ZIP."""
    (cache_dir / "44.zip").write_bytes(b"PK\x03\x04truncated garbage")
    _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed)
    session = MagicMock()
    session.post = MagicMock(side_effect=[_login_response(), _zip_response()])

    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        result = ecdysis_pipeline._download_zip(44)

    assert result == _fake_zip_bytes("fresh")
    assert session.post.call_count == 2


def test_skip_probe_disabled_downloads_unconditionally(api, cache_dir, monkeypatch):
    """ECDYSIS_SKIP_PROBE=0 is the revert switch: it must restore the old
    download-every-time-past-TTL behavior even when the source is demonstrably
    unchanged."""
    monkeypatch.setattr(ecdysis_pipeline, "ECDYSIS_SKIP_PROBE", False)
    _write_cache(cache_dir)
    _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed)
    session = MagicMock()
    session.post = MagicMock(side_effect=[_login_response(), _zip_response()])

    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        result = ecdysis_pipeline._download_zip(44)

    assert result == _fake_zip_bytes("fresh")
    assert session.post.call_count == 2
