import csv
import io
import json
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

# On-disk cache for the Ecdysis ZIP download. The server-side ZIP build takes
# ~2 minutes which dominates the pipeline runtime during dev iteration. The
# cache is keyed by dataset_id and expires by mtime. Default TTL is 6 hours so
# the nightly cron (24h interval) always sees fresh data, while same-day dev
# iteration reuses the cached ZIP. Set ECDYSIS_CACHE_TTL_SECONDS=0 to force a
# refetch on the next call.
ECDYSIS_CACHE_DIR = Path(os.environ.get(
    "ECDYSIS_CACHE_DIR",
    str(Path(__file__).parent / ".ecdysis_cache"),
))
ECDYSIS_CACHE_TTL_SECONDS = int(os.environ.get("ECDYSIS_CACHE_TTL_SECONDS", "21600"))


# Ecdysis/Symbiota now requires an authenticated session for the dataset-44 bulk
# download (anonymous publicsearch=1 POSTs return 401 {"error":"Unauthorized access"}).
# The login form has NO CSRF token (no pre-GET needed); the real credential form's
# submit control is `action=login` and its username field is `login` (verified live
# 2026-06-24 — see 163-RESEARCH.md Q1). Credentials live in data/.dlt/secrets.toml
# [sources.ecdysis] (gitignored, maderas-only) and are NEVER logged.
ECDYSIS_LOGIN_URL = "https://ecdysis.org/profile/index.php"
ECDYSIS_DOWNLOAD_URL = "https://ecdysis.org/collections/download/downloadhandler.php"
_ZIP_MAGIC = b"PK\x03\x04"  # ZIP local-file-header magic bytes

# --- Cheap source change-probe (skip the ~2-minute ZIP build when nothing moved) -
# The server-side ZIP build is the pipeline's dominant cost, and past the mtime TTL
# the loader used to pay it unconditionally (nightly always downloads). Ecdysis's v2
# occurrence API lets us instead ask two cheap, UNAUTHENTICATED questions about the
# SAME population the ZIP pulls — scoped by datasetID (dataset 44 is a subset of the
# WSUC collection, so datasetID — not collid — is the correct scope):
#
#   * total count           -> catches deletions / net membership changes
#   * modified-since count   -> catches adds + edits (omoccurrences.dateLastModified
#                               is bumped on every edit and is populated on 100% of
#                               dataset-44 records, so adds/edits of records OUTSIDE
#                               the baseline window are always caught)
#
# If NEITHER moved since the cached ZIP was pulled, reuse the cache — letting even the
# nightly skip an unchanged source. Two known blind spots remain, both rare and both
# healed by the next full pull:
#   - a re-edit of a record ALREADY inside the baseline `since` window: its
#     dateLastModified stays >= since, so the modified-since COUNT is unchanged (and
#     total is flat), so the probe skips. The window is only ~1 day wide, so this is
#     limited to same-day-hot records edited again before any other change trips it.
#   - a same-interval compensating replace (N deleted + N inserted, total flat) whose
#     inserts carry back-dated dateLastModified.
#
# API quirk (verified live 2026-07-23): dateLastModifiedMin WITHOUT a Max returns
# HTTP 500 (a loose whereRaw binding in OccurrenceController), so probe calls always
# pass a far-future Max, turning the bound into a plain "modified since" filter.
ECDYSIS_API_URL = "https://ecdysis.org/api/v2/occurrence"
_API_FAR_FUTURE = "2999-01-01"
# Set ECDYSIS_SKIP_PROBE=0 to disable the probe and keep the download-every-time-
# past-TTL behaviour.
ECDYSIS_SKIP_PROBE = os.environ.get("ECDYSIS_SKIP_PROBE", "1") != "0"


def _api_occurrence_count(**filters) -> int:
    """Return the v2 API's reported occurrence `count` for `filters` (e.g.
    datasetID=44, dateLastModifiedMin=..., dateLastModifiedMax=...).

    Cheap, unauthenticated GET — limit=1, we read only the total `count`. Raises on
    any transport/JSON error so a failed probe is treated as "unknown → must
    download", never as a silent green light to reuse a stale cache.
    """
    resp = requests.get(
        ECDYSIS_API_URL,
        params={"limit": 1, **filters},
        headers={"User-Agent": "beeatlas-data/1.0"},
        timeout=30,
    )
    resp.raise_for_status()
    return int(resp.json()["count"])


