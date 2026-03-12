"""
Tests for data/links/fetch.py

Run from data/ directory:
  uv run pytest tests/test_links_fetch.py
"""

import pytest
import pandas as pd
from unittest.mock import patch, MagicMock, call
from pathlib import Path


SAMPLE_HTML = '''<fieldset id="association-div">
  <a href="https://www.inaturalist.org/observations/157620392" target="_blank">link</a>
</fieldset>'''

NO_ASSOC_HTML = '<html><body>no associations here</body></html>'


def make_ecdysis_parquet(path, records):
    """Helper: build minimal ecdysis parquet.
    records: list of (ecdysis_id: int, occurrenceID: str)
    """
    df = pd.DataFrame({
        'ecdysis_id': pd.array([r[0] for r in records], dtype='int64'),
        'occurrenceID': pd.array([r[1] for r in records], dtype=pd.StringDtype()),
    })
    df.to_parquet(path, index=False)


class TestFetchPage:
    def test_uses_integer_occid_in_url(self):
        from links.fetch import fetch_page
        ecdysis_id = 5594056
        mock_response = MagicMock()
        mock_response.text = SAMPLE_HTML
        with patch('links.fetch.requests.get', return_value=mock_response) as mock_get:
            result = fetch_page(ecdysis_id)
            call_args = mock_get.call_args
            url = call_args[0][0]
            assert f"occid={ecdysis_id}" in url, f"URL {url!r} must contain occid={ecdysis_id} as integer"
            assert result == SAMPLE_HTML

    def test_sets_user_agent_header(self):
        from links.fetch import fetch_page, HEADERS
        mock_response = MagicMock()
        mock_response.text = "<html></html>"
        with patch('links.fetch.requests.get', return_value=mock_response) as mock_get:
            fetch_page(12345)
            call_kwargs = mock_get.call_args[1]
            headers_used = call_kwargs.get('headers', {})
            assert 'User-Agent' in headers_used, "User-Agent header must be set"

    def test_returns_none_on_request_exception(self):
        from links.fetch import fetch_page
        import requests
        with patch('links.fetch.requests.get', side_effect=requests.RequestException("network error")):
            result = fetch_page(5594056)
            assert result is None


class TestRateLimit:
    def test_no_sleep_for_cached_records(self, tmp_path):
        from links.fetch import run_pipeline

        # Create ecdysis parquet with 2 records
        ecdysis_parquet = tmp_path / "ecdysis.parquet"
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()
        output_parquet = tmp_path / "links.parquet"

        # Record 1: cached (HTML on disk), Record 2: new (needs fetch)
        records = [(1001, "uuid-cached"), (1002, "uuid-new")]
        make_ecdysis_parquet(ecdysis_parquet, records)

        # Write cached HTML for record 1
        (cache_dir / "1001.html").write_text(SAMPLE_HTML, encoding="utf-8")

        mock_response = MagicMock()
        mock_response.text = NO_ASSOC_HTML

        with patch('links.fetch.fetch_page', return_value=NO_ASSOC_HTML) as mock_fetch, \
             patch('links.fetch.time.sleep') as mock_sleep:
            run_pipeline(
                ecdysis_parquet=ecdysis_parquet,
                output_parquet=output_parquet,
                cache_dir=cache_dir,
            )
            # sleep should be called exactly once (for the uncached record 1002)
            assert mock_sleep.call_count == 1, (
                f"time.sleep should be called exactly once (for uncached record), "
                f"got {mock_sleep.call_count}"
            )


class TestExtractObservationId:
    def test_extracts_id_from_association_div(self):
        from links.fetch import extract_observation_id
        result = extract_observation_id(SAMPLE_HTML)
        assert result == 157620392

    def test_returns_none_when_absent(self):
        from links.fetch import extract_observation_id
        assert extract_observation_id(None) is None
        assert extract_observation_id(NO_ASSOC_HTML) is None

    def test_returns_none_on_unparseable_href(self):
        from links.fetch import extract_observation_id
        bad_html = '''<fieldset id="association-div">
          <a href="not-a-valid-url/notanumber" target="_blank">link</a>
        </fieldset>'''
        result = extract_observation_id(bad_html)
        assert result is None


