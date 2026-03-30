# Phase 20: Pipeline Migration - Research

**Researched:** 2026-03-27
**Domain:** dlt pipeline integration, Python project consolidation, .dlt config wiring
**Confidence:** HIGH — all source files read directly; prototype is the authoritative source

## Summary

Phase 20 is a mechanical port of five already-working pipeline files from `~/dlt-inat-test/` into `data/`, paired with a pyproject.toml replacement, .dlt/config.toml creation, and deletion of four old module directories plus two additional paths. The prototype has already resolved every design question (iNat API version, field selection, config structure, working-directory conventions). There is no research needed into external libraries beyond what is already coded and tested.

The key risk is not technical — it is operational completeness: forgetting any of the files that reference old modules, or leaving the `data/.gitignore` without entries for dlt state artifacts (`beeatlas.duckdb`, `.dlt/` state, `.geography_cache/`). A secondary concern is that `anti_entropy_pipeline.py` imports from `inaturalist_pipeline.py` by relative name, so both must land in the same directory.

The Makefile in `data/` references old module paths and must be replaced or deleted. `data/README.md` is currently empty (1 line) and must be written from scratch to describe the new pipeline layout. The `scripts/build-data.sh` and several `package.json` scripts (`fetch-inat`, `fetch-links`, `build:data`) reference old modules — these are deferred to Phase 22 (Orchestration), not this phase. Phase 20 only removes the source directories; it does not update orchestration scripts yet.

**Primary recommendation:** Copy the five pipeline files verbatim, write `.dlt/config.toml` with `html_cache_dir = "raw/ecdysis_cache"`, replace `pyproject.toml` with the prototype's dep list under the name `beeatlas-data`, delete old module directories and files, update `data/.gitignore` to cover dlt artifacts, and rewrite `data/README.md`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**iNat API version:** Keep v2 (as used in the prototype). The prototype uses the iNat v2 API directly (not pyinaturalist), with explicit field extraction and correct coordinate handling via `geojson.coordinates`. The prior Key Decision against v2 was in the context of pyinaturalist's v2 wrapper — the prototype's direct REST usage with `DEFAULT_FIELDS` and explicit `_transform()` avoids those issues. The Key Decision in PROJECT.md should be updated to reflect this change.

**spatial.py and tests fate:** Delete `data/spatial.py` and `data/tests/` together with the old pipeline modules. `spatial.py` is superseded by the DuckDB spatial extension (Phase 21). The three test files (`test_inat_download.py`, `test_links_fetch.py`, `test_spatial.py`) cover code being deleted. No need to defer to Phase 24.

**html_cache_dir config:** Use a project-relative path in the committed `.dlt/config.toml`. Use `raw/ecdysis_cache` (relative to `data/`, the working directory for pipeline runs). This works for all users without per-machine override. The committed config replaces the absolute path (`/Users/rainhead/dev/beeatlas/data/raw/ecdysis_cache`) that exists in the prototype.

**pyproject.toml dep pruning:** Match the prototype's deps exactly — prune all old deps. Keep: `dlt[duckdb]`, `duckdb`, `requests`, `beautifulsoup4`, `geopandas`. Remove: `pandas`, `pyarrow`, `pyinaturalist`, `pyinaturalist-convert`, `pydwca`, `pydantic`, `sqlalchemy`, `pyogrio`. `pyarrow` comes transitively via dlt and doesn't need to be listed explicitly (Phase 21 will add it directly if needed).

**Pending todo — explicit iNat API fields:** Already resolved in prototype. `DEFAULT_FIELDS` is defined in `inaturalist_pipeline.py` with all required fields. Mark the todo (`2026-03-12-specify-explicit-fields-on-inat-api-calls.md`) as closed — the new pipeline addresses it by design.

### Claude's Discretion

- `data/Makefile` and `data/README.md` likely need updates; researcher should evaluate

### Deferred Ideas (OUT OF SCOPE)

