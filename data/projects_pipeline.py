"""Load iNaturalist project names for projects referenced in the observations join table."""

from typing import Iterator

import duckdb
import requests
import dlt


def get_project_ids_from_db(db_path: str = "beeatlas.duckdb") -> list[int]:
    """Read project IDs from the join table that aren't already in the projects table."""
    con = duckdb.connect(db_path, read_only=True)
    try:
        rows = con.execute(
            """
            SELECT DISTINCT op.project_id
            FROM inaturalist_data.observations__observation_projects op
            LEFT JOIN inaturalist_data.projects p ON op.project_id = p.id
            WHERE p.id IS NULL
            ORDER BY op.project_id
            """
        ).fetchall()
    except Exception:
        # projects table doesn't exist yet — load everything
        rows = con.execute(
            "SELECT DISTINCT project_id FROM inaturalist_data.observations__observation_projects ORDER BY project_id"
        ).fetchall()
    con.close()
    return [row[0] for row in rows]


@dlt.source(name="inaturalist")
def inaturalist_projects_source(project_ids: list[int]) -> Iterator:
    """Load project metadata for the given project IDs from the iNaturalist API."""

    @dlt.resource(name="projects", primary_key="id", write_disposition="merge")
    def projects_resource() -> Iterator:
        # iNat v1 supports comma-separated id param; batch into groups of 100
        batch_size = 100
        for i in range(0, len(project_ids), batch_size):
            batch = project_ids[i : i + batch_size]
            resp = requests.get(
                "https://api.inaturalist.org/v1/projects",
                params={"id": ",".join(str(pid) for pid in batch), "per_page": batch_size},
                timeout=30,
            )
            resp.raise_for_status()
            for item in resp.json().get("results", []):
                yield {
                    "id": item["id"],
                    "title": item.get("title"),
                    "slug": item.get("slug"),
                    "project_type": item.get("project_type"),
                    "description": item.get("description"),
                }

    yield projects_resource()


def load_projects() -> None:
    project_ids = get_project_ids_from_db()
    print(f"Loading {len(project_ids)} projects: {project_ids}")  # noqa: T201

    pipeline = dlt.pipeline(
        pipeline_name="inaturalist",
        destination=dlt.destinations.duckdb("beeatlas.duckdb"),
        dataset_name="inaturalist_data",
    )
    load_info = pipeline.run(inaturalist_projects_source(project_ids))
    print(load_info)  # noqa: T201
    load_info.raise_on_failed_jobs()


if __name__ == "__main__":
    load_projects()
