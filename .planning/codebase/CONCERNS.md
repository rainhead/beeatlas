# Codebase Concerns

**Analysis Date:** 2026-02-18

## Tech Debt

**Duplicate dtype specifications:**
- Issue: ECDYSIS_DTYPES in `data/scripts/download.py` and `dtype` dict in `data/ecdysis/occurrences.py` define overlapping column type specs for the same data. The two specs are not in sync (e.g., `occurrences.py` includes many more columns like `infraspecificEpithet`, `identificationReferences`, `municipality` that `download.py` omits).
- Files: `data/scripts/download.py` (lines 94–145), `data/ecdysis/occurrences.py` (lines 9–76)
- Impact: Diverging specs can cause silent data loss or type mismatches when one is updated but not the other.
- Fix approach: Consolidate into a single canonical dtype spec, probably in `data/ecdysis/occurrences.py`, and import it in `download.py`.

**Duplicate MASTER_2025_DTYPES spec:**
- Issue: Column dtype definitions for OSU Museum / master 2025 data appear in both `data/scripts/download.py` (MASTER_2025_DTYPES, lines 46–92) and `data/osu_mm/labels_2025.py` (dtypes, lines 28–75). Many columns differ between the two (e.g., `stateProvince` is `'string'` in download.py vs `'category'` in labels_2025.py; `specimenId` is `'int64'` vs `'uint16'`).
- Files: `data/scripts/download.py`, `data/osu_mm/labels_2025.py`
- Impact: Inconsistent types across pipelines; schema drift is silent.
- Fix approach: Define canonical dtype spec once, import everywhere.

**Incomplete Makefile pipeline:**
- Issue: `data/Makefile` rule for `inat/observations.parquet` is incomplete — the recipe body is just `duckdb` with no arguments or SQL, no output redirection, and no input sources are actually wired up.
- Files: `data/Makefile` (lines 23–25)
- Impact: `make inat/observations.parquet` would fail or produce no output. The iNaturalist data pipeline is effectively broken at the Make level.
- Fix approach: Complete the DuckDB invocation to consume JSON observation files and write parquet output.

**Unused `ecdysis/download.py` argparse block:**
- Issue: `data/ecdysis/download.py` has an `if __name__ == '__main__':` block that parses `--db` and `--state` args but never calls `make_dump()` with them — the script exits without doing anything.
- Files: `data/ecdysis/download.py` (lines 50–55)
- Impact: The CLI entrypoint is a stub; running the script does nothing.
- Fix approach: Wire parsed args into `make_dump()` call, or remove the stub.

**Stale `data/scripts/download.py` and parallel pipeline:**
- Issue: The project has two data download/processing approaches: the old `data/scripts/download.py` using `requests` + pandas directly, and the newer `data/ecdysis/` + `data/osu_mm/` module structure with a Makefile. It is unclear which is canonical; both exist but they overlap.
- Files: `data/scripts/download.py`, `data/ecdysis/download.py`, `data/osu_mm/labels_2025.py`, `data/Makefile`
- Impact: Confusion about which pipeline to run; risk of running outdated scripts that produce stale output.
- Fix approach: Pick one approach (Makefile + module scripts appears to be the newer direction), deprecate or remove the other.

**`inat/observations.py` and `inat/__init__.py` are empty stubs:**
- Issue: `data/inat/observations.py` and `data/inat/__init__.py` contain zero lines of content. The observations pipeline for iNaturalist is not implemented.
- Files: `data/inat/observations.py`, `data/inat/__init__.py`
- Impact: iNaturalist observation data cannot be processed through these modules.
- Fix approach: Implement or remove stub files.

**`inat/projects.py` contains broken SQL fragment:**
- Issue: `data/inat/projects.py` contains a `schema` string with `CREATE TABLE ina` (incomplete, truncated mid-statement) followed by `CREATE TABLE project_observations`. This is never used anywhere.
- Files: `data/inat/projects.py` (lines 6–13)
- Impact: Non-functional dead code. If executed, would fail with SQL syntax error.
- Fix approach: Complete the SQL definition or remove the file.

## Known Bugs