def _api_changed_since_count(dataset_id: int, since: str) -> int:
    """Count dataset-`dataset_id` occurrences modified since `since` (YYYY-MM-DD).

    Always pairs the min bound with a far-future Max: the v2 API's dateLastModifiedMin
    ALONE returns HTTP 500 (see the module note above), so the Max is mandatory, not
    cosmetic. Single home for that quirk-knowledge.
    """
    return _api_occurrence_count(
        datasetID=dataset_id,
        dateLastModifiedMin=since,
        dateLastModifiedMax=_API_FAR_FUTURE,
    )


def _probe_sidecar_path(dataset_id: int) -> Path:
    """Path to the per-dataset probe-baseline sidecar (JSON) beside the cached ZIP."""
    return ECDYSIS_CACHE_DIR / f"{dataset_id}.probe.json"


def _record_probe_baseline(dataset_id: int) -> None:
    """Snapshot the source's change-signals right after a successful full download,
    so a later run can cheaply tell whether anything moved.

    `since` is pulled back one day so day-boundary/timezone skew between us and the
    server can never push a post-download edit below the min bound. We store the
    modified-since count AT DOWNLOAD TIME as a baseline (not zero): every record in
    that window is already captured in the fresh ZIP, so "changed" later means the
    count GREW past this baseline. Best-effort — a probe hiccup here must not fail
    the (already successful) download; it just means the next run can't skip.
    """
    try:
        since = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 86400))
        meta = {
            "dataset_id": dataset_id,
            "since": since,
            "total": _api_occurrence_count(datasetID=dataset_id),
            "baseline_changed": _api_changed_since_count(dataset_id, since),
        }
        _probe_sidecar_path(dataset_id).write_text(json.dumps(meta))
    except Exception as e:  # noqa: BLE001 — probe is advisory; never break the download
        print(f"  WARNING: could not record Ecdysis probe baseline ({e})")  # noqa: T201


def _probe_says_unchanged(dataset_id: int) -> bool:
    """True iff both change-signals still match the baseline recorded at the last
    download — i.e. the source looks unchanged and the cached ZIP is safe to reuse.

    Conservative by construction: no baseline, a probe error, or EITHER signal
    having moved all return False so the caller downloads.
    """
    sidecar = _probe_sidecar_path(dataset_id)
    if not sidecar.exists():
        return False
    try:
        meta = json.loads(sidecar.read_text())
        if _api_occurrence_count(datasetID=dataset_id) != meta["total"]:
            return False  # a deletion / membership change
        changed = _api_changed_since_count(dataset_id, meta["since"])
        return changed == meta["baseline_changed"]  # no new adds/edits
    except Exception as e:  # noqa: BLE001 — uncertainty ⇒ download
        print(f"  Ecdysis change-probe failed ({e}); will download")  # noqa: T201
        return False


def _get_credentials() -> tuple[str, str]:
    """Read (username, password) from data/.dlt/secrets.toml [sources.ecdysis].

    Bracket access (not .get) so a missing key fails loudly when creds aren't
    provisioned. Standalone module-level function so tests can monkeypatch this seam
    instead of touching dlt.secrets.
    """
    return (
        dlt.secrets["sources.ecdysis.username"],
        dlt.secrets["sources.ecdysis.password"],
    )


def _login_session(session: requests.Session, username: str, password: str) -> None:
    """Authenticate the Symbiota session in place by POSTing the real credential form.

    Credentials are passed in (resolved by the caller BEFORE the resilience try) so a
    missing/misprovisioned credential fails loudly instead of being swallowed by the
    cache-fallback. The password is NEVER interpolated into any log/print/exception
    (V7). The download response guard — not this login response — is the authoritative
    success signal (163-RESEARCH.md Q2), so the login HTML is not parsed for a marker.
    """
    session.post(
        ECDYSIS_LOGIN_URL,
        data={
            "login": username,
            "password": password,
            "action": "login",
            "remember": "0",
        },
        headers={"User-Agent": "curl/8.7.1"},
        timeout=120,
    )


