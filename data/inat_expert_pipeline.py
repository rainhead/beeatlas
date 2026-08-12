"""Live loader for the expert iNat feed + identification detail (beeatlas-iek,
beeatlas-9sy).

Two resources into the `inat_expert_data` dlt dataset:

- `observations` — the expert-feed observation search (the same query
  data/raw/inat_expert_obs.sh replayed against the export form, now against the
  v2 API), with per-observation `identifications` detail that no export/GBIF/
  AWS-dump channel can provide. This is the sanctioned channel for
  identification data (beeatlas-9sy API-TOS note).
- `specimen_linked_observations` — the WABA specimen observations linked from
  Ecdysis rows (specimen_observation_id), fetched by batched id= lookup. These
  are NOT part of the expert feed query but their identifications corroborate
  Ecdysis determinations (ADR 0033 item 1: sources join via
  specimen_observation_id).

Operational rules (beeatlas-9sy comment, PHOTO-07):
- >= 1 s between requests, self-identifying User-Agent with contact + repo.
- Full sweep once (~160 requests for ~31.6k results at per_page=200), then
  cursor forward: `observations` is dlt-incremental on updated_at, so nightly
  cost is a handful of requests. The specimen-linked set is ~10 requests and is
  simply refetched.
- iNat caps the offset-pagination window at 10,000 rows (page 51 at
  per_page=200 returns HTTP 500), and this result set is ~31.6k — so the sweep
  uses id_above cursor pagination (order_by=id&order=asc), never page numbers.

The roster is READ FROM THE IDENTIFIER REGISTER (is_expert rows'
inat_login) — ADR 0033 item 5 makes the register the single expert-status
authority, superseding beeatlas-iek's older config.toml suggestion and the
EXPERTS array in inat_expert_obs.sh. CAVEAT carried from the .sh:
ident_user_id matches
observations the person has *an* identification on, not ones where they agree
with the community taxon. Roster membership means "an expert looked", never
"an expert vouches" — the per-identification rows this loader ingests are what
carry actual assertions (ADR 0033).

ARM 4 note: inat_obs_data.observations (the mart upstream) still reads the
committed CSV; rewiring it onto inat_expert_data.observations is the remainder
of beeatlas-iek.
"""
import csv
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterator, List

import dlt
import duckdb
import requests

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
REGISTER_PATH = Path(__file__).parent / "dbt" / "seeds" / "identifier_register.csv"

API_URL = "https://api.inaturalist.org/v2/observations"
USER_AGENT = "BeeAtlas/1.0 (rainhead@gmail.com; https://github.com/rainhead/beeatlas)"

_PACE_SECONDS = 1.0                # floor between successful requests (PHOTO-07)
_MAX_RETRIES = 5
_BACKOFF_BASE_SECONDS = 1.0
_PER_PAGE = 200

# v2 fields= selector. identifications.* rides each observation and dlt
# auto-normalizes the nested list into observations__identifications;
# taxon.ancestor_ids is stored PER IDENTIFICATION ROW so ancestor-or-self
# compatibility needs no further lookups (ADR 0030).
FIELDS = (
    "id,uuid,observed_on,created_at,updated_at,quality_grade,"
    "taxon.id,taxon.name,taxon.rank,"
    "geojson.coordinates,"
    "user.id,user.login,"
    "obscured,geoprivacy,positional_accuracy,license_code,"
    "photos.url,"
    "ofvs.field_id,ofvs.name,ofvs.value,"
    "identifications.uuid,identifications.current,identifications.category,"
    "identifications.own_observation,identifications.created_at,"
    "identifications.user.login,"
    "identifications.taxon.id,identifications.taxon.name,"
    "identifications.taxon.rank,identifications.taxon.ancestor_ids"
)

# The expert-feed observation search, mirroring inat_expert_obs.sh QUERY_PARAMS.
# The .sh carried quality_grade=any + identifications=any — export-form idioms
# for "no filter" that the v2 API REJECTS with 422 (its enums have no 'any');
# on the API, omission is "any", so needs-ID material still counts and the
# roster remains the only filter.
BASE_QUERY: Dict[str, Any] = {
    "geoprivacy": "open",            # skip obscured/private coordinates
    "taxon_geoprivacy": "open",      #   (both flavours of obscuring)
    "place_id": 46,                  # Washington
    "taxon_id": 630955,              # Anthophila (bees)
    "hrank": "genus",                # nothing coarser than genus
    "acc_below_or_unknown": 100,     # positional accuracy <=100 m, or unstated
}

_FLORAL_HOST_OFV = "associated species with names lookup"


def _get_with_retry(params: dict, *, timeout: int = 60) -> requests.Response:
    """GET with iNat-aware retry on 429/5xx; honors Retry-After when present.

    Same contract as inaturalist_pipeline._inat_get_with_retry, plus the
    self-identifying User-Agent this loader is required to send.
    """
    for attempt in range(_MAX_RETRIES + 1):
        resp = requests.get(
            API_URL, params=params, timeout=timeout,
            headers={"User-Agent": USER_AGENT},
        )
        if resp.status_code != 429 and resp.status_code < 500:
            resp.raise_for_status()
            return resp
        if attempt == _MAX_RETRIES:
            resp.raise_for_status()
            return resp  # unreachable; raise_for_status raises
        wait = _BACKOFF_BASE_SECONDS * (2 ** attempt)
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                wait = max(wait, float(retry_after))
            except ValueError:
                pass
        print(  # noqa: T201
            f"iNat HTTP {resp.status_code}; sleeping {wait:.1f}s before retry "
            f"{attempt + 1}/{_MAX_RETRIES}"
        )
        time.sleep(wait)
    raise RuntimeError("unreachable")


