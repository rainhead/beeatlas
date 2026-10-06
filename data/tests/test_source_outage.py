"""An upstream outage keeps the last good copy and says so (beeatlas-fjzg).

The end-to-end tests run a real dlt pipeline into a scratch DuckDB, because the claim
the whole module rests on — a failed extract writes nothing — is dlt's behaviour, not
ours, and a mock would only restate it.
"""
import json

import dlt
import duckdb
import pytest
import requests

from source_outage import outage_cause, run_or_keep_last


def _http_error(status: int) -> requests.HTTPError:
    resp = requests.Response()
    resp.status_code = status
    return requests.HTTPError(f"{status}", response=resp)


@pytest.mark.parametrize(
    "exc",
    [
        requests.ConnectionError("refused"),
        requests.Timeout("slow"),
        requests.exceptions.ChunkedEncodingError("dropped mid-body"),
        _http_error(503),
        _http_error(429),
    ],
)
def test_an_outage_is_recognized(exc):
    assert outage_cause(exc) is exc


@pytest.mark.parametrize("exc", [_http_error(404), _http_error(422), ValueError("bad json")])
def test_a_bug_is_not_an_outage(exc):
    assert outage_cause(exc) is None


def test_the_cause_is_found_through_chained_exceptions():
    cause = requests.ConnectionError("refused")
    try:
        try:
            raise cause
        except requests.ConnectionError as e:
            raise RuntimeError("wrapped") from e
    except RuntimeError as wrapped:
        assert outage_cause(wrapped) is cause


@pytest.fixture
def receipt(tmp_path, monkeypatch):
    path = tmp_path / "receipt.json"
    monkeypatch.setenv("STELIS_BOUNDARY_RECEIPT", str(path))
    return path


@pytest.fixture
def loader(tmp_path):
    """A merge-incremental dlt loader shaped like the iNat ones, whose source can be
    told to fail partway through a fetch."""
    db = str(tmp_path / "t.duckdb")
    script = {"rows": [], "fail_at": None, "error": None}

    @dlt.resource(name="observations", primary_key="uuid", write_disposition="merge")
    def observations(updated=dlt.sources.incremental("updated_at", initial_value="2000-01-01")):
        for i, row in enumerate(script["rows"]):
            if i == script["fail_at"]:
                raise script["error"]
            yield row

    def run():
        pipeline = dlt.pipeline(
            pipeline_name="outage_test",
            pipelines_dir=str(tmp_path / "pipelines"),
            destination=dlt.destinations.duckdb(db),
            dataset_name="d",
        )
        return pipeline.run(observations())

    def rows():
        con = duckdb.connect(db, read_only=True)
        try:
            return con.execute("SELECT uuid, v FROM d.observations ORDER BY uuid").fetchall()
        finally:
            con.close()

    script["rows"] = [
        {"uuid": "a", "v": 1, "updated_at": "2026-01-01"},
        {"uuid": "b", "v": 1, "updated_at": "2026-01-02"},
    ]
    run()  # last night's good load
    script["rows"] = [
        {"uuid": "a", "v": 2, "updated_at": "2026-02-01"},
        {"uuid": "c", "v": 1, "updated_at": "2026-02-02"},
        {"uuid": "d", "v": 1, "updated_at": "2026-02-03"},
    ]
    return script, run, rows


def test_an_outage_mid_fetch_keeps_the_last_good_copy(loader, receipt):
    script, run, rows = loader
    script["fail_at"], script["error"] = 2, requests.ConnectionError("refused")

    assert run_or_keep_last("test", run) is None
    assert rows() == [("a", 1), ("b", 1)]  # nothing from the half-finished fetch
    body = json.loads(receipt.read_text())
    assert body["unreachable"] is True
    assert "ConnectionError" in body["error"]


def test_the_next_good_run_fetches_what_the_outage_hid(loader, receipt):
    script, run, rows = loader
    script["fail_at"], script["error"] = 2, requests.ConnectionError("refused")
    run_or_keep_last("test", run)

    script["fail_at"] = None
    assert run_or_keep_last("test", run) is not None
    assert rows() == [("a", 2), ("b", 1), ("c", 1), ("d", 1)]


def test_a_bug_still_fails_the_task(loader, receipt):
    script, run, rows = loader
    script["fail_at"], script["error"] = 0, _http_error(422)

    with pytest.raises(Exception) as raised:
        run_or_keep_last("test", run)
    assert outage_cause(raised.value) is None
    assert not receipt.exists()


def test_a_transform_writes_no_receipt(loader, receipt):
    script, run, rows = loader
    script["fail_at"], script["error"] = 0, requests.Timeout("slow")

    assert run_or_keep_last("test", run, receipt=False) is None
    assert not receipt.exists()


def test_outside_stelis_an_outage_is_kept_without_a_receipt(loader, monkeypatch):
    monkeypatch.delenv("STELIS_BOUNDARY_RECEIPT", raising=False)
    script, run, rows = loader
    script["fail_at"], script["error"] = 0, requests.ConnectionError("refused")

    assert run_or_keep_last("test", run) is None
    assert rows() == [("a", 1), ("b", 1)]


def test_the_receipt_error_leaves_out_the_query_string(loader, receipt):
    script, run, rows = loader
    script["fail_at"], script["error"] = 0, requests.ConnectionError(
        "Max retries exceeded with url: /v2/observations?project_id=1&fields=id%2Cuuid (Caused by X)"
    )
    run_or_keep_last("test", run)
    error = json.loads(receipt.read_text())["error"]
    assert "project_id" not in error
    assert "/v2/observations (Caused by X)" in error
