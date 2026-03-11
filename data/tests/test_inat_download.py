"""
Tests for data/inat/download.py

Run from data/ directory:
  uv run pytest tests/test_inat_download.py
"""

import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
from pathlib import Path


# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_mock_obs(
    obs_id: int = 1,
    login: str = "testuser",
    observed_on: str = "2024-06-15",
    lat: float = 47.6,
    lon: float = -120.5,
    ofvs: list | None = None,
) -> dict:
    """Create a plain dict matching the raw iNaturalist API observation shape."""
    return {
        "id": obs_id,
        "user": {"login": login},
        "observed_on": observed_on,
        "location": (lat, lon),
        "ofvs": ofvs or [],
    }


def make_ofv(field_id: int, value: str):
    return {"field_id": field_id, "value": value}


# ── obs_to_row tests ─────────────────────────────────────────────────────────

class TestObsToRow:
    def test_extracts_basic_fields(self):
        from inat.download import obs_to_row
        obs = make_mock_obs(obs_id=42, login="alice", lat=47.1, lon=-122.3)
        row = obs_to_row(obs)
        assert row["observation_id"] == 42
        assert row["observer"] == "alice"
        assert row["lat"] == 47.1
        assert row["lon"] == -122.3

    def test_date_is_string(self):
        from inat.download import obs_to_row
        obs = make_mock_obs(observed_on="2024-07-04")
        row = obs_to_row(obs)
        assert row["date"] == "2024-07-04"

    def test_specimen_count_present(self):
        from inat.download import obs_to_row
        obs = make_mock_obs(ofvs=[make_ofv(8338, "5")])
        row = obs_to_row(obs)
        assert row["specimen_count"] == 5

    def test_specimen_count_absent_is_none(self):
        from inat.download import obs_to_row
        obs = make_mock_obs(ofvs=[])
        row = obs_to_row(obs)
        assert row["specimen_count"] is None

    def test_specimen_count_wrong_field_id_is_none(self):
        from inat.download import obs_to_row
        obs = make_mock_obs(ofvs=[make_ofv(9999, "3")])
        row = obs_to_row(obs)
        assert row["specimen_count"] is None


# ── build_dataframe tests ────────────────────────────────────────────────────

class TestBuildDataframe:
    def _make_results(self, n: int = 2):
        results = []
        for i in range(n):
            obs = make_mock_obs(
                obs_id=i + 1,
                login=f"user{i}",
                lat=47.0 + i,
                lon=-120.0 - i,
                ofvs=[make_ofv(8338, str(i + 1))] if i % 2 == 0 else [],
            )
            results.append(obs)
        return results

    def test_returns_dataframe(self):
        from inat.download import build_dataframe
        df = build_dataframe(self._make_results())
        assert isinstance(df, pd.DataFrame)

    def test_column_names(self):
        from inat.download import build_dataframe
        df = build_dataframe(self._make_results())
        assert set(df.columns) == {"observation_id", "observer", "date", "lat", "lon", "specimen_count", "downloaded_at"}

    def test_dtypes(self):
        from inat.download import build_dataframe
        df = build_dataframe(self._make_results(2))
        assert df["observation_id"].dtype == "int64"
        assert df["observer"].dtype == pd.StringDtype()
        assert df["date"].dtype == pd.StringDtype()
        assert df["lat"].dtype == "float64"
        assert df["lon"].dtype == "float64"
        assert df["specimen_count"].dtype == pd.Int64Dtype()
        assert df["downloaded_at"].dtype == pd.StringDtype()

    def test_empty_results_returns_empty_df(self):
        from inat.download import build_dataframe
        df = build_dataframe([])
        assert len(df) == 0
        assert set(df.columns) == {"observation_id", "observer", "date", "lat", "lon", "specimen_count", "downloaded_at"}

    def test_nullable_specimen_count(self):
        from inat.download import build_dataframe
        results = [
            make_mock_obs(obs_id=1, ofvs=[make_ofv(8338, "3")]),
            make_mock_obs(obs_id=2, ofvs=[]),
        ]
        df = build_dataframe(results)
        assert df.loc[df.observation_id == 1, "specimen_count"].iloc[0] == 3
        assert pd.isna(df.loc[df.observation_id == 2, "specimen_count"].iloc[0])


# ── downloaded_at tests ──────────────────────────────────────────────────────

class TestBuildDataframeDownloadedAt:
    def test_downloaded_at_set_when_provided(self):
        from inat.download import build_dataframe
        obs = make_mock_obs()
        df = build_dataframe([obs], downloaded_at="2024-06-15T00:00:00+00:00")
        assert df["downloaded_at"].iloc[0] == "2024-06-15T00:00:00+00:00"

    def test_downloaded_at_na_when_not_provided(self):
        from inat.download import build_dataframe
        obs = make_mock_obs()
        df = build_dataframe([obs])
        assert pd.isna(df["downloaded_at"].iloc[0])