**Debugger left in production code:**
- Symptoms: `import pdb; pdb.set_trace()` on line 95 of `data/ecdysis/occurrences.py` inside `to_parquet()`. Running this function will pause execution and drop into the Python debugger, blocking the pipeline.
- Files: `data/ecdysis/occurrences.py` (line 95)
- Trigger: Call `to_parquet()` or run `data/ecdysis/__init__.py` as a script.
- Workaround: None — will always pause; requires manual `c` to continue or `q` to quit.

**Typo in variable name `speicmenLayer`:**
- Symptoms: Variable is named `speicmenLayer` (transposition of 'i' and 'e') in `frontend/src/bee-map.ts` (line 20). Non-functional bug — it works but is misleading.
- Files: `frontend/src/bee-map.ts` (line 20)
- Trigger: Always present.
- Workaround: Purely cosmetic; does not affect functionality.

**`ecdysis/__init__.py` uses undefined variable `zip`:**
- Symptoms: On line 9 of `data/ecdysis/__init__.py`, `from_zipfile(zip)` references the name `zip`, but the variable is assigned on the line above as `zip = Path(sys.argv[1])`. This would work at runtime, but the name `zip` shadows the Python built-in `zip()` function.
- Files: `data/ecdysis/__init__.py` (line 8)
- Trigger: Always present when script is run.
- Workaround: Rename the variable to avoid shadowing the built-in.

**`parquet.ts` loader does not handle null coordinates:**
- Symptoms: `data/ecdysis/occurrences.py` creates a GeoDataFrame that can have null lat/lon (rows where `decimalLatitude`/`decimalLongitude` are NaN). `frontend/src/parquet.ts` calls `fromLonLat([obj.longitude, obj.latitude])` unconditionally with no null check.
- Files: `frontend/src/parquet.ts` (lines 23–25), `data/ecdysis/occurrences.py`
- Trigger: Any parquet file row with a null latitude or longitude.
- Workaround: None present; would silently produce `NaN` coordinates or crash OpenLayers.

## Security Considerations

**`.env` file present in repo root:**
- Risk: `/Users/rainhead/dev/beeatlas/.env` exists at the repo root and is listed in `.gitignore`. However, its presence adjacent to the git repo means it could be accidentally committed if `.gitignore` is misconfigured.
- Files: `.env` (exists but contents not read)
- Current mitigation: Listed in `.gitignore`.
- Recommendations: Ensure `.gitignore` entry is checked; consider using a secrets manager or environment-specific configuration separate from source.

**Hardcoded Google Sheets URL with dataset ID:**
- Risk: The URL `https://docs.google.com/spreadsheets/d/1lcul17yLdZvd0QmbhUHN-fcDpocsY04v/export?format=csv&gid=784598513` in `data/scripts/download.py` (line 161) and `https://docs.google.com/spreadsheets/d/1lcul17yLdZvd0QmbhUHN-fcDpocsY04v/export?format=tsv` in `data/Makefile` (line 13) expose a specific Google Sheets document ID in source code.
- Files: `data/scripts/download.py` (line 161), `data/Makefile` (line 13)
- Current mitigation: None — the URL is public in source.
- Recommendations: If the sheet contains sensitive data, move the URL to an environment variable.

**External tile layer noted as unmaintained:**
- Risk: `frontend/src/bee-map.ts` line 67 has a comment `// NB: this source is unmaintained` for the `World_Ocean_Reference` tile layer. Unmaintained external tile sources may disappear or serve unexpected content.
- Files: `frontend/src/bee-map.ts` (lines 65–69)
- Current mitigation: None.
- Recommendations: Replace with a maintained tile source or self-host tiles.

**No CORS or rate limiting on the frontend:**
- Risk: The `frontend/package.json` lists `express` and `vite-express` as dev dependencies, but there is no server-side code present in the repo. Any deployed server would need CORS policy and rate limiting configured.
- Files: `frontend/package.json`
- Current mitigation: Not applicable (no server code present).
- Recommendations: Add CORS and rate limiting before deploying any server.

## Performance Bottlenecks

