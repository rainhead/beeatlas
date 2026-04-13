import csv
import io
import os
import time
import zipfile
from pathlib import Path
from urllib import parse

import dlt
import duckdb
import requests
from bs4 import BeautifulSoup

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))

ECDYSIS_BASE = "https://ecdysis.org/collections/individual/index.php"
RATE_LIMIT_SECONDS = 1 / 20  # max 20 req/sec


def _download_zip(dataset_id: int) -> bytes:
    params = {
        "schema": "symbiota",
        "identifications": "1",
        "images": "0",
        "identifiers": "1",
        "format": "tab",
        "cset": "utf-8",
        "zip": "1",
        "publicsearch": "1",
        "taxonFilterCode": 0,
        "sourcepage": "specimen",
        "searchvar": parse.urlencode({
            "usethes": "1",
            "taxontype": "4",
            "association-type": "none",
            "comingFrom": "newsearch",
            "datasetid": str(dataset_id),
        }),
        "submitaction": "",
    }
    response = requests.post(
        "https://ecdysis.org/collections/download/downloadhandler.php",
        data=parse.urlencode(params),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "curl/8.7.1",
        },
        timeout=120,
    )
    response.raise_for_status()
    return response.content


def _iter_tab_file(zf: zipfile.ZipFile, filename: str):
    """Yield rows from a file in the ZIP, auto-detecting delimiter via csv.Sniffer."""
    with zf.open(filename) as f:
        sample = f.read(4096).decode("utf-8")
    dialect = csv.Sniffer().sniff(sample, delimiters="\t,")
    with zf.open(filename) as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"), dialect=dialect)
        yield from reader


@dlt.source(name="ecdysis")
def ecdysis_source(dataset_id: int = dlt.config.value):
    """Load occurrence data from an Ecdysis (Symbiota) dataset.

    Args:
        dataset_id: Ecdysis dataset ID.
                    Auto-loaded from config.toml [sources.ecdysis] dataset_id.

    Example:
        pipeline.run(ecdysis_source())
        pipeline.run(ecdysis_source(dataset_id=44))
    """
    zip_bytes = _download_zip(dataset_id)

    @dlt.resource(name="occurrences", primary_key="id", write_disposition="replace")
    def occurrences():
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            yield from _iter_tab_file(zf, "occurrences.tab")

    @dlt.resource(name="identifications", primary_key="recordID", write_disposition="replace")
    def identifications():
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            yield from _iter_tab_file(zf, "identifications.tab")

    return occurrences(), identifications()


def _extract_inat_id(html: str | None) -> int | None:
    """Extract iNaturalist observation ID from Ecdysis specimen page HTML."""
    if not html:
        return None
    anchor = BeautifulSoup(html, "html.parser").select_one(
        '#association-div a[target="_blank"]'
    )
    if anchor:
        try:
            return int(anchor["href"].split("/")[-1])
        except (ValueError, IndexError, KeyError):
            pass
    return None


@dlt.source(name="ecdysis_links")
def ecdysis_links_source(
    db_path: str = dlt.config.value,
    html_cache_dir: str = dlt.config.value,
):
    """Scrape Ecdysis occurrence pages to extract iNaturalist observation links.

    Reads occurrences from ecdysis_data.occurrences in the destination DB,
    skips any occurrenceIDs already in occurrence_links, fetches/parses the
    rest (using an HTML disk cache), and yields {occurrenceID, host_observation_id}.

    Args:
        db_path: Path to beeatlas.duckdb.
                 Auto-loaded from config.toml [sources.ecdysis_links] db_path.
        html_cache_dir: Directory for caching raw HTML pages.
                        Auto-loaded from config.toml [sources.ecdysis_links] html_cache_dir.

    Example:
        pipeline.run(ecdysis_links_source())
    """
    @dlt.resource(name="occurrence_links", primary_key="occurrence_id", write_disposition="merge")
    def occurrence_links():
        cache_dir = Path(html_cache_dir)
        cache_dir.mkdir(parents=True, exist_ok=True)

        # Read occurrences and already-processed IDs upfront, then close connection
        # before dlt opens it for writing.
        con = duckdb.connect(db_path, read_only=True)
        all_occurrences = con.execute(
            "SELECT id, occurrence_id FROM ecdysis_data.occurrences"
        ).fetchall()
        try:
            already_done = {
                row[0] for row in con.execute(
                    "SELECT occurrence_id FROM ecdysis_data.occurrence_links"
                ).fetchall()
            }
        except Exception:
            already_done = set()
        con.close()

        to_process = [(eid, oid) for eid, oid in all_occurrences if oid not in already_done]
        print(f"[ecdysis_links] {len(to_process)} to process, {len(already_done)} already done")  # noqa: T201

        last_fetch_time = time.monotonic()
        for ecdysis_id, occurrence_id in to_process:
            cache_path = cache_dir / f"{ecdysis_id}.html"

            if cache_path.exists():
                html = cache_path.read_text(encoding="utf-8")
            else:
                elapsed = time.monotonic() - last_fetch_time
                if elapsed < RATE_LIMIT_SECONDS:
                    time.sleep(RATE_LIMIT_SECONDS - elapsed)
                try:
                    response = requests.get(
                        f"{ECDYSIS_BASE}?occid={int(ecdysis_id)}&clid=0",
                        headers={"User-Agent": "Mozilla/5.0 (compatible; beeatlas-data/1.0)"},
                        timeout=10,
                    )
                    response.raise_for_status()
                    html = response.text
                    cache_path.write_text(html, encoding="utf-8")
                except requests.RequestException:
                    html = None
                last_fetch_time = time.monotonic()

            obs_id = _extract_inat_id(html)

            yield {"occurrence_id": occurrence_id, "host_observation_id": obs_id}

    return occurrence_links()


def load_ecdysis() -> None:
    pipeline = dlt.pipeline(
        pipeline_name="ecdysis",
        destination=dlt.destinations.duckdb(DB_PATH),
        dataset_name="ecdysis_data",
    )
    load_info = pipeline.run(ecdysis_source())
    print(load_info)  # noqa: T201


def load_links() -> None:
    pipeline = dlt.pipeline(
        pipeline_name="ecdysis",
        destination=dlt.destinations.duckdb(DB_PATH),
        dataset_name="ecdysis_data",
    )
    load_info = pipeline.run(ecdysis_links_source(db_path=DB_PATH))
    print(load_info)  # noqa: T201


if __name__ == "__main__":
    load_ecdysis()
    load_links()