*(None captured during discussion)*
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-08 | dlt pipeline files live in data/ alongside a consolidated pyproject.toml and uv.lock; old pipeline modules (ecdysis/, inat/, links/, scripts/) are removed | Five pipeline files identified in prototype; pyproject.toml replacement deps confirmed; old module directories enumerated |
| PIPE-09 | .dlt/config.toml configures all pipeline parameters: iNat project_id, Ecdysis dataset_id, html_cache_dir, db_path | Prototype config.toml structure read; html_cache_dir path decision confirmed; all four config keys identified with correct section names |
| PIPE-10 | All 5 dlt pipelines (inat, ecdysis, geographies, projects, anti-entropy) run locally and write to data/beeatlas.duckdb | All five pipeline files read in full; working-directory convention confirmed (pipelines use `"beeatlas.duckdb"` relative path); uv run invocation pattern from prototype README confirmed |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dlt[duckdb] | 1.23.0 (pinned in prototype uv.lock) | Data load framework — REST API, schema inference, merge/replace write dispositions | Prototype already running; do not upgrade during migration |
| duckdb | 1.5.0 (pinned in prototype uv.lock) | Destination database for all pipelines | Must match dlt's bundled duckdb version or be compatible |
| requests | (any compatible) | HTTP client for iNat API, Ecdysis download, geography downloads | Used in three pipeline files |
| beautifulsoup4 | (any compatible) | HTML parsing for Ecdysis occurrence page scraping | Used in ecdysis_pipeline.py links scraping |
| geopandas | (any compatible) | Shapefile loading and CRS reprojection for geographies pipeline | Used in geographies_pipeline.py |

### Prototype pyproject.toml (authoritative for this phase)

```toml
[project]
name = "dlt-inat-test"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = [
    "dlt[duckdb]>=1.23.0",
    "duckdb",
    "requests",
    "beautifulsoup4",
    "geopandas",
]
```

The `data/pyproject.toml` must be rewritten to match this dep list. The project name should remain `beeatlas-data` (not `dlt-inat-test`). The `[build-system]` hatchling block and `[tool.hatch.build.targets.wheel]` block in the current `data/pyproject.toml` should be removed — the new project is not a wheel package, just a script collection managed by uv.

**Installation after pyproject.toml replacement:**
```bash
cd data && uv sync
```

## Architecture Patterns

### File Layout After Phase 20

```
data/
├── inaturalist_pipeline.py   # copied from prototype
├── ecdysis_pipeline.py       # copied from prototype
├── geographies_pipeline.py   # copied from prototype
├── projects_pipeline.py      # copied from prototype
├── anti_entropy_pipeline.py  # copied from prototype (imports inaturalist_pipeline)
├── .dlt/
│   └── config.toml           # new — see config section below
├── pyproject.toml            # rewritten with prototype deps
├── uv.lock                   # regenerated by uv sync
├── README.md                 # rewritten to describe new pipelines
├── raw/
│   └── ecdysis_cache/        # html cache dir (created at runtime by ecdysis_pipeline)
├── .gitignore                # updated to ignore dlt state artifacts
└── [old files deleted: ecdysis/, inat/, links/, scripts/, spatial.py, tests/]
```

### .dlt/config.toml (exact content for committed file)

```toml
[runtime]
log_level="WARNING"
dlthub_telemetry = true

[sources.inaturalist]
project_id = 166376

[sources.ecdysis]
dataset_id = 44

[sources.ecdysis_links]
db_path = "beeatlas.duckdb"
html_cache_dir = "raw/ecdysis_cache"
```

The only change from the prototype is `html_cache_dir` — replace the absolute path with `"raw/ecdysis_cache"`. All other values are identical.

### Working Directory Convention

All five pipelines use bare relative paths (`"beeatlas.duckdb"`, `"raw/ecdysis_cache"`) that resolve against the process working directory. Pipeline runs must always be invoked with `data/` as cwd:

```bash
cd data && uv run python inaturalist_pipeline.py
```

This is also what `dlt.pipeline(destination=dlt.destinations.duckdb("beeatlas.duckdb"))` expects.

### Inter-Pipeline Import

`anti_entropy_pipeline.py` imports from `inaturalist_pipeline.py` by name:
```python
from inaturalist_pipeline import DEFAULT_FIELDS, _transform
```

Both files must be in the same directory. This is already satisfied by placing both in `data/`.

### dlt State Directory

dlt creates a `~/.dlt/` directory for pipeline state (load packages, normalization state). This is the default and is machine-local — it does NOT go in `data/.dlt/`. The `data/.dlt/` directory is only for `config.toml` and `secrets.toml`. No action needed; dlt handles this automatically.

### Anti-Patterns to Avoid

