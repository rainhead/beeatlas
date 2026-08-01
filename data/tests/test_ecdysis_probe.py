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
  the receipt    — what the probe concluded reaches Stelis in the shape its
                   cross-repo contract fixes (beeatlas-u15 / stelis st-8bj), and
                   failing to report never costs us the load.

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
    # Default to "not running under Stelis". Without this the suite would write real
    # boundary receipts when the gate itself runs inside a Stelis task, where the env
    # var IS set — tests must not report build facts about themselves.
    monkeypatch.delenv("STELIS_BOUNDARY_RECEIPT", raising=False)
    return tmp_path


@pytest.fixture(autouse=True)
def api(monkeypatch):
    """Patch the probe's HTTP seam (``requests.get``) with a FakeApi.

    autouse, deliberately: an opt-in stub is exactly the trap this suite's sibling
    fell into — a test that forgets it silently reaches ecdysis.org instead of failing.
    Tests still take `api` as a parameter when they need to move the source."""
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
    ecdysis_pipeline._probe_source(44)

    assert api.calls, "probe made no API call"
    assert all(call.get("datasetID") == 44 for call in api.calls)


# ---------------------------------------------------------------------------
# Conservatism — every ambiguity resolves to "download"
# ---------------------------------------------------------------------------

def test_no_sidecar_means_download(api, cache_dir):
    """With no baseline there is nothing to compare against, so the probe cannot
    license a skip — and it should not waste an API call finding that out."""
    assert ecdysis_pipeline._probe_source(44) is None
    assert api.calls == []


def test_total_moved_means_download(api, cache_dir):
    """A changed total catches deletions and net membership changes, which the
    modified-since signal alone cannot see. It is reported unquantified: counting HOW
    many would cost a second query to answer a question we've already answered."""
    _write_sidecar(cache_dir, total=46090)
    api.total = 46089  # a record was deleted

    report = ecdysis_pipeline._probe_source(44)

    assert report.unchanged is False
    assert report.records is None
    assert len(api.calls) == 1, "a moved total should short-circuit the second query"


def test_modified_since_grew_means_download(api, cache_dir):
    """Adds and edits bump dateLastModified, pushing the modified-since count past the
    baseline even when the total happens to be flat (one deleted, one added)."""
    _write_sidecar(cache_dir, baseline_changed=7)
    api.changed = 10

    report = ecdysis_pipeline._probe_source(44)

    assert report.unchanged is False
    assert report.records == 3, "records new since the baseline, not the raw count"


def test_shrinking_modified_count_is_not_reported_as_negative(api, cache_dir):
    """Records deleted from inside the `since` window shrink the count below the
    baseline. That is still a change, but 'minus two records new' is nonsense to hand
    Stelis, so the quantity is clamped."""
    _write_sidecar(cache_dir, baseline_changed=7)
    api.changed = 5

    report = ecdysis_pipeline._probe_source(44)

    assert report.unchanged is False
    assert report.records == 0


def test_both_signals_matching_means_unchanged(api, cache_dir):
    """The only case that licenses a skip: neither signal moved."""
    _write_sidecar(cache_dir, total=46090, baseline_changed=7, since="2026-07-22")

    report = ecdysis_pipeline._probe_source(44)

    assert report.unchanged is True
    assert report.records == 0
    assert report.since == "2026-07-22"


def test_probe_error_means_download(api, cache_dir, capsys):
    """A transport/JSON failure is 'unknown', never a green light to reuse a possibly
    stale cache — and it says so on stdout so a persistently broken probe is visible
    in the nightly log rather than silently costing a download every night."""
    _write_sidecar(cache_dir)
    api.error = RuntimeError("API down")

    assert ecdysis_pipeline._probe_source(44) is None
    assert "probe failed" in capsys.readouterr().out.lower()


def test_corrupt_sidecar_means_download(api, cache_dir):
    """A truncated/garbled sidecar must not raise out of the loader — it degrades to
    'no baseline' like any other probe uncertainty."""
    (cache_dir / "44.probe.json").write_text("{not json")

    assert ecdysis_pipeline._probe_source(44) is None


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
    unchanged — and make NO v2-API calls at all, since the reason to reach for the
    switch is usually that the API itself is what's misbehaving."""
    monkeypatch.setattr(ecdysis_pipeline, "ECDYSIS_SKIP_PROBE", False)
    _write_cache(cache_dir)
    _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed)
    session = MagicMock()
    session.post = MagicMock(side_effect=[_login_response(), _zip_response()])

    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        result = ecdysis_pipeline._download_zip(44)

    assert result == _fake_zip_bytes("fresh")
    assert session.post.call_count == 2
    assert api.calls == [], "the revert switch must silence the probe entirely"


# ---------------------------------------------------------------------------
# The Stelis boundary receipt (beeatlas-u15) — a cross-repo contract
# ---------------------------------------------------------------------------
# A 'boundary loader that short-circuits never touches its outputs, so Stelis's output
# comparison can only ever say "identical" — it cannot say WHY. The receipt is how the
# loader speaks for itself. Shape is fixed by stelis/src/boundary-report-test.rkt:
# {"unchanged": bool, "records": int|null, "since": string|null}.

