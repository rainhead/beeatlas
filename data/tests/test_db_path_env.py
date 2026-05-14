"""Guard: every DB-connecting module in data/ honors the DB_PATH env var.

Two outlier bugs (anti_entropy_pipeline hardcoded path — dceaf74; dbt
profiles.yml hardcoded path — ed038e3) had the same shape: a code path
used its default DB file regardless of DB_PATH, so it worked on local
dev (where defaults coincide) and broke on maderas (where nightly.sh
sets DB_PATH=/tmp/beeatlas.duckdb to use the S3-restored snapshot).

The convention is: read DB_PATH from env, fall back to a local-dev
relative path. This test enforces the convention textually so a future
new pipeline can't drift.
"""

import re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent

# Every Python module that connects to beeatlas.duckdb and must read DB_PATH
# from env. If you add a new pipeline file that opens beeatlas.duckdb, add it
# here AND set its module-level DB_PATH via os.environ.get.
DB_USING_MODULES = [
    "ecdysis_pipeline.py",
    "inaturalist_pipeline.py",
    "anti_entropy_pipeline.py",
    "waba_pipeline.py",
    "projects_pipeline.py",
    "checklist_pipeline.py",
    "geographies_pipeline.py",
    "resolve_taxon_ids.py",
    "species_export.py",
    "species_maps.py",
    "feeds.py",
]

# Match either single- or double-quoted env-var literal. Whitespace tolerant.
_DB_PATH_PATTERN = re.compile(
    r"""DB_PATH\s*=\s*os\.environ\.get\(\s*["']DB_PATH["']\s*,"""
)


def test_python_pipelines_respect_db_path_env():
    """Each pipeline module sets DB_PATH = os.environ.get('DB_PATH', default).

    A hardcoded `DB_PATH = ...` (no env lookup) would re-ship the same bug
    as anti_entropy_pipeline (dceaf74) — defaulting to local-dev even when
    nightly.sh sets DB_PATH=/tmp/beeatlas.duckdb.
    """
    for filename in DB_USING_MODULES:
        path = DATA_DIR / filename
        assert path.exists(), (
            f"{filename} missing — update DB_USING_MODULES if the file was "
            f"renamed or removed."
        )
        text = path.read_text()
        assert _DB_PATH_PATTERN.search(text), (
            f"{filename} does not read DB_PATH from env. Expected pattern:\n"
            f"  DB_PATH = os.environ.get('DB_PATH', <default>)\n"
            f"See data/anti_entropy_pipeline.py for the canonical form."
        )


def test_dbt_profiles_uses_db_path_env_var():
    """dbt profiles.yml threads DB_PATH via {{ env_var('DB_PATH', ...) }}.

    Without this, dbt resolves the relative `../beeatlas.duckdb` and ignores
    nightly.sh's DB_PATH override (ed038e3). dbt-jinja's env_var() is the
    standard way to thread env values into profile config.
    """
    text = (DATA_DIR / "dbt" / "profiles.yml").read_text()
    assert ("env_var('DB_PATH'" in text or 'env_var("DB_PATH"' in text), (
        "dbt/profiles.yml should set `path: \"{{ env_var('DB_PATH', '...') }}\"`. "
        "Otherwise nightly.sh's DB_PATH override is ignored and dbt connects "
        "to the wrong DuckDB file."
    )
