"""
Links pipeline for the WA Bee Atlas project.

Reads ecdysis.parquet, fetches individual record pages from ecdysis.org,
extracts iNaturalist observation IDs via HTML scraping, and writes links.parquet.

Run from the `data/` directory:
    uv run python -m links.fetch

Exports: fetch_page, extract_observation_id, run_pipeline, get_cache_path,
         ECDYSIS_BASE, HEADERS, RATE_LIMIT_SECONDS, HTML_CACHE_DIR, OUTPUT_PARQUET, ECDYSIS_PARQUET
"""

from __future__ import annotations

import time
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup

# ── Constants ─────────────────────────────────────────────────────────────────

ECDYSIS_BASE: str = "https://ecdysis.org/collections/individual/index.php"
HEADERS: dict = {"User-Agent": "Mozilla/5.0 (compatible; beeatlas-data/1.0)"}
RATE_LIMIT_SECONDS: float = 1 / 20  # 0.05 seconds — max 20 req/sec
HTML_CACHE_DIR: Path = Path("raw/ecdysis_cache")   # relative to data/ working dir
OUTPUT_PARQUET: Path = Path("links.parquet")         # relative to data/ working dir
ECDYSIS_PARQUET: Path = Path("ecdysis.parquet")     # relative to data/ working dir


# ── Cache helpers ─────────────────────────────────────────────────────────────

def get_cache_path(ecdysis_id: int) -> Path:
    """Return the disk cache path for a given integer ecdysis_id.
    File named {ecdysis_id}.html inside HTML_CACHE_DIR."""
    return HTML_CACHE_DIR / f"{ecdysis_id}.html"


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_page(ecdysis_id: int) -> str | None:
    """Fetch the Ecdysis individual record page for the given integer ecdysis_id.
    URL: {ECDYSIS_BASE}?occid={ecdysis_id}&clid=0
    Uses HEADERS. Returns HTML text on 200, None on error."""
    url = f"{ECDYSIS_BASE}?occid={ecdysis_id}&clid=0"
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
        return response.text
    except requests.RequestException:
        return None


# ── Parse ─────────────────────────────────────────────────────────────────────

def extract_observation_id(html: str | None) -> int | None:
    """Parse HTML and extract integer iNat observation ID.
    Selector: #association-div a[target="_blank"]
    Returns None if html is None, element absent, or href not parseable."""
    if html is None:
        return None
    soup = BeautifulSoup(html, "html.parser")
    anchor = soup.select_one('#association-div a[target="_blank"]')
    if anchor is None:
        return None
    href = anchor.get("href", "")
    try:
        return int(href.split("/")[-1])
    except (ValueError, IndexError):
        return None


# ── Pipeline ──────────────────────────────────────────────────────────────────

def run_pipeline(
    ecdysis_parquet: Path = ECDYSIS_PARQUET,
    output_parquet: Path = OUTPUT_PARQUET,
    cache_dir: Path = HTML_CACHE_DIR,
) -> None:
    """Full pipeline: read ecdysis.parquet, apply two-level skip, fetch/parse, write links.parquet."""
    # Read ecdysis records (ecdysis_id is integer, occurrenceID is string)
    ecdysis_df = pd.read_parquet(ecdysis_parquet, columns=["ecdysis_id", "occurrenceID"])

    # Load existing links.parquet for Level 1 skip
    if output_parquet.exists():
        existing_df = pd.read_parquet(output_parquet)
        already_linked = set(existing_df["occurrenceID"].dropna())
    else:
        existing_df = pd.DataFrame({
            "occurrenceID": pd.array([], dtype=pd.StringDtype()),
            "inat_observation_id": pd.array([], dtype=pd.Int64Dtype()),
        })
        already_linked: set[str] = set()

    # Ensure cache_dir exists
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Count skips for progress reporting
    skip1 = sum(1 for occ in ecdysis_df["occurrenceID"] if occ in already_linked)
    skip2 = 0
    to_fetch = 0
    for _, row in ecdysis_df.iterrows():
        if row["occurrenceID"] in already_linked:
            continue
        cache_path = cache_dir / f"{row['ecdysis_id']}.html"
        if cache_path.exists():
            skip2 += 1
        else:
            to_fetch += 1

    print(f"[links] Fetching {to_fetch} records ({skip1} already linked, {skip2} cached)")

    # Process all records, accumulate results in memory
    new_rows: list[dict] = []
    last_fetch_time: float = time.monotonic()  # ensures first request respects rate limit

    for _, row in ecdysis_df.iterrows():
        ecdysis_id = int(row["ecdysis_id"])
        occurrence_id = str(row["occurrenceID"])

        # Level 1 skip: already in links.parquet
        if occurrence_id in already_linked:
            continue

        # Level 2 skip: HTML already on disk
        cache_path = cache_dir / f"{ecdysis_id}.html"
        if cache_path.exists():
            html = cache_path.read_text(encoding="utf-8")
        else:
            # Enforce rate limit only before actual HTTP requests
            elapsed = time.monotonic() - last_fetch_time
            if elapsed < RATE_LIMIT_SECONDS:
                time.sleep(RATE_LIMIT_SECONDS - elapsed)
            html = fetch_page(ecdysis_id)
            last_fetch_time = time.monotonic()

            # Cache to disk (even if None — skip caching on error)
            if html is not None:
                cache_path.write_text(html, encoding="utf-8")

        obs_id = extract_observation_id(html)
        new_rows.append({
            "occurrenceID": occurrence_id,
            "inat_observation_id": obs_id,
        })

    # Build new DataFrame with explicit dtypes
    new_df = pd.DataFrame({
        "occurrenceID": pd.array(
            [r["occurrenceID"] for r in new_rows], dtype=pd.StringDtype()
        ),
        "inat_observation_id": pd.array(
            [r["inat_observation_id"] for r in new_rows], dtype=pd.Int64Dtype()
        ),
    })

    # Merge with existing (new results win on duplicate occurrenceID)
    combined = (
        pd.concat([existing_df, new_df], ignore_index=True)
        .drop_duplicates(subset=["occurrenceID"], keep="last")
        .reset_index(drop=True)
    )

    # Enforce column dtypes on the merged result
    combined = combined.astype({
        "occurrenceID": pd.StringDtype(),
        "inat_observation_id": pd.Int64Dtype(),
    })

    # Write once at end (atomic accumulate-then-write pattern)
    combined.to_parquet(output_parquet, engine="pyarrow", index=False, compression="snappy")
    print(f"[links] Wrote {output_parquet} ({len(combined)} rows)")


if __name__ == "__main__":
    run_pipeline()
