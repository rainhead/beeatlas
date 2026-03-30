"""Pipeline orchestrator — runs all data pipelines in sequence.

Usage:
    cd data && uv run python run.py

Pipelines are executed in this order:
    geographies -> ecdysis -> ecdysis-links -> inaturalist -> projects -> export
"""

import time
from typing import Callable

from geographies_pipeline import load_geographies
from ecdysis_pipeline import load_ecdysis, load_links
from inaturalist_pipeline import load_observations
from projects_pipeline import load_projects
from anti_entropy_pipeline import run_anti_entropy
from export import main as export_all

STEPS: list[tuple[str, Callable]] = [
    ("geographies", load_geographies),
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("export", export_all),
]


def main() -> None:
    overall_start = time.monotonic()
    for name, fn in STEPS:
        print(f"--- {name} ---")  # noqa: T201
        step_start = time.monotonic()
        fn()
        elapsed = time.monotonic() - step_start
        print(f"--- {name} done in {elapsed:.1f}s ---")  # noqa: T201
    total = time.monotonic() - overall_start
    print(f"--- all pipelines complete in {total:.1f}s ---")  # noqa: T201


if __name__ == "__main__":
    main()
