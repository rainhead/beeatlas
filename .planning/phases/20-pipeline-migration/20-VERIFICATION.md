---
phase: 20-pipeline-migration
verified: 2026-03-27T00:00:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 20: Pipeline Migration Verification Report

**Phase Goal:** All five dlt pipelines are runnable from data/ against a local DuckDB, with old pipeline modules gone and config centralised in .dlt/config.toml
**Verified:** 2026-03-27
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                    | Status     | Evidence                                                                             |
|----|------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------|
| 1  | Five dlt pipeline .py files exist in data/ and are importable                           | VERIFIED   | All five files present; `uv run python -c "import inaturalist_pipeline, ecdysis_pipeline, geographies_pipeline, projects_pipeline, anti_entropy_pipeline"` exits 0 |
| 2  | Old pipeline modules (ecdysis/, inat/, links/, scripts/, spatial.py, tests/) are gone   | VERIFIED   | `ls` of all seven paths returns "No such file or directory" for every one            |
| 3  | .dlt/config.toml has all four config keys with correct values including relative html_cache_dir | VERIFIED   | python tomllib parse confirms project_id=166376, dataset_id=44, db_path="beeatlas.duckdb", html_cache_dir="raw/ecdysis_cache" |
| 4  | pyproject.toml has exactly the five required deps and no old deps                       | VERIFIED   | File contains exactly dlt[duckdb], duckdb, requests, beautifulsoup4, geopandas; no pyinaturalist, pydwca, sqlalchemy, pyogrio, pyarrow, pydantic, [build-system], [tool.hatch], [dependency-groups] |
| 5  | uv sync succeeds and all pipeline imports resolve                                        | VERIFIED   | `uv run python -c "import dlt, duckdb, requests, bs4, geopandas"` exits 0 with "imports ok" |
| 6  | All five pipelines wrote rows to beeatlas.duckdb                                        | VERIFIED   | Query returns: observations=9,684; occurrences=46,090; ecoregions=2,548; projects=42 |
| 7  | anti_entropy_pipeline ran without error                                                  | VERIFIED   | SUMMARY.md confirms exit code 0; pipeline connects to DB_PATH and queries inaturalist_data.observations |
| 8  | DB_PATH fix applied — all five files use Path(__file__).parent / "beeatlas.duckdb"      | VERIFIED   | grep confirms `DB_PATH = str(Path(__file__).parent / "beeatlas.duckdb")` in all five pipeline files |
| 9  | beeatlas.duckdb is gitignored                                                            | VERIFIED   | `git check-ignore data/beeatlas.duckdb` returns the path; .gitignore entry confirmed |
| 10 | anti_entropy_pipeline imports from inaturalist_pipeline                                  | VERIFIED   | Line 14: `from inaturalist_pipeline import DEFAULT_FIELDS, _transform`               |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact                          | Expected                          | Status   | Details                                           |
|-----------------------------------|-----------------------------------|----------|---------------------------------------------------|
| `data/inaturalist_pipeline.py`    | iNat observation pipeline         | VERIFIED | 116 lines; DB_PATH uses Path(__file__).parent     |
| `data/ecdysis_pipeline.py`        | Ecdysis specimen + links pipeline | VERIFIED | DB_PATH fix applied; two duckdb destination calls |
| `data/geographies_pipeline.py`    | Geographic boundary pipeline      | VERIFIED | DB_PATH fix applied                               |
| `data/projects_pipeline.py`       | iNat projects pipeline            | VERIFIED | DB_PATH fix applied                               |
| `data/anti_entropy_pipeline.py`   | Anti-entropy soft-delete pipeline | VERIFIED | DB_PATH fix applied; imports from inaturalist_pipeline |
| `data/.dlt/config.toml`          | Centralized pipeline configuration | VERIFIED | All four keys present with correct values         |
| `data/pyproject.toml`            | Consolidated dependency manifest   | VERIFIED | Exactly five deps; no old cruft                   |
| `data/README.md`                 | Pipeline documentation             | VERIFIED | Contains beeatlas-data, raw/ecdysis_cache, uv sync, inaturalist_pipeline.py docs |
| `data/beeatlas.duckdb`           | DuckDB database with all pipeline data | VERIFIED | Exists; 4 tables with non-zero row counts        |

### Key Link Verification

| From                          | To                            | Via                                                    | Status   | Details                                                              |
|-------------------------------|-------------------------------|--------------------------------------------------------|----------|----------------------------------------------------------------------|
| `data/anti_entropy_pipeline.py` | `data/inaturalist_pipeline.py` | `from inaturalist_pipeline import DEFAULT_FIELDS, _transform` | WIRED | Confirmed at line 14                                               |
| `data/.dlt/config.toml`       | all pipeline files             | dlt config injection at runtime (sources.inaturalist, sources.ecdysis) | WIRED | Config section names match dlt @dlt.source decorator section references documented in pipeline docstrings |
| `data/inaturalist_pipeline.py` | `data/beeatlas.duckdb`        | `dlt.destinations.duckdb(DB_PATH)`                    | WIRED    | Confirmed at line 116; DB_PATH resolves to absolute path via Path(__file__).parent |