# ── merge_delta tests ────────────────────────────────────────────────────────

def make_df(**kwargs):
    """Helper: build a minimal parquet-schema DataFrame from column arrays."""
    n = len(next(iter(kwargs.values())))
    defaults = {
        "observation_id": pd.array(range(1, n + 1), dtype="int64"),
        "observer": pd.array(["x"] * n, dtype=pd.StringDtype()),
        "date": pd.array(["2024-01-01"] * n, dtype=pd.StringDtype()),
        "lat": pd.array([47.0] * n, dtype="float64"),
        "lon": pd.array([-120.0] * n, dtype="float64"),
        "specimen_count": pd.array([None] * n, dtype="Int64"),
        "downloaded_at": pd.array([None] * n, dtype=pd.StringDtype()),
    }
    defaults.update(kwargs)
    return pd.DataFrame(defaults)


class TestMergeDelta:
    def test_deduplicates_by_observation_id(self):
        from inat.download import merge_delta
        existing = make_df(
            observation_id=pd.array([1], dtype="int64"),
            specimen_count=pd.array([1], dtype="Int64"),
        )
        delta = make_df(
            observation_id=pd.array([1, 2], dtype="int64"),
            specimen_count=pd.array([2, None], dtype="Int64"),
        )
        merged = merge_delta(existing, delta)
        assert len(merged) == 2

    def test_delta_wins_on_duplicate(self):
        from inat.download import merge_delta
        existing = make_df(
            observation_id=pd.array([1], dtype="int64"),
            specimen_count=pd.array([1], dtype="Int64"),
        )
        delta = make_df(
            observation_id=pd.array([1], dtype="int64"),
            specimen_count=pd.array([2], dtype="Int64"),
        )
        merged = merge_delta(existing, delta)
        assert merged.loc[merged.observation_id == 1, "specimen_count"].iloc[0] == 2

    def test_sorted_by_observation_id(self):
        from inat.download import merge_delta
        existing = make_df(observation_id=pd.array([3], dtype="int64"))
        delta = make_df(observation_id=pd.array([1, 5], dtype="int64"))
        merged = merge_delta(existing, delta)
        assert list(merged["observation_id"]) == [1, 3, 5]

    def test_index_reset(self):
        from inat.download import merge_delta
        existing = make_df(observation_id=pd.array([1, 2], dtype="int64"))
        delta = make_df(observation_id=pd.array([3, 4], dtype="int64"))
        merged = merge_delta(existing, delta)
        assert list(merged.index) == [0, 1, 2, 3]


# ── main() NDJSON writing test ───────────────────────────────────────────────

class TestMain:
    def test_main_writes_ndjson(self, tmp_path):
        """main() writes observations.ndjson with one line per fetched result."""
        import json
        import inat.download as dl

        results = [
            {"id": 1, "user": {"login": "u"}, "observed_on": "2024-01-01", "location": [47.0, -120.0], "ofvs": []},
            {"id": 2, "user": {"login": "v"}, "observed_on": "2024-01-02", "location": [48.0, -121.0], "ofvs": []},
        ]

        ndjson_path = tmp_path / "observations.ndjson"
        samples_path = tmp_path / "samples.parquet"
        last_fetch_path = tmp_path / "last_fetch.txt"

        original_ndjson = dl.NDJSON_PATH
        original_samples = dl.SAMPLES_PATH
        original_last_fetch = dl.LAST_FETCH_PATH

        dl.NDJSON_PATH = ndjson_path
        dl.SAMPLES_PATH = samples_path
        dl.LAST_FETCH_PATH = last_fetch_path

        try:
            with patch("inat.download.fetch_all", return_value=results):
                dl.main()
        finally:
            dl.NDJSON_PATH = original_ndjson
            dl.SAMPLES_PATH = original_samples
            dl.LAST_FETCH_PATH = original_last_fetch

        assert ndjson_path.exists()
        lines = ndjson_path.read_text().strip().splitlines()
        assert len(lines) == 2
        for line in lines:
            obj = json.loads(line)
            assert "id" in obj


# ── Importable exports ───────────────────────────────────────────────────────

class TestExports:
    def test_all_exports_importable(self):
        from inat.download import (
            fetch_all,
            fetch_since,
            obs_to_row,
            build_dataframe,
            merge_delta,
            main,
        )
        assert all(callable(f) for f in [fetch_all, fetch_since, obs_to_row, build_dataframe, merge_delta, main])