- **Absolute paths in config.toml:** The prototype has `/Users/rainhead/dev/beeatlas/data/raw/ecdysis_cache` for `html_cache_dir`. The committed version must use `raw/ecdysis_cache` (relative). Running the pipeline from any other cwd will break.
- **Retaining hatchling build config:** The current `data/pyproject.toml` has `[build-system]` and `[tool.hatch.build.targets.wheel]` — the new file should not include these, since the project is not a distributable package.
- **Retaining `dev` dependency group:** The current file has `pytest` in `[dependency-groups] dev`. Since `data/tests/` is being deleted, this group serves no purpose and should be omitted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Incremental iNat API loading | Custom cursor logic | dlt incremental with `cursor_path="updated_at"` | Already implemented in prototype; dlt handles state persistence across runs |
| Schema type coercion | Manual pandas dtype mapping | dlt `columns=` dict in resource decorator | Prototype already specifies `data_type` for nullable columns (geoprivacy, captive, etc.) |
| Merge-on-primary-key upserts | Custom SQL MERGE | dlt `write_disposition="merge"` | dlt generates the MERGE SQL for DuckDB automatically |
| HTTP rate limiting in link scraper | Custom sleep logic | RATE_LIMIT_SECONDS in ecdysis_pipeline.py | Already implemented; do not rewrite |

## Runtime State Inventory

> Included because this is a migration/deletion phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | No existing `data/beeatlas.duckdb` in git or on disk (not found in repo scan) | None — DuckDB is created fresh by pipeline runs |
| Live service config | `.dlt/config.toml` does not yet exist in `data/` | Create — copy from prototype with html_cache_dir path change |
| OS-registered state | No Task Scheduler, pm2, or launchd entries for beeatlas pipelines detected | None |
| Secrets/env vars | No secrets in `.dlt/config.toml` (project_id and dataset_id are public); prototype has `secrets.toml` (empty pattern) | None — no secrets to migrate; `.dlt/secrets.toml` not needed for this phase |
| Build artifacts | `data/uv.lock` must be regenerated after pyproject.toml replacement | Run `uv sync` after rewriting pyproject.toml |

**Note on old module directories:** `ecdysis/`, `inat/`, `links/`, `scripts/`, `spatial.py`, `tests/` contain only source code and `__pycache__` directories. No data is stored in them. Deletion is clean.

## Common Pitfalls

### Pitfall 1: .gitignore not updated for dlt artifacts

**What goes wrong:** After running pipelines, dlt writes load packages and normalization artifacts under `~/.dlt/` (global) and can write `.dlt/` state in the pipeline working directory. More critically, `beeatlas.duckdb` should not be committed (it's a binary that's regenerated).

**Why it happens:** The current `data/.gitignore` has `*.zip`, `*.pyc`, `__pycache__`, `last_fetch.txt`, `*.ndjson` — no entries for `.duckdb` files or geography cache.

**How to avoid:** Add to `data/.gitignore`:
```
beeatlas.duckdb
.geography_cache/
raw/ecdysis_cache/
```

The root `.gitignore` already ignores `*.parquet`, so `ecdysis.parquet`, `samples.parquet`, etc., are already covered.

**Warning signs:** `git status` shows `beeatlas.duckdb` as untracked after first pipeline run.

### Pitfall 2: Working directory not set to data/ before pipeline run

**What goes wrong:** If you run `uv run python data/inaturalist_pipeline.py` from the repo root, `"beeatlas.duckdb"` resolves to `./beeatlas.duckdb` at the repo root, and `"raw/ecdysis_cache"` resolves to `./raw/ecdysis_cache` — neither of which is correct.

**Why it happens:** All dlt pipeline destination paths and ecdysis_links config paths are relative.

**How to avoid:** Always `cd data` first, then `uv run python <pipeline>.py`. Document this convention prominently in `data/README.md`.

**Warning signs:** `beeatlas.duckdb` appears in the repo root; `raw/ecdysis_cache/` is created in the repo root.

### Pitfall 3: Stale uv.lock after pyproject.toml replacement

**What goes wrong:** The old `uv.lock` is keyed to the old dep list (pyinaturalist, pydwca, sqlalchemy, etc.). Running `uv run` with a replaced `pyproject.toml` but old `uv.lock` may fail or install unexpected packages.

**Why it happens:** uv respects the lock file; it does not auto-regenerate on pyproject.toml changes.

