"""Pipeline orchestrator — runs all data pipelines in sequence.

Usage:
    cd data && uv run python run.py

Pipelines are executed in this order:
    ecdysis -> ecdysis-links -> inaturalist -> waba -> projects -> export -> feeds

Geographies (county/ecoregion boundaries) change rarely and are excluded from the
nightly run. Load them manually: uv run python geographies_pipeline.py
"""

import logging
import os
import time
import traceback
from pathlib import Path
from typing import Callable

logging.basicConfig(level=logging.WARNING, format="%(name)s %(levelname)s %(message)s")

from geographies_pipeline import load_geographies
from ecdysis_pipeline import load_ecdysis, load_links
from inaturalist_pipeline import load_observations as load_inaturalist_observations
from waba_pipeline import load_observations as load_waba_observations
from projects_pipeline import load_projects
from anti_entropy_pipeline import run_anti_entropy
from export import main as export_all
from feeds import main as generate_feeds

STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("export", export_all),
    ("feeds", generate_feeds),
]


def _apply_migrations() -> None:
    """One-time schema migrations applied before pipelines run.

    Phase 48: renamed inat_observation_id → host_observation_id in occurrence_links.
    Phase 47: geographies tables gained native geom GEOMETRY column (replacing geometry_wkt
              used only for ST_GeomFromText calls). feeds.py references geom directly;
              the S3 DuckDB may still have only geometry_wkt if geographies_pipeline.py
              has not been re-run since that change.
    """
    import duckdb
    db_path = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
    if not Path(db_path).exists():
        return
    con = duckdb.connect(db_path)
    try:
        # Phase 48: rename inat_observation_id → host_observation_id
        cols = {row[0] for row in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'ecdysis_data' AND table_name = 'occurrence_links'"
        ).fetchall()}
        if 'inat_observation_id' in cols and 'host_observation_id' not in cols:
            print("Migration: renaming occurrence_links.inat_observation_id → host_observation_id")
            con.execute("ALTER TABLE ecdysis_data.occurrence_links RENAME COLUMN inat_observation_id TO host_observation_id")

        # Phase 47: backfill geom GEOMETRY column on old-schema geographies tables
        # (geometry_wkt present but geom absent means pre-Phase-47 DuckDB from S3)
        geo_tables = [
            ('geographies', 'us_counties'),
            ('geographies', 'ecoregions'),
            ('geographies', 'us_states'),
        ]
        needs_geom = []
        for schema, table in geo_tables:
            table_cols = {row[0] for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                f"WHERE table_schema = '{schema}' AND table_name = '{table}'"
            ).fetchall()}
            if 'geometry_wkt' in table_cols and 'geom' not in table_cols:
                needs_geom.append(f'{schema}.{table}')

        if needs_geom:
            con.execute("INSTALL spatial; LOAD spatial;")
            for qualified in needs_geom:
                print(f"Migration: adding geom column to {qualified}")
                con.execute(f"ALTER TABLE {qualified} ADD COLUMN geom GEOMETRY")
                con.execute(f"UPDATE {qualified} SET geom = ST_GeomFromText(geometry_wkt)")
    finally:
        con.close()


def main() -> None:
    _apply_migrations()
    overall_start = time.monotonic()
    for name, fn in STEPS:
        print(f"--- {name} ---")  # noqa: T201
        step_start = time.monotonic()
        try:
            fn()
        except Exception:
            traceback.print_exc()
            raise
        elapsed = time.monotonic() - step_start
        print(f"--- {name} done in {elapsed:.1f}s ---")  # noqa: T201
    total = time.monotonic() - overall_start
    print(f"--- all pipelines complete in {total:.1f}s ---")  # noqa: T201


if __name__ == "__main__":
    main()
