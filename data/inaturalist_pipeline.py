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


@dlt.source(name="inaturalist")
def inaturalist_source(
    project_id: int = dlt.config.value,
    write_disposition: str = "merge",
    fields: str = DEFAULT_FIELDS,
) -> None:
    """Load observations from the iNaturalist v2 API.

    Args:
        project_id: iNaturalist project ID to load observations from.
                    Auto-loaded from config.toml [sources.inaturalist] project_id.
        fields: Comma-separated v2 API fields to return.

    Example:
        pipeline.run(inaturalist_source())
        pipeline.run(inaturalist_source(project_id=166376))
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
                        "project_id": project_id,
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


def load_observations(full_reload: bool = False) -> None:
    pipeline = dlt.pipeline(
        pipeline_name="inaturalist",
        destination=dlt.destinations.duckdb(DB_PATH),
        dataset_name="inaturalist_data",
    )
    if full_reload:
        # Drop any pending local packages to avoid stale merge SQL on missing tables
        import shutil
        from pathlib import Path
        pipeline_dir = Path(pipeline.working_dir)
        for subdir in ("load/new", "load/normalized", "normalize"):
            path = pipeline_dir / subdir
            if path.exists():
                shutil.rmtree(path)
                path.mkdir()
        # Delete destination state so pipeline.run() doesn't restore the old cursor
        with pipeline.sql_client() as client:
            client.execute_sql("DELETE FROM _dlt_pipeline_state WHERE pipeline_name = 'inaturalist'")
    source = inaturalist_source(write_disposition="replace" if full_reload else "merge")
    load_info = pipeline.run(source)
    print(load_info)  # noqa: T201
    load_info.raise_on_failed_jobs()


# Ranks we extract from the iNat ancestor chain (TAX-01).
TARGET_RANKS = {"family", "subfamily", "tribe", "genus", "subgenus"}


def enrich_taxon_lineage_extended(db_path: str | None = None) -> None:
    """Fetch full ancestor chain for every observed iNat taxon ID and write
    inaturalist_data.taxon_lineage_extended(taxon_id, family, subfamily,
    tribe, genus, subgenus).

    Source taxon IDs = DISTINCT NOT NULL UNION of:
      - inaturalist_data.observations.taxon__id
      - inaturalist_waba_data.observations.taxon__id

    Must run AFTER both inaturalist and waba pipelines have populated their
    observations tables. Phase 76 / D-03 / TAX-01.

    NULL is emitted (NOT a sentinel) for ranks absent from the ancestor chain
    so downstream nav code (Phase 80 NAV-02) can render only populated levels.
    """
    if db_path is None:
        db_path = DB_PATH
    con = duckdb.connect(db_path)
    try:
        taxon_ids = [
            row[0] for row in con.execute("""
                SELECT DISTINCT taxon__id FROM (
                    SELECT taxon__id FROM inaturalist_data.observations
                    WHERE taxon__id IS NOT NULL
                    UNION
                    SELECT taxon__id FROM inaturalist_waba_data.observations
                    WHERE taxon__id IS NOT NULL
                )
            """).fetchall()
        ]
        if not taxon_ids:
            print("taxon_lineage_extended: no taxon IDs found, skipping")  # noqa: T201
            return

        lineage: dict[int, dict] = {}
        batch_size = 30
        for i in range(0, len(taxon_ids), batch_size):
            batch = taxon_ids[i : i + batch_size]
            ids_path = ",".join(map(str, batch))
            resp = requests.get(
                f"https://api.inaturalist.org/v2/taxa/{ids_path}",
                params={"fields": "id,name,rank,ancestors.id,ancestors.name,ancestors.rank"},
                timeout=30,
            )
            resp.raise_for_status()
            for taxon in resp.json().get("results", []):
                row = {r: None for r in TARGET_RANKS}
                if taxon.get("rank") in TARGET_RANKS:
                    row[taxon["rank"]] = taxon["name"]
                for anc in taxon.get("ancestors", []):
                    rank = anc.get("rank")
                    if rank in TARGET_RANKS and row[rank] is None:
                        row[rank] = anc["name"]
                lineage[taxon["id"]] = row

        con.execute("""
            CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended (
                taxon_id BIGINT PRIMARY KEY,
                family VARCHAR,
                subfamily VARCHAR,
                tribe VARCHAR,
                genus VARCHAR,
                subgenus VARCHAR
            )
        """)
        con.executemany(
            "INSERT INTO inaturalist_data.taxon_lineage_extended VALUES (?, ?, ?, ?, ?, ?)",
            [
                [tid, d["family"], d["subfamily"], d["tribe"], d["genus"], d["subgenus"]]
                for tid, d in lineage.items()
            ],
        )
        count = con.execute(
            "SELECT count(*) FROM inaturalist_data.taxon_lineage_extended"
        ).fetchone()[0]
        print(f"taxon_lineage_extended: {count} rows")  # noqa: T201
    finally:
        con.close()


if __name__ == "__main__":
    import sys
    load_observations(full_reload="--full-reload" in sys.argv)