**How to avoid:** Run `uv sync` immediately after replacing `pyproject.toml`. This regenerates `uv.lock` and installs the new deps.

**Warning signs:** `uv run python inaturalist_pipeline.py` fails with import errors for dlt or succeeds but dlt is not installed.

### Pitfall 4: Makefile left with dead references

**What goes wrong:** `data/Makefile` contains rules for `inat/observation/%.json` and `inat/observations.parquet` — both reference the deleted `inat/` directory. Any `make` invocation will fail or produce confusing errors.

**Why it happens:** The Makefile was never updated to remove the iNat fetching rules (they were superseded by the pipeline approach).

**How to avoid:** Delete `data/Makefile` entirely. None of its targets are relevant to the new dlt architecture. Phase 22 will introduce a proper runner; a legacy Makefile would only confuse.

### Pitfall 5: package.json scripts that reference old modules remain broken

**What goes wrong:** `npm run fetch-inat` and `npm run fetch-links` call `uv run python inat/download.py` and `uv run python -m links.fetch` — both of which will fail after the directories are deleted.

**Why it happens:** These scripts predate the dlt migration.

**How to avoid:** These scripts are intentionally left broken until Phase 22 (Orchestration). Do NOT add new pipeline invocations to `package.json` in this phase — that is Phase 22's responsibility. Document in the commit message that these scripts are temporarily broken.

### Pitfall 6: PROJECT.md Key Decision not updated for iNat API version

**What goes wrong:** PROJECT.md line 133 states "Use iNat API v1 (pyinaturalist default), not v2" as a Key Decision. After Phase 20 ships v2-based pipelines, this decision is stale and contradicts the new code.

**Why it happens:** The CONTEXT.md explicitly calls this out but it's easy to forget.

**How to avoid:** Update PROJECT.md to reflect the v2 decision. The new entry should note that the prototype's direct REST usage avoids the v2 coordinate issues that drove the original v1 decision.

## Code Examples

### Running a single pipeline (verified from prototype README)

```bash
cd data
uv run python inaturalist_pipeline.py
uv run python projects_pipeline.py
uv run python ecdysis_pipeline.py
uv run python geographies_pipeline.py
uv run python anti_entropy_pipeline.py
```

### Full reload for inat pipeline

```bash
cd data
uv run python inaturalist_pipeline.py --full-reload
```

### Verifying rows were written (duckdb CLI)

```bash
cd data
uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM inaturalist_data.observations"
uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM ecdysis_data.occurrences"
uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM geographies.ecoregions"
uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM inaturalist_data.projects"
# anti-entropy: check is_deleted flag counts
uv run duckdb beeatlas.duckdb "SELECT is_deleted, COUNT(*) FROM inaturalist_data.observations GROUP BY 1"
```

### Closing the pending todo (move file)