def _assert_zip_response(response: requests.Response) -> None:
    """Raise loudly unless `response` is a real ZIP, so a JSON/401 error body is never
    cached as a corrupt ZIP. Never includes credentials in the message."""
    response.raise_for_status()
    content_type = response.headers.get("Content-Type", "")
    if "application/json" in content_type or "text/html" in content_type:
        raise RuntimeError(
            f"Ecdysis download returned {content_type!r}, not a ZIP: "
            f"{response.content[:200]!r}"
        )
    if not response.content.startswith(_ZIP_MAGIC):
        raise RuntimeError(
            "Ecdysis download body is not a ZIP (missing PK\\x03\\x04 magic): "
            f"{response.content[:200]!r}"
        )


def _is_valid_cached_zip(path: Path) -> bool:
    """True iff `path` exists, is non-empty, and opens as a ZIP with no corrupt members."""
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        with zipfile.ZipFile(path) as zf:
            return zf.testzip() is None
    except zipfile.BadZipFile:
        return False


def _download_zip(dataset_id: int) -> bytes:
    cache_path = ECDYSIS_CACHE_DIR / f"{dataset_id}.zip"
    if ECDYSIS_CACHE_TTL_SECONDS > 0 and cache_path.exists():
        age = time.time() - cache_path.stat().st_mtime
        if age < ECDYSIS_CACHE_TTL_SECONDS:
            print(  # noqa: T201
                f"  Using cached Ecdysis ZIP ({cache_path.stat().st_size / 1024**2:.1f} MB, "
                f"age {age/60:.0f}min, TTL {ECDYSIS_CACHE_TTL_SECONDS/60:.0f}min)"
            )
            return cache_path.read_bytes()

    # Past the TTL window (e.g. the nightly): rather than unconditionally paying the
    # ~2-minute server-side ZIP build, ask the source whether anything actually moved.
    # Only trust the probe against a cache that still opens as a valid ZIP.
    if (ECDYSIS_SKIP_PROBE and _is_valid_cached_zip(cache_path)
            and _probe_says_unchanged(dataset_id)):
        print(  # noqa: T201
            "  Ecdysis source unchanged since last pull (change-probe); reusing cached ZIP"
        )
        return cache_path.read_bytes()

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
    # Resolve credentials BEFORE the resilience try (WR-01): a missing or
    # misprovisioned credential must fail loudly per _get_credentials' contract,
    # not be silently masked by the cache-fallback when a (possibly stale) cache
    # exists. This is the exact silent-staleness trap D-3 is meant to avoid.
    username, password = _get_credentials()
    try:
        session = requests.Session()
        _login_session(session, username, password)
        response = session.post(
            ECDYSIS_DOWNLOAD_URL,
            data=parse.urlencode(params),
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "curl/8.7.1",
            },
            timeout=120,
        )
        _assert_zip_response(response)
    except Exception as e:  # login / download / guard / network failure
        # Degrade gracefully (D-3): reuse a valid cached ZIP rather than zeroing out
        # the nightly. The exception `e` carries no credentials (login/guard never
        # interpolate the password), so it is safe to print.
        if _is_valid_cached_zip(cache_path):
            print(  # noqa: T201
                f"  WARNING: Ecdysis download failed ({e}); reusing cached ZIP "
                f"at {cache_path}"
            )
            return cache_path.read_bytes()
        raise  # no usable cache → hard-fail loudly

    # Atomic write so a kill mid-download can't leave a half-written cache file.
    ECDYSIS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = cache_path.with_suffix(".zip.tmp")
    tmp_path.write_bytes(response.content)
    tmp_path.replace(cache_path)
    # Record the change-signals for this fresh pull so the next run can skip if the
    # source stays put. Advisory: failure here never affects the returned bytes.
    _record_probe_baseline(dataset_id)
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