**All parquet data loaded at once with `strategy: all`:**
- Problem: `frontend/src/parquet.ts` uses `strategy: all` from OpenLayers, meaning the entire parquet file is fetched and all features are loaded into memory at once. No pagination or viewport-based loading.
- Files: `frontend/src/parquet.ts` (line 35)
- Cause: `all` loading strategy fetches all features regardless of map viewport.
- Improvement path: Implement a spatial loading strategy (e.g., tile-based or bbox-based) using parquet row-group filtering, or cluster features at lower zoom levels.

**Ecdysis HTML scraping is slow and fragile:**
- Problem: `data/scripts/fetch_inat_links.py` scrapes individual Ecdysis HTML pages to extract iNaturalist observation IDs, rate-limited at 20 req/sec. For ~44,000 specimens, this takes ~37 minutes minimum.
- Files: `data/scripts/fetch_inat_links.py`
- Cause: HTML parsing per record instead of a bulk API call.
- Improvement path: Check if Ecdysis API or data export includes iNaturalist links directly; use iNaturalist API bulk lookup by occurrence ID if possible.

**GBIF backbone download is very large:**
- Problem: `data/scripts/download.py` downloads the entire GBIF backbone taxonomy zip (no size tracking for zip sources after initial download) and loads it fully into pandas before writing to parquet.
- Files: `data/scripts/download.py` (lines 220–233), `data/Makefile` (line 3)
- Cause: The GBIF backbone is ~1GB uncompressed; full in-memory load required before parquet write.
- Improvement path: The `taxon.sql` approach via `data/Makefile` is more efficient (streams from stdin through DuckDB); prefer that path over the pandas approach.

## Fragile Areas

**Ecdysis `.tab` file delimiter inconsistency:**
- Files: `data/CLAUDE.md`, `data/scripts/download.py` (lines 227, 260), `data/ecdysis/occurrences.py` (line 79)
- Why fragile: `.tab` files in Ecdysis dumps use different delimiters depending on the file (`occurrences.tab` is TSV; `identifications.tab`, `multimedia.tab`, `identifiers.tab` are CSV). This is documented in `data/CLAUDE.md` but is an upstream quirk that can change.
- Safe modification: Always verify delimiter before changing any CSV read call on `.tab` files. Use `head -1 file.tab | od -c` to confirm.
- Test coverage: None — no tests for data loading.

**`fetch_inat_links.py` parses HTML with CSS selector `#association-div a[target="_blank"]`:**
- Files: `data/scripts/fetch_inat_links.py` (lines 83–91)
- Why fragile: The iNaturalist link is extracted by a CSS selector tied to Ecdysis page markup. Any Ecdysis HTML redesign will silently break extraction (returns `None` instead of an error).
- Safe modification: Add assertion or logging when the selector matches 0 results unexpectedly.
- Test coverage: None.

**`labels_2025.py` `Reader` import will fail:**
- Files: `data/osu_mm/labels_2025.py` (line 1)
- Why fragile: `from io import Reader` — `Reader` is not an exported name from Python's `io` module. This file will raise `ImportError` when imported.
- Safe modification: Replace with correct type (e.g., `from typing import IO` and `IO[str]`).
- Test coverage: None.

**`bee-map.ts` loads OpenLayers CSS from CDN with pinned version:**
- Files: `frontend/src/bee-map.ts` (line 47)
- Why fragile: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css" ...>` loads CSS from a CDN with a pinned version (v10.8.0) that may drift from the installed `ol` package version (^10.7.0 in package.json). If the package is upgraded, the CSS version must be manually updated.
- Safe modification: Import OpenLayers CSS through the bundler instead of via CDN link to keep versions in sync automatically.
- Test coverage: None.

## Test Coverage Gaps

**No tests exist anywhere in the project:**
- What's not tested: All data download, transformation, and export logic; all frontend map rendering and parquet loading; all SQL schema migrations.
- Files: `data/scripts/download.py`, `data/ecdysis/occurrences.py`, `data/osu_mm/labels_2025.py`, `frontend/src/parquet.ts`, `frontend/src/bee-map.ts`
- Risk: Regressions in data processing pipelines will not be caught. The `pdb.set_trace()` bug exists precisely because there are no tests.
- Priority: High — the root `package.json` test script explicitly returns error: `"test": "echo \"Error: no test specified\" && exit 1"`.

---

*Concerns audit: 2026-02-18*
