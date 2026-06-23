"""Pipeline orchestrator — runs all data pipelines in sequence.

Usage:
    cd data && uv run python run.py

Pipelines are executed in this order:
    ecdysis -> ecdysis-links -> inaturalist -> waba -> projects ->
    anti-entropy -> checklist -> inat-obs -> resolve-taxon-ids -> taxa-download ->
    inactive-remap -> inactive-gate -> taxon-lineage-extended -> places-validation -> places-load ->
    dbt-build -> dedup-candidates -> dedup-gate -> generate-sqlite -> topology-postprocess ->
    species-export -> species-maps -> places-export -> places-maps -> feeds

Geographies (county/ecoregion boundaries) change rarely and are excluded from the
nightly run. Load them manually: uv run python geographies_pipeline.py
"""

import logging
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Callable

logging.basicConfig(level=logging.WARNING, format="%(name)s %(levelname)s %(message)s")

# Geographies loaded manually: uv run python geographies_pipeline.py
from ecdysis_pipeline import load_ecdysis, load_links
from inaturalist_pipeline import load_observations as load_inaturalist_observations
from waba_pipeline import load_observations as load_waba_observations
from taxa_pipeline import download_taxa_csv, load_taxon_lineage_extended
from projects_pipeline import load_projects
from anti_entropy_pipeline import run_anti_entropy
from checklist_pipeline import load_checklist
from resolve_taxon_ids import resolve_taxon_ids, check_resolution_gate, generate_inactive_remaps, check_inactive_gate
from resolve_checklist_names import resolve_checklist_names, check_checklist_resolution_gate
from species_export import main as export_species_parquet
from species_maps import main as generate_species_maps
from feeds import main as generate_feeds
from topology_postprocess import main as clean_region_topology
from inat_obs_pipeline import load_inat_obs
from places_validation import validate_places_step
from places_load import load_places_step
from places_export import export_places_step
from places_maps import main as generate_place_maps_step
from sqlite_export import main as generate_sqlite_export
from checklist_dedup import write_dedup_candidates, check_dedup_gate

_REFRESH_LINEAGE = "--refresh-lineage" in sys.argv
_REFRESH_CHECKLIST = "--refresh-checklist" in sys.argv

_DBT_SCRIPT = Path(__file__).parent / "dbt" / "run.sh"
_DBT_SANDBOX = Path(__file__).parent / "dbt" / "target" / "sandbox"
_EXPORT_DIR = Path(os.environ.get(
    'EXPORT_DIR',
    str(Path(__file__).parent.parent / 'public' / 'data'),
))


def _run_dbt_build() -> None:
    """Invoke ``bash data/dbt/run.sh build`` and copy artifacts to EXPORT_DIR.

    Phase 88 CUTOVER-01: dbt is the sole transform producer. ``subprocess.run``
    with ``check=True`` propagates a ``CalledProcessError`` to ``main()``'s
    per-step traceback handler if dbt fails, yielding a meaningful error.

    On success, copies the three external materializations from
    ``data/dbt/target/sandbox/`` into EXPORT_DIR (defaults to ``public/data/``)
    so the downstream post-steps (species-export, species-maps, feeds) and
    nightly.sh's S3 upload step see them at the expected paths.

    species.parquet is NOT copied here — species_export.py reads from the
    sandbox and writes its own 19-col version (with slug) directly to
    EXPORT_DIR (Phase 86 Plan 05 contract).
    """
    subprocess.run(["bash", str(_DBT_SCRIPT), "build"], check=True)
    _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    for artifact in ("occurrences.parquet", "occurrence_places.parquet",
                     "counties.geojson", "ecoregions.geojson",
                     "checklist.parquet"):
        src = _DBT_SANDBOX / artifact
        dst = _EXPORT_DIR / artifact
        shutil.copy2(src, dst)


STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),
    # RCN-03: resolve-checklist-names is a no-op nightly (zero GBIF calls);
    # the one-time --refresh-checklist run bakes the committed seed/audit cache.
    ("resolve-checklist-names", lambda: resolve_checklist_names(refresh=_REFRESH_CHECKLIST)),
    ("checklist-resolution-gate", check_checklist_resolution_gate),  # D-04: hard-fail only on source='unresolved'
    ("inat-obs", load_inat_obs),
    ("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
    ("resolution-gate", check_resolution_gate),       # D-02: fail fast on unresolved bee names
    ("taxa-download", download_taxa_csv),
    ("inactive-remap", generate_inactive_remaps),    # NEW: detect + auto-remap inactive taxa (D-11)
    ("inactive-gate", check_inactive_gate),          # NEW: hard-fail on unresolvable inactives (D-05)
    ("taxon-lineage-extended", load_taxon_lineage_extended),
    ("places-validation", validate_places_step),
    ("places-load", load_places_step),
    ("dbt-build", _run_dbt_build),
    ("dedup-candidates", write_dedup_candidates),   # DUP-02: write dedup_candidate_pairs.csv audit CSV
    ("dedup-gate", check_dedup_gate),               # DUP-03: assert no orphaned confirmed pair_keys
    ("generate-sqlite", generate_sqlite_export),
    ("topology-postprocess", clean_region_topology),
    ("species-export", export_species_parquet),
    ("species-maps", generate_species_maps),
    ("places-export", export_places_step),
    ("places-maps", generate_place_maps_step),
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
