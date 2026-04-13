"""Pipeline orchestrator — runs all data pipelines in sequence.

Usage:
    cd data && uv run python run.py

Pipelines are executed in this order:
    ecdysis -> ecdysis-links -> inaturalist -> waba -> projects -> export -> feeds

Geographies (county/ecoregion boundaries) change rarely and are excluded from the
nightly run. Load them manually: uv run python geographies_pipeline.py
"""

import logging
import time
import traceback
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


def main() -> None:
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
