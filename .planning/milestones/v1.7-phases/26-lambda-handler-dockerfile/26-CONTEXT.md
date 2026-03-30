# Phase 26: Lambda Handler + Dockerfile - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the stub Lambda handler with a real handler that: downloads `beeatlas.duckdb` from S3 `/db/` to `/tmp/`, runs the dlt pipelines, runs `export.py` to produce parquet/geojson to `/tmp/export/`, uploads the four data files to S3 `/data/`, backs up the updated DuckDB to S3 `/db/`, and triggers a CloudFront invalidation on `/data/*`. Update the Dockerfile to include all pipeline dependencies.

</domain>

<decisions>
## Implementation Decisions

### Nightly pipeline scope
- **D-01:** When the EventBridge nightly trigger fires (`event.pipeline == 'inat'`), run: **ecdysis → ecdysis-links → inaturalist → projects → export**. Skip geographies (static dataset, rarely changes).
- **D-02:** When the weekly trigger fires (`event.pipeline == 'full'`), run all six steps: **geographies → ecdysis → ecdysis-links → inaturalist → projects → export**.
- **D-03:** The handler dispatches based on `event.get('pipeline', 'full')` — default to full run if no pipeline field present (e.g., Lambda URL invocation without a body).

### export.py output strategy
- **D-04:** Replace the hardcoded `ASSETS_DIR` in `export.py` with `os.environ.get('EXPORT_DIR', default_local_path)` where `default_local_path` is the existing `frontend/src/assets/` path. Local dev continues to work unchanged. In Lambda, `EXPORT_DIR=/tmp/export` is set so files land in `/tmp/`.
- **D-05:** The Lambda handler creates `/tmp/export/` before calling export, then uploads the four files from there to S3 `/data/` prefix.

### CloudFront invalidation
- **D-06:** Add `DISTRIBUTION_ID` env var to the Lambda function in `infra/lib/beeatlas-stack.ts` (set to `distribution.distributionId`). The handler reads this to create the invalidation. This requires a CDK change alongside the handler change.

### Handler file
- **Claude's Discretion:** Whether to replace `stub_handler.py` in-place or create a new `handler.py` and update the Dockerfile `CMD`. Either is acceptable — prefer whichever keeps the Dockerfile CMD stable (replacing stub_handler.py avoids a CDK redeploy just to change CMD).

### Dockerfile
- **Claude's Discretion:** Install all pipeline dependencies from `pyproject.toml` via `uv` during Docker build. The image must include GDAL/spatial stack (pyproj, duckdb spatial extension), dlt, and boto3. Pin to the Python version in `pyproject.toml`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §"v1.7 Requirements" — PIPE-11, PIPE-12, PIPE-13, PIPE-14

### Existing Lambda stub + orchestrator
- `data/stub_handler.py` — Current stub handler (S3 round-trip only); will be replaced with real logic
- `data/run.py` — Pipeline orchestrator; defines STEPS list and order
- `data/export.py` — Export script; hardcodes ASSETS_DIR — D-04 above requires updating this

### Existing Dockerfile
- `data/Dockerfile` — Minimal stub Dockerfile; needs full dependency installation

### CDK stack (needs DISTRIBUTION_ID env var added)
- `infra/lib/beeatlas-stack.ts` — Lambda function definition; `BUCKET_NAME` already set; `DISTRIBUTION_ID` must be added

### Phase 25 context (architecture decisions)
- `.planning/phases/25-cdk-infrastructure/25-CONTEXT.md` — D-01 through D-11 carry forward

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/stub_handler.py` — S3 download/upload pattern with graceful miss on first run; reuse this for DuckDB download
- `data/run.py` — `STEPS` list can be sliced by name to produce the nightly subset; `main()` is thin — handler can call individual step functions directly

### Established Patterns
- `BUCKET_NAME` env var already set on Lambda; `DLT_DATA_DIR=/tmp/dlt` and `temp_directory=/tmp/duckdb_swap` already set
- S3 path convention: `db/beeatlas.duckdb` for backup, `data/` prefix for exports — consistent with D-02/D-04 from Phase 25

### Integration Points
- `export.py` imports `duckdb` and reads from `data/beeatlas.duckdb` (local path) — the Lambda handler must set `DB_PATH` or ensure `/tmp/beeatlas.duckdb` is where export.py looks. The `DB_PATH` in export.py is hardcoded as `Path(__file__).parent / "beeatlas.duckdb"` — this also needs an env var or parameter for Lambda (handler writes DuckDB to `/tmp/beeatlas.duckdb`)
- CDK stack needs one new env var: `DISTRIBUTION_ID: distribution.distributionId` — small addition, no architectural change

</code_context>

<specifics>
## Specific Ideas

- Nightly run skips geographies because it's a static dataset (county + ecoregion shapefiles) that changes infrequently. The user confirmed ecdysis and ecdysis-links are cheap enough (< 1 min, incremental) to include in the nightly run.
- `EXPORT_DIR` env var approach keeps export.py usable locally without changes to invocation.

</specifics>

<deferred>
## Deferred Ideas

- Lambda monitoring / CloudWatch alarms on failure — out of scope for v1.7
- Partial export on pipeline failure (export whatever succeeded) — not worth the complexity; fail fast is correct
- Separate Lambda functions for nightly vs. weekly — single function with dispatch is sufficient

</deferred>

---

*Phase: 26-lambda-handler-dockerfile*
*Context gathered: 2026-03-28*