class TestFirstLevelSkip:
    def test_skips_occurrenceid_already_in_links_parquet(self, tmp_path):
        from links.fetch import run_pipeline

        ecdysis_parquet = tmp_path / "ecdysis.parquet"
        output_parquet = tmp_path / "links.parquet"
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()

        already_linked_id = "uuid-already"
        new_id = "uuid-new"

        # Pre-populate links.parquet with one already-linked occurrenceID
        existing_df = pd.DataFrame({
            "occurrenceID": pd.array([already_linked_id], dtype=pd.StringDtype()),
            "inat_observation_id": pd.array([99999], dtype=pd.Int64Dtype()),
        })
        existing_df.to_parquet(output_parquet, index=False)

        # ecdysis parquet has both records
        make_ecdysis_parquet(ecdysis_parquet, [(2001, already_linked_id), (2002, new_id)])

        with patch('links.fetch.fetch_page', return_value=NO_ASSOC_HTML) as mock_fetch:
            run_pipeline(
                ecdysis_parquet=ecdysis_parquet,
                output_parquet=output_parquet,
                cache_dir=cache_dir,
            )
            # fetch_page should only be called for the new record, not the already-linked one
            for call_args in mock_fetch.call_args_list:
                assert call_args[0][0] != 2001, "fetch_page must NOT be called for already-linked occurrenceID"

        # Output must contain both occurrenceIDs
        result = pd.read_parquet(output_parquet)
        assert already_linked_id in result["occurrenceID"].values
        assert new_id in result["occurrenceID"].values


class TestSecondLevelSkip:
    def test_parses_cached_html_without_http_request(self, tmp_path):
        from links.fetch import run_pipeline

        ecdysis_parquet = tmp_path / "ecdysis.parquet"
        output_parquet = tmp_path / "links.parquet"
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()

        ecdysis_id = 3001
        occurrence_id = "uuid-cached"
        make_ecdysis_parquet(ecdysis_parquet, [(ecdysis_id, occurrence_id)])

        # Write cached HTML for this record
        (cache_dir / f"{ecdysis_id}.html").write_text(SAMPLE_HTML, encoding="utf-8")

        with patch('links.fetch.fetch_page') as mock_fetch:
            run_pipeline(
                ecdysis_parquet=ecdysis_parquet,
                output_parquet=output_parquet,
                cache_dir=cache_dir,
            )
            mock_fetch.assert_not_called()

        result = pd.read_parquet(output_parquet)
        row = result[result["occurrenceID"] == occurrence_id]
        assert len(row) == 1
        assert row["inat_observation_id"].iloc[0] == 157620392


class TestOutput:
    def test_output_has_two_columns_with_correct_dtypes(self, tmp_path):
        from links.fetch import run_pipeline

        ecdysis_parquet = tmp_path / "ecdysis.parquet"
        output_parquet = tmp_path / "links.parquet"
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()

        make_ecdysis_parquet(ecdysis_parquet, [(4001, "uuid-a"), (4002, "uuid-b")])

        with patch('links.fetch.fetch_page', return_value=SAMPLE_HTML):
            run_pipeline(
                ecdysis_parquet=ecdysis_parquet,
                output_parquet=output_parquet,
                cache_dir=cache_dir,
            )

        result = pd.read_parquet(output_parquet)
        assert list(result.columns) == ["occurrenceID", "inat_observation_id"], (
            f"Expected columns ['occurrenceID', 'inat_observation_id'], got {list(result.columns)}"
        )
        assert result["occurrenceID"].dtype == pd.StringDtype(), (
            f"occurrenceID dtype should be StringDtype, got {result['occurrenceID'].dtype}"
        )
        assert result["inat_observation_id"].dtype == pd.Int64Dtype(), (
            f"inat_observation_id dtype should be Int64Dtype, got {result['inat_observation_id'].dtype}"
        )

    def test_output_covers_all_occurrence_ids_via_merge(self, tmp_path):
        from links.fetch import run_pipeline

        ecdysis_parquet = tmp_path / "ecdysis.parquet"
        output_parquet = tmp_path / "links.parquet"
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()

        # First run: 2 records
        make_ecdysis_parquet(ecdysis_parquet, [(5001, "uuid-x"), (5002, "uuid-y")])

        with patch('links.fetch.fetch_page', return_value=SAMPLE_HTML):
            run_pipeline(
                ecdysis_parquet=ecdysis_parquet,
                output_parquet=output_parquet,
                cache_dir=cache_dir,
            )

        first_result = pd.read_parquet(output_parquet)
        assert len(first_result) == 2

        # Second run: add a third record
        make_ecdysis_parquet(ecdysis_parquet, [(5001, "uuid-x"), (5002, "uuid-y"), (5003, "uuid-z")])

        # Clear cache so all 3 records need fetching — but uuid-x and uuid-y are in links.parquet (Level 1 skip)
        with patch('links.fetch.fetch_page', return_value=NO_ASSOC_HTML):
            run_pipeline(
                ecdysis_parquet=ecdysis_parquet,
                output_parquet=output_parquet,
                cache_dir=cache_dir,
            )

        second_result = pd.read_parquet(output_parquet)
        assert len(second_result) == 3, f"Expected 3 rows after merge, got {len(second_result)}"
        assert set(second_result["occurrenceID"].tolist()) == {"uuid-x", "uuid-y", "uuid-z"}
