#!/usr/bin/env python
"""
Fetch iNaturalist observation IDs from Ecdysis specimen records.

For each WSDA_ specimen in ecdysis_wa.parquet, this script:
1. Fetches the Ecdysis individual record page (cached in data/raw/ecdysis_cache/)
2. Extracts the iNaturalist observation ID from the HTML
3. Outputs a mapping of occurrenceID → observation_id as Parquet

Rate-limited to avoid overloading Ecdysis servers.
"""

import time
import sys
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup

# Configuration
ECDYSIS_BASE_URL = "https://ecdysis.org/collections/individual/index.php"
ECDYSIS_CACHE_DIR = Path("data/raw/ecdysis_cache")
PROCESSED_DATA_DIR = Path("data/processed")
INPUT_PARQUET = PROCESSED_DATA_DIR / "ecdysis_wa.parquet"
OUTPUT_PARQUET = PROCESSED_DATA_DIR / "ecdysis_inat_links.parquet"

# Rate limiting: 0.05 seconds = 20 requests per second max
RATE_LIMIT_SECONDS = 0.05

ECDYSIS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_cache_path(occid):
    """Return path to cached HTML for a given occid."""
    return ECDYSIS_CACHE_DIR / f"{occid}.html"


def fetch_ecdysis_page(occid):
    """
    Fetch Ecdysis individual record page, caching the result.
    
    Returns the HTML content (from cache if available, otherwise fetched and cached).
    """
    cache_path = get_cache_path(occid)
    
    # Return from cache if it exists
    if cache_path.exists():
        with open(cache_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    # Fetch from server
    url = f"{ECDYSIS_BASE_URL}?occid={occid}&clid=0"
    print(f"  Fetching {occid}...", end='', flush=True)
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        html_content = response.text
    except requests.RequestException as e:
        print(f" ERROR: {e}")
        return None
    
    # Cache the result
    with open(cache_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(" ✓")
    return html_content


def extract_observation_id(html_content):
    """
    Extract iNaturalist observation ID from Ecdysis page HTML.
    
    Returns the observation ID (int) or None if not found.
    """
    if not html_content:
        return None
    
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        anchor = soup.select_one('#association-div a[target="_blank"]')
        
        if anchor and 'href' in anchor.attrs:
            # Extract ID from URL like https://www.inaturalist.org/observations/123456
            href = anchor['href']
            observation_id = href.split('/')[-1]
            return int(observation_id)
    except Exception as e:
        print(f"    Error parsing HTML: {e}")
    
    return None


def main():
    """Main logic: fetch iNat links for all WSDA_ records."""
    # Load the Ecdysis data
    print(f"Loading {INPUT_PARQUET}...")
    df = pd.read_parquet(INPUT_PARQUET)
    print(f"  {len(df)} records")
    
    # Extract unique occurrence IDs
    occurrence_ids = df['occurrenceID'].unique()
    print(f"  {len(occurrence_ids)} unique occurrenceIDs\n")
    
    # Check cache status
    cached_count = sum(1 for oid in occurrence_ids if get_cache_path(oid).exists())
    to_fetch = len(occurrence_ids) - cached_count
    print(f"Cache status: {cached_count} cached, {to_fetch} to fetch")
    
    if to_fetch > 0:
        print(f"Estimated time at {1/RATE_LIMIT_SECONDS:.0f} req/sec: {to_fetch * RATE_LIMIT_SECONDS:.1f}s\n")
    
    # Fetch pages and extract observation IDs
    results = []
    last_fetch_time = 0
    
    for i, occid in enumerate(occurrence_ids, 1):
        # Rate limiting
        elapsed = time.time() - last_fetch_time
        if elapsed < RATE_LIMIT_SECONDS:
            time.sleep(RATE_LIMIT_SECONDS - elapsed)
        
        # Progress
        cache_path = get_cache_path(occid)
        if cache_path.exists():
            status = "(cached)"
        else:
            status = ""
        
        if i % 100 == 0 or status == "":
            print(f"[{i}/{len(occurrence_ids)}] {status}")
        
        # Fetch and parse
        html = fetch_ecdysis_page(occid)
        observation_id = extract_observation_id(html)
        
        results.append({
            'occurrenceID': occid,
            'inat_observation_id': observation_id,
        })
        
        last_fetch_time = time.time()
    
    # Create result dataframe
    result_df = pd.DataFrame(results)
    
    # Convert to nullable int64 (allows NULL values)
    result_df['inat_observation_id'] = result_df['inat_observation_id'].astype('Int64')
    
    # Write output
    print(f"\nWriting {OUTPUT_PARQUET}...")
    result_df.to_parquet(
        OUTPUT_PARQUET,
        index=False,
        compression='snappy',
        engine='pyarrow',
    )
    
    # Summary statistics
    with_links = result_df['inat_observation_id'].notna().sum()
    without_links = result_df['inat_observation_id'].isna().sum()
    
    print(f"Results:")
    print(f"  {with_links} records with iNaturalist links")
    print(f"  {without_links} records without iNaturalist links")
    print(f"  File size: {OUTPUT_PARQUET.stat().st_size / 1024 / 1024:.1f} MB")
    print("\nDone!")


if __name__ == "__main__":
    main()