def _transform(item: Dict[str, Any]) -> Dict[str, Any]:
    """Flatten geojson to lat/lon, extract the floral-host OFV, stamp each
    identification with its observation id (so the dbt arm never needs the
    _dlt_parent_id join), and thumbnail-size the first photo URL."""
    coords = (item.pop("geojson", None) or {}).get("coordinates")
    if coords and len(coords) >= 2:
        item["longitude"] = float(coords[0])
        item["latitude"] = float(coords[1])

    ofvs = item.pop("ofvs", None) or []
    item["floral_host"] = next(
        (o.get("value") for o in ofvs
         if (o.get("name") or "").lower() == _FLORAL_HOST_OFV and o.get("value")),
        None,
    )

    photos = item.pop("photos", None) or []
    first_url = photos[0].get("url") if photos else None
    # v2 returns the square thumbnail; the CSV export carried medium.
    item["image_url"] = first_url.replace("square.", "medium.") if first_url else None

    for ident in item.get("identifications") or []:
        ident["observation_id"] = item.get("id")
        # dlt normalizes a list-of-scalars into a grandchild table; a
        # comma-joined string keeps ancestor_ids a plain column on the
        # identifications child table (dbt splits it back into a list).
        taxon = ident.get("taxon") or {}
        anc = taxon.pop("ancestor_ids", None)
        if anc is not None:
            taxon["ancestor_ids"] = ",".join(str(a) for a in anc)

    return item


def _sweep(extra_params: Dict[str, Any]) -> Iterator[Dict[str, Any]]:
    """id_above cursor sweep over the v2 observation search (10k-window-safe)."""
    id_above = 0
    while True:
        params = {
            **BASE_QUERY,
            **extra_params,
            "fields": FIELDS,
            "per_page": _PER_PAGE,
            "order_by": "id",
            "order": "asc",
            "id_above": id_above,
        }
        results = _get_with_retry(params).json().get("results", [])
        if not results:
            return
        for item in results:
            yield _transform(item)
        id_above = results[-1]["id"]
        if len(results) < _PER_PAGE:
            return
        time.sleep(_PACE_SECONDS)


def _specimen_linked_ids(con: duckdb.DuckDBPyConnection) -> List[int]:
    """WABA specimen observation ids linked from Ecdysis catalog rows.

    Same dbt_sandbox-with-raw-fallback shape as inat_obs_pipeline's dedup query
    (the view is absent on a first-ever run); field_id=18116 is the WABA
    catalog-number OFV.
    """
    try:
        rows = con.execute("""
            SELECT DISTINCT CAST(specimen_observation_id AS BIGINT)
            FROM dbt_sandbox.int_waba_link
            WHERE specimen_observation_id IS NOT NULL
        """).fetchall()
    except duckdb.CatalogException:
        rows = con.execute("""
            SELECT DISTINCT CAST(ofv.value AS BIGINT)
            FROM inaturalist_waba_data.observations__ofvs ofv
            WHERE ofv.field_id = 18116 AND ofv.value != '' AND ofv.value IS NOT NULL
        """).fetchall()
    return sorted(r[0] for r in rows)


def _expert_roster() -> List[str]:
    """iNat logins of register-flagged experts — the ident_user_id filter.

    The identifier register is the single expert-status authority (ADR 0033
    item 5); reading it here means a roster change is one seed-CSV edit.
    """
    with REGISTER_PATH.open(newline="") as f:
        return sorted(
            row["inat_login"].strip()
            for row in csv.DictReader(f)
            if row.get("is_expert", "").strip().lower() == "true"
            and (row.get("inat_login") or "").strip()
        )


@dlt.source(name="inat_expert")
def inat_expert_source(ident_user_ids: List[str] | None = None):
    """The expert feed + specimen-linked observations, identification detail
    included. Roster defaults to the identifier register's expert rows."""
    if ident_user_ids is None:
        ident_user_ids = _expert_roster()

    @dlt.resource(name="observations", primary_key="uuid", write_disposition="merge")
    def observations(
        updated=dlt.sources.incremental("updated_at", initial_value="2000-01-01T00:00:00+00:00"),
    ) -> Iterator[Dict[str, Any]]:
        extra = {"ident_user_id": ",".join(ident_user_ids)}
        # After the initial full sweep, only fetch what changed since the
        # cursor (minus a day of slack for clock skew) — the nightly is then a
        # handful of requests, per the 9sy operational rules.
        if updated.last_value and updated.last_value != updated.initial_value:
            extra["updated_since"] = updated.last_value
        yield from _sweep(extra)

    @dlt.resource(
        name="specimen_linked_observations",
        primary_key="uuid",
        write_disposition="merge",
    )
    def specimen_linked_observations() -> Iterator[Dict[str, Any]]:
        con = duckdb.connect(DB_PATH, read_only=True)
        try:
            obs_ids = _specimen_linked_ids(con)
        finally:
            con.close()
        # ~1.9k ids -> ~10 requests; simply refetched every run.
        for i in range(0, len(obs_ids), _PER_PAGE):
            batch = obs_ids[i:i + _PER_PAGE]
            params = {
                "id": ",".join(str(x) for x in batch),
                "fields": FIELDS,
                "per_page": _PER_PAGE,
            }
            for item in _get_with_retry(params).json().get("results", []):
                yield _transform(item)
            time.sleep(_PACE_SECONDS)

    return observations, specimen_linked_observations


def load_expert_observations() -> None:
    pipeline = dlt.pipeline(
        pipeline_name="inat_expert",
        destination=dlt.destinations.duckdb(DB_PATH),
        dataset_name="inat_expert_data",
    )
    load_info = pipeline.run(inat_expert_source())
    print(load_info)  # noqa: T201
    load_info.raise_on_failed_jobs()


if __name__ == "__main__":
    load_expert_observations()
