"""
iNaturalist download pipeline for the WA Bee Atlas project.

Run from the `data/` directory (all file paths are relative):
    uv run python inat/download.py

Full fetch: downloads all observations from project 166376.
Incremental fetch: uses updated_since when both samples.parquet and
    last_fetch.txt exist on disk.

Exports: fetch_all, fetch_since, obs_to_row, build_dataframe, merge_delta, main
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import pyinaturalist

from inat.observations import extract_specimen_count
from inat.projects import atlas_projects

# ── Constants ─────────────────────────────────────────────────────────────────

WA_PROJECT_ID = atlas_projects["wa"]  # 166376

SAMPLES_PATH = Path("samples.parquet")
LAST_FETCH_PATH = Path("last_fetch.txt")
NDJSON_PATH = Path("observations.ndjson")

DTYPE_MAP: dict[str, Any] = {
    "observation_id": "int64",
    "observer": pd.StringDtype(),
    "date": pd.StringDtype(),
    "lat": "float64",
    "lon": "float64",
    "specimen_count": pd.Int64Dtype(),
    "downloaded_at": pd.StringDtype(),
}

COLUMNS = list(DTYPE_MAP.keys())


# ── Fetch functions ───────────────────────────────────────────────────────────

def fetch_all() -> list:
    """Fetch all observations for the WA Bee Atlas project."""
    response = pyinaturalist.get_observations(
        project_id=WA_PROJECT_ID,
        page="all",
        per_page=200,
    )
    return response.get("results", []) if isinstance(response, dict) else list(response)


def fetch_since(timestamp: str) -> list:
    """Fetch observations updated since the given ISO timestamp."""
    response = pyinaturalist.get_observations(
        project_id=WA_PROJECT_ID,
        updated_since=timestamp,
        page="all",
        per_page=200,
    )
    return response.get("results", []) if isinstance(response, dict) else list(response)


# ── Row extraction ────────────────────────────────────────────────────────────

def obs_to_row(obs: dict) -> dict:
    """Extract a flat row dict from a raw iNaturalist API observation dict.

    Raw dict fields:
    - obs["id"] → int
    - obs["user"]["login"] → str
    - obs["observed_on"] → "YYYY-MM-DD" string
    - obs["location"] → [lat, lon] list of floats
    - obs["ofvs"] → list of ofv dicts
    """
    lat, lon = obs["location"]
    return {
        "observation_id": int(obs["id"]),
        "observer": obs["user"]["login"],
        "date": obs["observed_on"],
        "lat": float(lat),
        "lon": float(lon),
        "specimen_count": extract_specimen_count(obs.get("ofvs", [])),
    }


# ── DataFrame construction ────────────────────────────────────────────────────

def build_dataframe(results: list, downloaded_at: str | None = None) -> pd.DataFrame:
    """Build a typed DataFrame from a list of raw iNaturalist observation dicts.

    Args:
        results: Raw API observation dicts.
        downloaded_at: UTC ISO string to stamp every row. If None, column is pd.NA.
    """
    if not results:
        return pd.DataFrame({col: pd.array([], dtype=dtype) for col, dtype in DTYPE_MAP.items()})

    rows = [obs_to_row(obs) for obs in results if obs.get("location") is not None]
    df = pd.DataFrame(rows, columns=[c for c in COLUMNS if c != "downloaded_at"])

    # Apply explicit dtypes
    df["observation_id"] = df["observation_id"].astype("int64")
    df["observer"] = df["observer"].astype(pd.StringDtype())
    df["date"] = df["date"].astype(pd.StringDtype())
    df["lat"] = df["lat"].astype("float64")
    df["lon"] = df["lon"].astype("float64")
    df["specimen_count"] = df["specimen_count"].astype(pd.Int64Dtype())

    df["downloaded_at"] = pd.array([downloaded_at] * len(df), dtype=pd.StringDtype())

    return df


# ── Merge ─────────────────────────────────────────────────────────────────────

def merge_delta(existing: pd.DataFrame, delta: pd.DataFrame) -> pd.DataFrame:
    """Merge delta into existing, deduplicating by observation_id.

    Delta rows win over existing rows (keep='last') so incremental updates
    overwrite stale data.
    """
    return (
        pd.concat([existing, delta], ignore_index=True)
        .drop_duplicates(subset=["observation_id"], keep="last")
        .sort_values("observation_id")
        .reset_index(drop=True)
    )


# ── Main pipeline ─────────────────────────────────────────────────────────────

def main() -> None:
    """Run the iNat pipeline: full fetch or incremental, merge, write parquet."""
    incremental = SAMPLES_PATH.exists() and LAST_FETCH_PATH.exists()

    if incremental:
        last_fetch = LAST_FETCH_PATH.read_text().strip()
        print(f"[inat] Incremental fetch since {last_fetch}")
        try:
            results = fetch_since(last_fetch)
        except Exception as exc:
            print(f"[inat] WARNING: incremental fetch failed ({exc}); falling back to full fetch")
            incremental = False
            results = fetch_all()
    else:
        print("[inat] Full fetch")
        results = fetch_all()

    n_obs = len(results)
    n_pages = max(1, (n_obs + 199) // 200)
    print(f"[inat] Fetched {n_obs} observations (~{n_pages} pages)")

    # Write raw NDJSON cache before any filtering
    def _json_default(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")

    with NDJSON_PATH.open("w") as f:
        for obs in results:
            f.write(json.dumps(obs, default=_json_default) + "\n")

    now = datetime.now(timezone.utc).isoformat()
    delta = build_dataframe(results, downloaded_at=now)

    if incremental and SAMPLES_PATH.exists():
        existing = pd.read_parquet(SAMPLES_PATH, engine="pyarrow")
        merged = merge_delta(existing, delta)
    else:
        merged = delta

    total = len(merged)
    null_rate = merged["specimen_count"].isna().mean()
    print(f"[inat] Total in parquet: {total}")
    print(f"[inat] specimen_count null rate: {null_rate:.1%}")

    merged.to_parquet(SAMPLES_PATH, engine="pyarrow", index=False, compression="snappy")

    LAST_FETCH_PATH.write_text(now)
    print(f"[inat] Wrote {SAMPLES_PATH}, {NDJSON_PATH}, and {LAST_FETCH_PATH} ({now})")


if __name__ == "__main__":
    main()