```bash
mv .planning/todos/pending/2026-03-12-specify-explicit-fields-on-inat-api-calls.md \
   .planning/todos/done/2026-03-12-specify-explicit-fields-on-inat-api-calls.md
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14 | dlt pipelines, pyproject.toml requires-python | ✓ | 3.14.3 | — |
| uv | Package management, `uv run` invocations | ✓ | 0.10.12 | — |
| dlt 1.23.0 | All five pipelines | ✓ (prototype venv) | 1.23.0 | Run `uv sync` in data/ to install |
| duckdb CLI | Verification queries | ✓ (bundled via dlt) | 1.5.0 | `uv run duckdb` after sync |
| Internet access | iNat API, Ecdysis download, geography shapefiles | Assumed | — | None — pipelines require live access |
| Network: iNat v2 API | inaturalist_pipeline.py, projects_pipeline.py, anti_entropy_pipeline.py | Not verified in this session | — | None — required for PIPE-10 |
| Network: ecdysis.org | ecdysis_pipeline.py | Not verified | — | None — required for PIPE-10 |
| Geography shapefiles (S3, Census, Statistics Canada) | geographies_pipeline.py | Not verified | — | Uses `.geography_cache/` if already downloaded |

**Missing dependencies with no fallback:**
- Live internet access to iNat, Ecdysis, and geography shapefile hosts is required to satisfy PIPE-10 (all five pipelines must run). This is a pre-execution assumption, not something the plan can resolve.

**Missing dependencies with fallback:**
- dlt and duckdb are not installed globally but are available in the prototype venv. After `uv sync` in `data/`, they will be installed in the data/ venv.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — tests/ directory is being deleted in this phase; no test framework required |
| Config file | N/A |
| Quick run command | `cd data && uv run python -c "import dlt, duckdb, requests, bs4, geopandas; print('imports ok')"` |
| Full suite command | Run all five pipelines (requires internet; takes 8–30+ minutes) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-08 | Five pipeline .py files present in data/; old module dirs absent | structural smoke | `ls data/inaturalist_pipeline.py data/ecdysis_pipeline.py data/geographies_pipeline.py data/projects_pipeline.py data/anti_entropy_pipeline.py && ! ls data/ecdysis/ data/inat/ data/links/ data/scripts/ data/spatial.py 2>/dev/null` | Wave 0: N/A — shell check, no file needed |
| PIPE-08 | pyproject.toml has exactly the five required deps, no old deps | structural smoke | `cd data && python3 -c "import tomllib; t=tomllib.loads(open('pyproject.toml').read()); deps=''.join(t['project']['dependencies']); assert 'pyinaturalist' not in deps and 'dlt' in deps, deps"` | Wave 0: N/A — inline check |
| PIPE-08 | uv.lock reflects new deps | structural smoke | `cd data && uv sync --dry-run` | Passes after `uv sync` |
| PIPE-09 | .dlt/config.toml exists with all four config keys | structural smoke | `cd data && python3 -c "import tomllib; t=tomllib.loads(open('.dlt/config.toml').read()); assert t['sources']['inaturalist']['project_id']==166376; assert t['sources']['ecdysis']['dataset_id']==44; assert 'html_cache_dir' in t['sources']['ecdysis_links']; assert t['sources']['ecdysis_links']['html_cache_dir']=='raw/ecdysis_cache'"` | Wave 0: N/A — inline check |
| PIPE-09 | html_cache_dir is not an absolute path | structural smoke | `cd data && python3 -c "import tomllib; t=tomllib.loads(open('.dlt/config.toml').read()); v=t['sources']['ecdysis_links']['html_cache_dir']; assert not v.startswith('/'), v"` | Wave 0: N/A — inline check |
| PIPE-10 | inat pipeline runs and writes rows | integration | `cd data && uv run python inaturalist_pipeline.py && uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM inaturalist_data.observations" ` | Wave 0: N/A — live network call |
| PIPE-10 | ecdysis pipeline runs and writes rows | integration | `cd data && uv run python ecdysis_pipeline.py && uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM ecdysis_data.occurrences"` | Wave 0: N/A — live network call |
| PIPE-10 | geographies pipeline runs and writes rows | integration | `cd data && uv run python geographies_pipeline.py && uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM geographies.ecoregions"` | Wave 0: N/A — live download (~8-9 min first run) |
| PIPE-10 | projects pipeline runs and writes rows | integration | `cd data && uv run python projects_pipeline.py && uv run duckdb beeatlas.duckdb "SELECT COUNT(*) FROM inaturalist_data.projects"` | Wave 0: N/A — requires inat pipeline to have run first |
| PIPE-10 | anti-entropy pipeline runs without error | integration | `cd data && uv run python anti_entropy_pipeline.py && echo "anti-entropy ok"` | Wave 0: N/A — requires inat pipeline to have run first |

### Execution Order for PIPE-10 Verification

Pipelines have ordering requirements due to data dependencies:
1. `geographies_pipeline.py` — no dependencies
2. `inaturalist_pipeline.py` — no dependencies (but anti-entropy depends on it)
3. `ecdysis_pipeline.py` — no dependencies
4. `projects_pipeline.py` — reads `inaturalist_data.observations__observation_projects`; must run after inat
5. `anti_entropy_pipeline.py` — reads `inaturalist_data.observations`; must run after inat

### Sampling Rate

- **Per task commit:** `cd data && python3 -c "import tomllib; ..."` (structural checks above — instant)
- **Per wave merge:** Import smoke test: `cd data && uv run python -c "import dlt, duckdb, requests, bs4, geopandas; print('imports ok')"`
- **Phase gate:** All five pipelines run successfully with non-zero row counts before `/gsd:verify-work`

### Wave 0 Gaps

