# Phase 29: CI Simplification — Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all data pipeline steps from CI. `deploy.yml` runs frontend build only. Delete `fetch-data.yml`. Update `validate-schema` to fetch parquet from CloudFront using Range requests (no AWS creds in build job). Clean up root `build` script to frontend-only.

</domain>

<decisions>
## Implementation Decisions

### fetch-data.yml
- **D-01:** Delete `.github/workflows/fetch-data.yml` entirely. Lambda (Phase 26) owns pipeline execution; CI must not run data pipelines.

### deploy.yml — build job
- **D-02:** Remove `npm run cache-restore` step — it restored parquet to `frontend/src/assets/`, which Phase 28 removed.
- **D-03:** Remove the `Configure AWS credentials via OIDC` step from the **build** job — no AWS steps remain after removing cache-restore. Keep it in the deploy job only.
- **D-04:** Remove `S3_BUCKET_NAME` env var from the build job — only the deploy job needs it.
- **D-05:** Remove `id-token: write` permission from the build job — no OIDC needed without AWS steps.
- **D-06:** Keep `npm run validate-schema` in the build job, but update the script itself (see below).

### validate-schema.mjs — adaptation
- **D-07:** Update `validate-schema.mjs` to auto-detect fetch target:
  - **If** `frontend/src/assets/*.parquet` exists locally → validate from local files (preserves dev workflow for anyone who runs the pipeline locally)
  - **Otherwise** → fetch from CloudFront: `https://beeatlas.net/data/` (production URL)
- **D-08:** Use Range requests to fetch only the parquet footer (schema is in the last few KB). Switch from `asyncBufferFromFile` to a Range-based async buffer (`asyncBufferFromUrl` or a manual Range fetch). This avoids downloading multi-MB files for a schema check.
- **D-09:** No AWS credentials or `S3_BUCKET_NAME` needed — CloudFront is the public endpoint, CORS + Range support already configured (Phase 28, D-11).

### Root package.json build script
- **D-10:** Change the root `build` script from `npm run build:data && npm run build --workspace=frontend` to just `npm run build --workspace=frontend`. Lambda owns data; the root build script should not try to run Python.

### Claude's Discretion
- Exact hyparquet API to use for Range-based footer fetch (`asyncBufferFromUrl` or manual `fetch` with `Range: bytes=-N` header)
- Whether `validate-schema` should print a note when falling back to CloudFront ("No local parquet found — validating against production CloudFront")

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CI Workflows
- `.github/workflows/deploy.yml` — current workflow to modify; remove build-job AWS steps and cache-restore
- `.github/workflows/fetch-data.yml` — to be deleted

### Scripts
- `scripts/validate-schema.mjs` — to be updated; currently reads from `frontend/src/assets/`; switch to CloudFront Range requests with local fallback
- `scripts/cache_restore.sh` — reference only; to be removed from deploy.yml (not deleted)

### Package configuration
- `package.json` — root `build` script to update

### Data endpoints (for validate-schema update)
- CloudFront base URL: `https://beeatlas.net/data/` (ecdysis.parquet, samples.parquet)
- CORS + Range headers configured in Phase 28 (D-11 in `.planning/phases/28-frontend-runtime-fetch/28-CONTEXT.md`)

### Requirements
- `.planning/REQUIREMENTS.md` — CI-01, CI-02

</canonical_refs>

<specifics>
## Specific Ideas

- Parquet schema lives in the file footer; a `Range: bytes=-N` request (e.g. last 32KB) is sufficient for hyparquet to read the schema without fetching the full file.
- `asyncBufferFromUrl` (the non-eager variant) in hyparquet supports Range requests — preferred over manually crafting the `Range` header.
- The build job after this phase: checkout → setup-node → `npm ci` → `npm run validate-schema` → `npm run build --workspace=frontend` → upload artifact. No AWS steps.

</specifics>

---

*Phase: 29-ci-simplification*
*Context gathered: 2026-03-29*
