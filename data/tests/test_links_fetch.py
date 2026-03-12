"""
Tests for data/links/fetch.py

Run from data/ directory:
  uv run pytest tests/test_links_fetch.py
"""

import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
from pathlib import Path


class TestFetchPage:
    def test_uses_integer_occid_in_url(self):
        from links.fetch import fetch_page
        pytest.fail("not implemented")

    def test_sets_user_agent_header(self):
        from links.fetch import fetch_page
        pytest.fail("not implemented")


class TestRateLimit:
    def test_no_sleep_for_cached_records(self):
        from links.fetch import run_pipeline
        pytest.fail("not implemented")


class TestExtractObservationId:
    def test_extracts_id_from_association_div(self):
        from links.fetch import extract_observation_id
        pytest.fail("not implemented")

    def test_returns_none_when_absent(self):
        from links.fetch import extract_observation_id
        pytest.fail("not implemented")


class TestFirstLevelSkip:
    def test_skips_occurrenceid_already_in_links_parquet(self):
        from links.fetch import run_pipeline
        pytest.fail("not implemented")


class TestSecondLevelSkip:
    def test_parses_cached_html_without_http_request(self):
        from links.fetch import run_pipeline
        pytest.fail("not implemented")


class TestOutput:
    def test_output_has_two_columns_with_correct_dtypes(self):
        from links.fetch import run_pipeline
        pytest.fail("not implemented")

    def test_output_covers_all_occurrence_ids_via_merge(self):
        from links.fetch import run_pipeline
        pytest.fail("not implemented")