None — this phase has no existing test infrastructure to extend and no test files to create. All verification is structural (file existence, config content) or integration (run the pipeline). The deleted `data/tests/` tests are not being replaced; they tested code that is being deleted.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pyinaturalist library with v1 API | Direct HTTP to iNat v2 REST API with `DEFAULT_FIELDS` | This phase | Explicit field selection; correct coordinate handling via `geojson.coordinates`; no library dependency |
| pandas/pyarrow for data transformation | dlt schema + write_disposition for transformation and load | This phase | Eliminates ~8 direct dependencies; schema inference with explicit type hints |
| Custom download scripts per module | dlt `@dlt.source` / `@dlt.resource` decorators | This phase | Incremental loads, merge semantics, and pipeline state managed by dlt |
| data/ecdysis/, data/inat/, data/links/, data/scripts/ | Five flat pipeline .py files in data/ | This phase | Simpler structure; no package boundaries needed |

**Deprecated/outdated (by this phase):**
- `data/spatial.py`: Superseded by DuckDB spatial extension (Phase 21 will use it directly)
- `data/tests/`: Tests for deleted code — no replacement needed
- `data/Makefile`: iNat observation fetch rules; no longer relevant
- pyinaturalist, pyinaturalist-convert, pydwca, pandas, pyarrow (explicit), pydantic, sqlalchemy, pyogrio: All removed from deps

## Open Questions

1. **data/README.md content scope**
   - What we know: Current file is empty (1 line); prototype README is comprehensive
   - What's unclear: Should the new README be a copy of the prototype README with names changed, or a shorter project-specific version?
   - Recommendation: Use prototype README as the base; replace "dlt-inat-test" with "beeatlas-data"; keep all pipeline docs. A planner can include "write README.md based on prototype README.md" as a task.

2. **beeatlas.duckdb in data/.gitignore vs root .gitignore**
   - What we know: The root `.gitignore` has no `*.duckdb` entry. `data/.gitignore` currently has no duckdb entry. The file will be created at `data/beeatlas.duckdb` after the first pipeline run.
   - What's unclear: Should the ignore entry go in `data/.gitignore` (scoped to data/) or the root `.gitignore` (covers all)?
   - Recommendation: Add `beeatlas.duckdb` to `data/.gitignore` — it is specific to the data directory.

3. **Whether to keep Makefile targets for non-inat rules**
   - What we know: Makefile has targets for `gbif-backbone/backbone.zip`, `osu_mm/labels-2025.tsv` etc. that are unrelated to the dlt migration.
   - What's unclear: Are these still used anywhere?
   - Recommendation: Delete the entire Makefile — none of these targets are referenced by any current build script, and Phase 22 will introduce a proper runner. The gbif-backbone and osu_mm targets appear to be experimental artifacts.

## Sources

### Primary (HIGH confidence)
- `~/dlt-inat-test/inaturalist_pipeline.py` — read directly; authoritative source for inat + anti-entropy pattern
- `~/dlt-inat-test/ecdysis_pipeline.py` — read directly; authoritative source for ecdysis + links pattern
- `~/dlt-inat-test/geographies_pipeline.py` — read directly; authoritative source for geography loading
- `~/dlt-inat-test/projects_pipeline.py` — read directly; authoritative source for projects pipeline
- `~/dlt-inat-test/anti_entropy_pipeline.py` — read directly; confirms `from inaturalist_pipeline import` dependency
- `~/dlt-inat-test/.dlt/config.toml` — read directly; authoritative config structure
- `~/dlt-inat-test/pyproject.toml` — read directly; authoritative dep list
- `~/dlt-inat-test/uv.lock` — read; confirmed dlt==1.23.0, duckdb==1.5.0
- `/Users/rainhead/dev/beeatlas/data/pyproject.toml` — read directly; confirms what must be replaced
- `/Users/rainhead/dev/beeatlas/data/.gitignore` — read directly; confirms what is currently ignored
- `/Users/rainhead/dev/beeatlas/.planning/phases/20-pipeline-migration/20-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- Prototype README.md — read directly; confirms pipeline invocation patterns and ordering requirements

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read from prototype uv.lock directly
- Architecture: HIGH — all five pipeline files read; import structure confirmed
- Pitfalls: HIGH — derived from direct inspection of existing files; not from general web search
- Config structure: HIGH — read directly from prototype config.toml

**Research date:** 2026-03-27
**Valid until:** Indefinite — all findings are based on local file reads, not external API docs. Prototype is frozen.
