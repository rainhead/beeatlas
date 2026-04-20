import os
from pathlib import Path
from typing import Any, Dict

import dlt
import duckdb
import requests
from dlt.sources.rest_api import RESTAPIConfig, rest_api_resources

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))


def _transform(item: Dict[str, Any]) -> Dict[str, Any]:
    """Extract longitude/latitude from geojson, and build observation_projects join rows."""
    item["is_deleted"] = False

    coords = (item.pop("geojson", None) or {}).get("coordinates")
    if coords and len(coords) >= 2:
        item["longitude"] = float(coords[0])
        item["latitude"] = float(coords[1])

    uuid = item.get("uuid")
    project_ids = item.pop("project_ids", None) or []
    item["observation_projects"] = [
        {"observation_uuid": uuid, "project_id": pid} for pid in project_ids
    ]

    return item


DEFAULT_FIELDS = (
    "id,uuid,observed_on,created_at,updated_at,quality_grade,"
    "taxon.id,taxon.name,taxon.rank,"
    "taxon.iconic_taxon_name,taxon.threatened,taxon.endemic,taxon.introduced,"
    "place_guess,geojson.coordinates,"
    "user.id,user.login,"
    "description,obscured,geoprivacy,"
    "positional_accuracy,captive,out_of_range,"
    "num_identification_agreements,num_identification_disagreements,"
    "license_code,"
    "ofvs.uuid,ofvs.field_id,ofvs.name,ofvs.value,ofvs.datatype,"
    "project_ids"
)


@dlt.source(name="waba")
def waba_source(
    write_disposition: str = "merge",
    fields: str = DEFAULT_FIELDS,
) -> None:
    """Load WABA-catalogued observations from the iNaturalist v2 API.

    Uses the `field:WABA=` filter to fetch observations that have any value
    for the WABA observation field (field_id=18116).
    """
    config: RESTAPIConfig = {
        "client": {
            "base_url": "https://api.inaturalist.org/v2/",
        },
        "resource_defaults": {
            "primary_key": "uuid",
            "write_disposition": write_disposition,
        },
        "resources": [
            {
                "name": "observations",
                "endpoint": {
                    "path": "observations",
                    "params": {
                        "field:WABA": "",
                        "fields": fields,
                        "per_page": 200,
                        "updated_since": "{incremental.start_value}",
                    },
                    "incremental": {
                        "cursor_path": "updated_at",
                        "initial_value": "2000-01-01T00:00:00+00:00",
                    },
                    "data_selector": "results",
                    "paginator": {
                        "type": "page_number",
                        "base_page": 1,
                        "page_param": "page",
                        "total_path": None,
                        "stop_after_empty_page": True,
                    },
                },
                "columns": {
                    "geoprivacy": {"data_type": "text"},
                    "observed_on": {"data_type": "date"},
                    "positional_accuracy": {"data_type": "bigint"},
                    "captive": {"data_type": "bool"},
                    "out_of_range": {"data_type": "bool"},
                    "num_identification_agreements": {"data_type": "bigint"},
                    "num_identification_disagreements": {"data_type": "bigint"},
                    "taxon__threatened": {"data_type": "bool"},
                    "taxon__endemic": {"data_type": "bool"},
                    "taxon__introduced": {"data_type": "bool"},
                },
                "processing_steps": [
                    {"map": _transform},
                ],
            }
        ],
    }
    yield from rest_api_resources(config)


def enrich_taxon_lineage(db_path: str) -> None:
    """Fetch genus and family for all WABA observation taxon IDs via the iNat taxa endpoint.

    Creates/replaces inaturalist_waba_data.taxon_lineage(taxon_id, genus, family).
    export.py joins against this table to populate specimen_inat_genus and specimen_inat_family.
    """
    con = duckdb.connect(db_path)
    taxon_ids = [
        row[0] for row in con.execute(
            "SELECT DISTINCT taxon__id FROM inaturalist_waba_data.observations WHERE taxon__id IS NOT NULL"
        ).fetchall()
    ]
    if not taxon_ids:
        print("taxon_lineage: no taxon IDs found, skipping")  # noqa: T201
        con.close()
        return

    lineage: dict[int, dict] = {}
    batch_size = 30
    for i in range(0, len(taxon_ids), batch_size):
        batch = taxon_ids[i : i + batch_size]
        ids_path = ",".join(map(str, batch))
        resp = requests.get(
            f"https://api.inaturalist.org/v2/taxa/{ids_path}",
            params={"fields": "id,name,rank,ancestors.name,ancestors.rank"},
            timeout=30,
        )
        resp.raise_for_status()
        for taxon in resp.json().get("results", []):
            genus = taxon["name"] if taxon.get("rank") == "genus" else None
            family = taxon["name"] if taxon.get("rank") == "family" else None
            for anc in taxon.get("ancestors", []):
                if anc.get("rank") == "genus" and genus is None:
                    genus = anc["name"]
                elif anc.get("rank") == "family" and family is None:
                    family = anc["name"]
            lineage[taxon["id"]] = {"genus": genus, "family": family}

    con.execute("""
        CREATE OR REPLACE TABLE inaturalist_waba_data.taxon_lineage (
            taxon_id BIGINT PRIMARY KEY,
            genus VARCHAR,
            family VARCHAR
        )
    """)
    con.executemany(
        "INSERT INTO inaturalist_waba_data.taxon_lineage VALUES (?, ?, ?)",
        [[tid, d["genus"], d["family"]] for tid, d in lineage.items()],
    )
    count = con.execute("SELECT count(*) FROM inaturalist_waba_data.taxon_lineage").fetchone()[0]
    print(f"taxon_lineage: {count} rows")  # noqa: T201
    con.close()


def load_observations(full_reload: bool = False) -> None:
    pipeline = dlt.pipeline(
        pipeline_name="waba",
        destination=dlt.destinations.duckdb(DB_PATH),
        dataset_name="inaturalist_waba_data",
    )
    if full_reload:
        import shutil
        from pathlib import Path
        pipeline_dir = Path(pipeline.working_dir)
        for subdir in ("load/new", "load/normalized", "normalize"):
            path = pipeline_dir / subdir
            if path.exists():
                shutil.rmtree(path)
                path.mkdir()
        with pipeline.sql_client() as client:
            client.execute_sql("DELETE FROM _dlt_pipeline_state WHERE pipeline_name = 'waba'")
    source = waba_source(write_disposition="replace" if full_reload else "merge")
    load_info = pipeline.run(source)
    print(load_info)  # noqa: T201
    load_info.raise_on_failed_jobs()
    enrich_taxon_lineage(DB_PATH)


if __name__ == "__main__":
    import sys
    load_observations(full_reload="--full-reload" in sys.argv)