@pytest.fixture
def receipt(tmp_path, monkeypatch):
    """Point STELIS_BOUNDARY_RECEIPT at a path and return it, as Stelis does on every
    'boundary run."""
    path = tmp_path / "receipt.json"
    monkeypatch.setenv("STELIS_BOUNDARY_RECEIPT", str(path))
    return path


def _skipping_session() -> MagicMock:
    """A Session that fails the test if the loader pays for a ZIP build."""
    session = MagicMock()
    session.post = MagicMock(side_effect=AssertionError("paid for a ZIP build"))
    return session


def test_receipt_reports_an_unchanged_source(api, cache_dir, receipt):
    """The case the contract exists for: Stelis can now say 'source unchanged, 0
    records since <date>' instead of only 'outputs identical'."""
    _write_cache(cache_dir)
    _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed,
                   since="2026-07-22")

    with patch.object(
        ecdysis_pipeline.requests, "Session", return_value=_skipping_session()
    ):
        ecdysis_pipeline._download_zip(44)

    assert json.loads(receipt.read_text()) == {
        "unchanged": True,
        "records": 0,
        "since": "2026-07-22",
    }


def test_receipt_reports_a_changed_source(api, cache_dir, receipt):
    """A real re-ingest reports too, so `--why` can distinguish 'the probe looked and
    the source moved' from 'this loader never probed at all' — which a missing receipt
    would otherwise be indistinguishable from."""
    _write_cache(cache_dir)
    _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed,
                   since="2026-07-22")
    api.changed += 4
    session = MagicMock()
    session.post = MagicMock(side_effect=[_login_response(), _zip_response()])

    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        ecdysis_pipeline._download_zip(44)

    assert json.loads(receipt.read_text()) == {
        "unchanged": False,
        "records": 4,
        "since": "2026-07-22",
    }


def test_no_receipt_when_the_probe_reached_no_conclusion(api, cache_dir, receipt):
    """Silence is the honest answer when we didn't probe (no baseline here). Stelis
    reads a missing receipt as 'the loader said nothing' — never an error."""
    session = MagicMock()
    session.post = MagicMock(side_effect=[_login_response(), _zip_response()])

    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        ecdysis_pipeline._download_zip(44)

    assert not receipt.exists()


def test_no_receipt_outside_stelis(api, cache_dir, monkeypatch):
    """Run by hand (no STELIS_BOUNDARY_RECEIPT in the env), the loader must not guess
    at a path or fail — it just doesn't report."""
    monkeypatch.delenv("STELIS_BOUNDARY_RECEIPT", raising=False)
    _write_cache(cache_dir)
    _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed)

    with patch.object(
        ecdysis_pipeline.requests, "Session", return_value=_skipping_session()
    ):
        result = ecdysis_pipeline._download_zip(44)  # must not raise

    assert result == _fake_zip_bytes("cached")


def test_no_env_var_means_no_write_anywhere(monkeypatch):
    """Pinned directly rather than through _download_zip: absent the env var the
    receipt must not be written to SOME default path, which a run-level test (seeing
    only its own tmp dir) would happily miss."""
    monkeypatch.delenv("STELIS_BOUNDARY_RECEIPT", raising=False)
    written: list = []
    monkeypatch.setattr(
        ecdysis_pipeline.Path, "write_text", lambda self, text: written.append(self)
    )

    ecdysis_pipeline._write_boundary_receipt(
        ecdysis_pipeline.SourceReport(unchanged=True, records=0, since="2026-07-22")
    )

    assert written == []


def test_receipt_write_failure_never_breaks_the_load(api, cache_dir, monkeypatch, capsys):
    """The receipt is telemetry. An unwritable path (bad mount, permissions) must cost
    us the annotation, not the nightly."""
    monkeypatch.setenv(
        "STELIS_BOUNDARY_RECEIPT", str(cache_dir / "nope" / "receipt.json")
    )
    cached = _write_cache(cache_dir)
    _write_sidecar(cache_dir, total=api.total, baseline_changed=api.changed)

    with patch.object(
        ecdysis_pipeline.requests, "Session", return_value=_skipping_session()
    ):
        result = ecdysis_pipeline._download_zip(44)

    assert result == cached
    assert "receipt" in capsys.readouterr().out.lower()


def test_baseline_write_failure_never_breaks_a_done_download(
    api, cache_dir, monkeypatch, capsys
):
    """`_write_probe_baseline` runs AFTER the fresh ZIP is committed to cache, so
    anything it raises would turn a successful download into a hard failure. It must
    swallow more than OSError — a malformed baseline is still not worth the load."""
    monkeypatch.setattr(
        ecdysis_pipeline, "_read_probe_baseline",
        lambda dataset_id: {"since": "2026-07-22"},  # no dataset_id => KeyError on write
    )
    session = MagicMock()
    session.post = MagicMock(side_effect=[_login_response(), _zip_response()])

    with patch.object(ecdysis_pipeline.requests, "Session", return_value=session):
        result = ecdysis_pipeline._download_zip(44)  # must not raise

    assert result == _fake_zip_bytes("fresh")
    assert "baseline" in capsys.readouterr().out.lower()