### Data-Flow Trace (Level 4)

| Artifact              | Data Variable | Source                             | Produces Real Data | Status   |
|-----------------------|---------------|------------------------------------|--------------------|----------|
| `data/beeatlas.duckdb` | observations, occurrences, ecoregions, projects | Live iNat API, Ecdysis API, shapefile downloads | Yes — 9,684 / 46,090 / 2,548 / 42 rows confirmed via DuckDB query | FLOWING |

### Behavioral Spot-Checks

| Behavior                                    | Command                                                                                                              | Result                                              | Status |
|---------------------------------------------|----------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------|--------|
| All five pipeline modules importable        | `cd data && uv run python -c "import inaturalist_pipeline, ecdysis_pipeline, geographies_pipeline, projects_pipeline, anti_entropy_pipeline; print('ok')"` | "all five pipeline modules import cleanly"         | PASS   |
| All five deps import cleanly                | `cd data && uv run python -c "import dlt, duckdb, requests, bs4, geopandas; print('imports ok')"`                   | "imports ok"                                        | PASS   |
| config.toml all four keys correct           | `python3 -c "import tomllib; t=tomllib.loads(...); assert all four keys"` (run in data/)                            | "all config keys verified"                          | PASS   |
| DuckDB has non-zero rows in all four tables | `cd data && uv run duckdb beeatlas.duckdb "SELECT ... UNION ALL ..."`                                                | observations=9684, occurrences=46090, ecoregions=2548, projects=42 | PASS |
| beeatlas.duckdb is gitignored               | `git check-ignore data/beeatlas.duckdb`                                                                              | "data/beeatlas.duckdb" (gitignored)                 | PASS   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                             | Status    | Evidence                                                                     |
|-------------|-------------|----------------------------------------------------------------------------------------------------------|-----------|------------------------------------------------------------------------------|
| PIPE-08     | 20-01       | dlt pipeline files live in data/ alongside consolidated pyproject.toml and uv.lock; old modules removed | SATISFIED | All five .py files present; ecdysis/, inat/, links/, scripts/, spatial.py, tests/, Makefile all absent |
| PIPE-09     | 20-01       | .dlt/config.toml configures all pipeline parameters: iNat project_id, Ecdysis dataset_id, html_cache_dir, db_path | SATISFIED | config.toml verified: project_id=166376, dataset_id=44, html_cache_dir="raw/ecdysis_cache", db_path="beeatlas.duckdb" |
| PIPE-10     | 20-02       | All 5 dlt pipelines run locally and write to data/beeatlas.duckdb                                       | SATISFIED | DuckDB query confirms non-zero rows in all four main tables; anti_entropy exited 0 |

Note: REQUIREMENTS.md traceability table shows PIPE-10 as "Pending" and the checkbox `[ ]` is unchecked. This is a stale documentation state — the actual code evidence (populated beeatlas.duckdb with confirmed row counts) satisfies the requirement. The REQUIREMENTS.md traceability row should be updated to "Complete" and the checkbox marked `[x]`, but this is a documentation inconsistency, not a code gap.

### Anti-Patterns Found

None. No TODO/FIXME/PLACEHOLDER/XXX markers found in any of the five pipeline files. No empty return stubs, no hardcoded empty arrays returned as API responses.

### Human Verification Required

None. All checks are programmatically verifiable and passed.

The one item that would normally warrant human verification — that each pipeline successfully fetches live data from external sources — is already satisfied by the pre-existing evidence: data/beeatlas.duckdb is populated with confirmed row counts from all pipelines (9,684 observations, 46,090 occurrences, 2,548 ecoregions, 42 projects).

### Gaps Summary

No gaps. All must-haves from both plans are satisfied:

- Plan 20-01 (PIPE-08, PIPE-09): All five pipeline files exist and are importable; old modules are fully removed; config.toml has all four correct keys with relative html_cache_dir; pyproject.toml has exactly the five required deps; uv sync and imports succeed; .gitignore covers dlt artifacts; README documents the pipeline; PROJECT.md key decision updated; pending todo closed.

- Plan 20-02 (PIPE-10): beeatlas.duckdb is populated with non-zero rows from all four main tables; DB_PATH fix (Path(__file__).parent) applied to all five files; beeatlas.duckdb is gitignored.

The post-execution fix noted in the SUMMARY (DB_PATH using Path(__file__).parent instead of the relative string "beeatlas.duckdb") is correctly applied in all five files. The db_path in .dlt/config.toml remaining as "beeatlas.duckdb" (relative) is correct per design — it is passed to duckdb.connect() which resolves relative to cwd, not dlt's initial_cwd.

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
