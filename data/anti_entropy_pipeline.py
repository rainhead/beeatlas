"""Anti-entropy pipeline for iNaturalist observations.

Samples observations from the local database (weighted toward recency) and
re-fetches them from the iNaturalist API. Changed observations are updated via
merge; observations no longer returned by the API (deleted or no longer matching
project criteria) are soft-deleted by setting is_deleted=True.
"""
from pathlib import Path
from typing import Iterator

import dlt
import requests

from inaturalist_pipeline import DEFAULT_FIELDS, _transform

DB_PATH = str(Path(__file__).parent / "beeatlas.duckdb")

INAT_BASE_URL = "https://api.inaturalist.org/v2/"


def _sample_observations(pipeline: dlt.Pipeline, n: int) -> list[dict]:
    """Sample n observation IDs from local DB, weighted toward more recent observations.

    Uses harmonic decay: an observation updated 1 year ago gets ~half the selection
    probability of one updated today.
    """
    with pipeline.sql_client() as client:
        rows = client.execute_sql(
            f"""
            SELECT id, uuid
            FROM observations
            WHERE is_deleted IS NOT TRUE
            ORDER BY random() / (1.0 + (date_diff('day', updated_at::date, current_date) / 365.0)) DESC
            LIMIT {n}
            """
        )
    return [{"id": row[0], "uuid": row[1]} for row in rows]


@dlt.resource(
    name="observations",
    primary_key="uuid",
    write_disposition="merge",
    columns={"is_deleted": {"data_type": "bool", "nullable": False}},
)
def anti_entropy_observations(sampled: list[dict]) -> Iterator[dict]:
    """Re-fetch sampled observations; yield updates and tombstones for missing ones."""
    sampled_by_id = {row["id"]: row["uuid"] for row in sampled}
    returned_uuids: set[str] = set()

    ids = list(sampled_by_id.keys())
    for batch_start in range(0, len(ids), 200):
        batch_ids = ids[batch_start:batch_start + 200]
        resp = requests.get(
            f"{INAT_BASE_URL}observations",
            params={
                "id": ",".join(str(i) for i in batch_ids),
                "fields": DEFAULT_FIELDS,
                "per_page": 200,
            },
            timeout=30,
        )
        resp.raise_for_status()
        for obs in resp.json()["results"]:
            returned_uuids.add(obs["uuid"])
            yield _transform(obs)

    # Soft-delete observations not returned by the API
    missing = [uuid for obs_id, uuid in sampled_by_id.items() if uuid not in returned_uuids]
    if missing:
        print(f"Soft-deleting {len(missing)} observations not returned by API: {missing}")  # noqa: T201
    for uuid in missing:
        yield {"uuid": uuid, "is_deleted": True}


@dlt.source(name="inaturalist")
def anti_entropy_source(sampled: list[dict]):
    yield anti_entropy_observations(sampled)


def run_anti_entropy(n: int = 200) -> None:
    pipeline = dlt.pipeline(
        pipeline_name="inaturalist",
        destination=dlt.destinations.duckdb(DB_PATH),
        dataset_name="inaturalist_data",
    )

    sampled = _sample_observations(pipeline, n)
    if not sampled:
        print("No observations found to sample.")  # noqa: T201
        return

    print(f"Sampled {len(sampled)} observations for anti-entropy check.")  # noqa: T201
    load_info = pipeline.run(anti_entropy_source(sampled))
    load_info.raise_on_failed_jobs()
    print(load_info)  # noqa: T201


if __name__ == "__main__":
    import sys
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    run_anti_entropy(n)
