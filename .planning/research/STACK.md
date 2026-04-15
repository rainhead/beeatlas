# Stack Research

**Domain:** Lambda + EFS pipeline execution; runtime CloudFront data fetching (v1.7 additions)
**Researched:** 2026-03-27
**Confidence:** HIGH for CDK constructs and Python Lambda runtime; MEDIUM for VPC networking cost decisions

---

This file covers only NEW stack additions for v1.7. Existing decisions (CDK v2, hyparquet, Lit, OpenLayers, uv, dlt[duckdb]) are validated and not re-litigated here.

## Recommended Stack

### Core Technologies (New for v1.7)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Lambda container image (ECR) | aws-cdk-lib ^2.238.0 (already pinned) | Package Python pipeline with geopandas + duckdb for Lambda | zip archives are capped at 250 MB unzipped; geopandas + duckdb + dlt exceed this. Container images support up to 10 GB. Container image is the only viable approach. |
| Python 3.14 Lambda runtime | managed runtime `python3.14` (GA Nov 2025) | Match `requires-python = ">=3.14"` in data/pyproject.toml | AWS added Python 3.14 managed runtime in November 2025; available in all regions. Matches existing pyproject.toml constraint exactly. |
| Amazon EFS (`aws-cdk-lib/aws-efs`) | CDK v2 (already pinned) | Persistent DuckDB file across Lambda invocations | Lambda `/tmp` is ephemeral and wiped between invocations. EFS provides durable, cross-invocation storage for `beeatlas.duckdb`. Required for incremental dlt pipeline state. |
| Amazon VPC (`aws-cdk-lib/aws-ec2`) | CDK v2 (already pinned) | EFS requires VPC; Lambda must be in the same VPC | EFS mount targets are VPC-internal. No way to attach EFS to Lambda without placing both in a VPC. |
| EventBridge Scheduler (`aws-cdk-lib/aws-scheduler`) | CDK v2 (already pinned; L2 GA April 2025) | Trigger pipeline Lambda on a daily/weekly cron | Prefer Scheduler over EventBridge Rules for scheduled Lambda: Scheduler is decoupled from event buses, supports flexible time windows, and the L2 construct is now GA in CDK v2. |
| Lambda Function URL (`aws-cdk-lib/aws-lambda`) | CDK v2 (already pinned) | HTTP endpoint for manual pipeline invocation | Simpler than API Gateway for a single-function trigger with no routing needs. Auth `NONE` is acceptable: the Lambda is a write-only operation (pipeline run) with no sensitive output — worst case is a redundant pipeline run. |
| boto3 | bundled in Lambda runtime | Upload DuckDB backup and exported Parquets/GeoJSON to S3 | Already available in the Lambda execution environment; no additional packaging needed for S3 `upload_file` calls. |

### Supporting CDK Constructs (New for v1.7)

| Construct | Module | Purpose | Notes |
|-----------|--------|---------|-------|
| `efs.FileSystem` | `aws-cdk-lib/aws-efs` | EFS filesystem definition | Set `removalPolicy: RETAIN` — do not destroy DuckDB storage on stack update |
| `efs.AccessPoint` | `aws-cdk-lib/aws-efs` | POSIX-scoped mount point for Lambda | Set `ownerUid/Gid: '1000'`, `permissions: '755'`; access point uid is applied at mount |
| `lambda.FileSystem.fromEfsAccessPoint(ap, '/mnt/data')` | `aws-cdk-lib/aws-lambda` | Attach EFS to Lambda at runtime | CDK wires the `elasticfilesystem:ClientMount` permission automatically |
| `lambda.DockerImageFunction` | `aws-cdk-lib/aws-lambda` | Lambda from container image | Use `DockerImageCode.fromImageAsset('./data')` for CDK-managed build + ECR push |
| `ec2.Vpc` | `aws-cdk-lib/aws-ec2` | Isolated VPC for EFS + Lambda | Use `natGateways: 0` and add VPC Gateway Endpoint for S3 (free) |
| `ec2.GatewayVpcEndpoint` (S3) | `aws-cdk-lib/aws-ec2` | Free S3 access from private subnet | S3 Gateway endpoints have no hourly or data-processing charge — eliminates need for NAT gateway for S3 uploads |
| `cloudfront.ResponseHeadersPolicy` | `aws-cdk-lib/aws-cloudfront` | Add CORS headers to CloudFront responses | Needed for `asyncBufferFromUrl` range requests from browser to CloudFront-served Parquets in the same bucket |
| `cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN` | `aws-cdk-lib/aws-cloudfront` | Forward `Origin` header to S3 | Required so S3 can respond with CORS headers; without this, CloudFront strips the Origin header before forwarding to S3 |

### Frontend Change (Runtime Fetching)

| Change | Current | New | Why |
|--------|---------|-----|-----|
| hyparquet data source | `asyncBuffer` from bundled `/assets/*.parquet` | `asyncBufferFromUrl({ url })` pointing to CloudFront | Parquets removed from build bundle; fetched at runtime from CloudFront |
| GeoJSON loading | Vite plugin / bundled import | `fetch(url)` at runtime from CloudFront | Same reasoning — static files served from S3 via CloudFront |
| hyparquet version | `^1.23.3` (already installed) | No change | `asyncBufferFromUrl` has been in hyparquet since early versions; no upgrade needed |

## VPC Networking Decision

**Use `natGateways: 0` + VPC endpoints instead of NAT gateways for S3 traffic.**

NAT gateways cost ~$32/month baseline (one per AZ in a multi-AZ VPC) plus $0.045/GB data processing. For a pipeline Lambda that runs once daily, this is disproportionate.

Architecture recommendation:
- **S3 Gateway Endpoint**: Free. Routes S3 traffic (Parquet uploads, DuckDB backup) within VPC — no NAT needed.
- **ECR Interface Endpoint**: ~$7.30/month. Needed if Lambda cold-start pulls the container image from ECR at invocation time. CDK `DockerImageFunction` manages push to ECR; whether Lambda pulls from ECR at cold-start or from a cached layer is worth confirming at implementation time.
- **Internet access for pipeline HTTP calls** (Ecdysis, iNaturalist HTTP APIs): Lambda in a private subnet with no NAT cannot make arbitrary outbound HTTP calls. Two options:
  1. **NAT Instance** (t3.nano, ~$3/month) — cheapest path for outbound internet using `ec2.NatProvider.instanceV2()`
  2. **NAT Gateway** (one, single AZ, ~$32/month) — operationally simpler but expensive for this use case
  - Recommendation: start with a single NAT gateway for simplicity; revisit with NAT instance if monthly cost is a concern. Flag as implementation-time cost decision.

## Lambda Packaging: Container Image

Use `DockerImageCode.fromImageAsset('./data')` — CDK builds the image locally from `data/Dockerfile` and pushes it to ECR.

Write a multi-stage `Dockerfile`:

```
Stage 1 (builder): FROM python:3.14-slim
  - COPY pyproject.toml uv.lock
  - RUN uv pip install --target /deps --python-platform x86_64-manylinux2014

Stage 2 (runtime): FROM public.ecr.aws/lambda/python:3.14
  - COPY --from=builder /deps /var/task
  - COPY *.py /var/task/
  - CMD ["lambda_handler.handler"]
```

Do not use `@aws-cdk/aws-lambda-python-alpha` — it is alpha-stability and adds bundling magic that obscures the Dockerfile. The alpha construct's uv support mirrors what a well-written Dockerfile achieves directly.

**Why container image over zip:**
- geopandas alone (with GDAL/GEOS native deps) exceeds the 250 MB unzipped zip limit
- duckdb binary adds ~50 MB; dlt adds additional dependencies
- Container images support up to 10 GB; total image will be ~800 MB–1.5 GB, well within limit
- Multi-stage builds keep the final image lean by excluding build tools

**Pre-install DuckDB spatial extension in image:** The DuckDB spatial extension downloads native binaries at first `INSTALL spatial` call. In Lambda, this write path is restricted. Pre-install by running `INSTALL spatial` during the Docker build and copying the extension files into the image.

## CORS for CloudFront

The frontend fetches Parquets and GeoJSON from the CloudFront distribution via `asyncBufferFromUrl` (which uses HTTP range requests). Since the frontend is served from `beeatlas.net` and the Parquets are also served from `beeatlas.net` via the same CloudFront distribution, this is technically same-origin — no CORS is needed in production.

However, local development (`localhost:5173`) makes cross-origin requests to CloudFront. Add CORS support preemptively:

1. **S3 bucket CORS rule**: allow `GET`, `HEAD` from `https://beeatlas.net` and `http://localhost:*`
2. **CloudFront origin request policy**: use `OriginRequestPolicy.CORS_S3_ORIGIN` managed policy to forward the `Origin` header to S3 — required for S3 to include CORS response headers
3. **CloudFront response headers policy**: use `ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS` managed policy on the default behavior, or create a custom policy scoped to specific origins

CDK managed policy names (already in `aws-cdk-lib/aws-cloudfront`):
- `cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS` — adds `Access-Control-Allow-Origin: *`
- `cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN` — forwards `Origin`, `Access-Control-Request-Headers`, `Access-Control-Request-Method` to S3

## CDK Import Summary

All new constructs are in `aws-cdk-lib` (already installed at ^2.238.0). No new npm packages needed:

```
aws-cdk-lib/aws-efs       → efs.FileSystem, efs.AccessPoint
aws-cdk-lib/aws-ec2       → ec2.Vpc, ec2.SubnetType, ec2.GatewayVpcEndpoint
aws-cdk-lib/aws-lambda    → lambda.DockerImageFunction, lambda.DockerImageCode,
                             lambda.FileSystem, lambda.FunctionUrlAuthType
aws-cdk-lib/aws-scheduler → scheduler.Schedule, scheduler.ScheduleExpression,
                             scheduler.targets.LambdaInvoke
aws-cdk-lib/aws-cloudfront → cloudfront.ResponseHeadersPolicy,
                              cloudfront.OriginRequestPolicy
```

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Container image Lambda | Zip archive | geopandas + duckdb exceed 250 MB unzipped zip limit |
| Container image Lambda | Lambda Layers | Layers also subject to 250 MB unzipped limit; managing multiple layers for geopandas is fragile |
| EFS for DuckDB persistence | S3 download/upload per run | DuckDB WAL and incremental dlt state require a real filesystem; S3 round-trips on every run break dlt's incremental state model. S3 backup is additive (disaster recovery), not the primary store. |
| EventBridge Scheduler | EventBridge Rules (cron) | Scheduler L2 is now GA; Scheduler supports flexible time windows and doesn't require an event bus |
| Lambda Function URL | API Gateway | API Gateway adds cost and complexity for a single-function, no-auth invocation endpoint |
| `natGateways: 0` + S3 endpoint | Full NAT Gateway | NAT Gateway ~$32/month baseline is disproportionate for a once-daily pipeline Lambda |
| `asyncBufferFromUrl` (existing hyparquet) | DuckDB WASM in browser | DuckDB WASM is planned for v1.7+ (noted in project memory) but is a separate milestone; `asyncBufferFromUrl` is the minimal change for runtime fetching with the existing hyparquet stack |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@aws-cdk/aws-lambda-python-alpha` | Alpha stability; obscures packaging with magic; no advantage over a hand-written Dockerfile | `lambda.DockerImageFunction` with `DockerImageCode.fromImageAsset` |
| Zip/layer deployment | geopandas + duckdb exceed 250 MB unzipped limit | Container image (10 GB limit) |
| `/tmp` for DuckDB persistence | Ephemeral; wiped between Lambda invocations | EFS mount at `/mnt/data/beeatlas.duckdb` |
| `removalPolicy: DESTROY` on EFS | Would delete `beeatlas.duckdb` on stack update | `removalPolicy: RETAIN` |
| `OriginAccessIdentity` (OAI) | Deprecated CDK pattern; project already uses OAC | `S3BucketOrigin.withOriginAccessControl()` (already used) |
| Lambda managed runtime (non-container) | geopandas GDAL native libs not present in managed runtime; DuckDB spatial extension installation blocked | Container image with full Python environment and pre-installed extensions |
| `INSTALL spatial` at Lambda invocation time | DuckDB extension installer writes to filesystem; Lambda `/tmp` is limited and the extension downloads from the internet (requires NAT) | Pre-install spatial extension during Docker build, copy extension files into image |

## Version Compatibility

| Package | Version | Compatibility Notes |
|---------|---------|---------------------|
| aws-cdk-lib | ^2.238.0 (pinned in infra/) | `aws_scheduler` L2 went GA April 2025; available in 2.238.0+ |
| Python Lambda runtime | `python3.14` | GA November 2025; all regions |
| hyparquet | ^1.23.3 (pinned in frontend/) | `asyncBufferFromUrl` stable API; no version change needed |
| dlt[duckdb] | >=1.23.0 (pyproject.toml) | dlt uses `DESTINATION__FILESYSTEM__BUCKET_URL` and `PIPELINE_WORKING_DIR` env vars; set working dir to EFS mount path in Lambda env |
| duckdb | any (pyproject.toml) | Spatial extension must be pre-installed in container image; cannot download at Lambda runtime without NAT/internet access |

## Sources

- [AWS Lambda Python 3.14 announcement (Nov 2025)](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-lambda-python-314/) — HIGH confidence (official AWS announcement)
- [AWS Lambda quotas — container image 10 GB limit](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html) — HIGH confidence (official docs)
- [Lambda FileSystem CDK API](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.FileSystem.html) — HIGH confidence (official CDK docs)
- [uv AWS Lambda packaging guide](https://docs.astral.sh/uv/guides/integration/aws-lambda/) — HIGH confidence (official uv docs; covers zip and container image approaches)
- [EventBridge Scheduler L2 GA announcement (April 2025)](https://aws.amazon.com/about-aws/whats-new/2025/04/aws-cdk-construct-library-eventbridge-scheduler/) — HIGH confidence (official AWS announcement)
- [Lambda FunctionUrl CDK construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.FunctionUrl.html) — HIGH confidence (official CDK docs)
- [S3 Gateway Endpoint — no charge](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html) — HIGH confidence (official AWS docs)
- [CloudFront ResponseHeadersPolicy CDK](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront.ResponseHeadersPolicy.html) — HIGH confidence (official CDK docs)
- [hyparquet asyncBufferFromUrl README](https://github.com/hyparam/hyparquet/blob/master/README.md) — HIGH confidence (official repo)
- [NAT gateway vs VPC endpoint cost](https://www.vantage.sh/blog/nat-gateway-vpc-endpoint-savings) — MEDIUM confidence (third-party pricing analysis consistent with AWS pricing page)
- [dlt on AWS Lambda (Leolytix article)](https://medium.com/leolytix/serverless-elt-with-dlt-deploying-open-source-data-pipelines-on-aws-lambda-a53294cc4089) — MEDIUM confidence (community source; confirms env var config pattern)

---
*Stack research for: BeeAtlas v1.7 — Lambda + EFS pipeline execution, runtime CloudFront data fetching*
*Researched: 2026-03-27*

---

# iNat API: Observation Field Filtering (v2.3 addition)

**Domain:** iNaturalist REST API — filtering observations by observation field value
**Researched:** 2026-04-12
**Confidence:** HIGH — all key claims verified by direct live API calls

## The WABA Observation Field

Field id 18116, name "WABA", datatype "numeric", description "Washington Bee Atlas Id". As of 2026-04-12 the field has 1,374 observations and 1,374 users. It was created 2024-07-16 and last updated 2026-03-18.

```json
{"id": 18116, "name": "WABA", "datatype": "numeric", "values_count": 1374, "users_count": 1374}
```

Source: `https://www.inaturalist.org/observation_fields.json?q=WABA` — verified by live API call.

## Filtering Parameter: `field:WABA=`

Both the v1 and v2 iNaturalist REST APIs accept the `field:FIELDNAME=VALUE` query parameter for observation field filtering. The parameter name is not listed in Swagger (`/v1/swagger.json`) — it is a pass-through from the Rails web search URL syntax. It is, however, fully functional.

**Correct parameter:** `field%3AWABA=` (URL-encoded `field:WABA=`)

- Omitting the value (i.e., `field:WABA=` with empty value) returns all observations that have the field set to any value. This is the correct form for the pipeline — fetch all WABA-tagged observations regardless of value.
- Setting a specific value (e.g., `field:WABA=1`) would filter to observations where WABA equals exactly that number. Do not use this — catalog numbers are arbitrary integers, not a filter target.

**Verified results (live API calls):**

| Query | Total results |
|-------|--------------|
| `GET /v1/observations?field%3AWABA=&per_page=1` | 1374 |
| `GET /v2/observations?field%3AWABA=&per_page=1&fields=id` | 1374 |
| `GET /v1/observations?field%3AWABA=1&per_page=1` | 0 (specific value=1 matches nothing) |

## API Version: Use v2 (Consistent with Existing Pipeline)

The existing `inaturalist_pipeline.py` uses `https://api.inaturalist.org/v2/` as `base_url`. Use v2 for the new WABA pipeline too. The `field:WABA=` filter works identically on both v1 and v2 — verified by direct comparison.

## Incremental Cursor: `updated_since` (Identical to Existing Pipeline)

The WABA pipeline can use the same incremental pattern as the existing pipeline: `updated_since={incremental.start_value}` with `cursor_path: updated_at`. Verified working:

```
GET /v2/observations?field%3AWABA=&updated_since=2026-01-01T00%3A00%3A00%2B00%3A00&order_by=updated_at&order=asc&per_page=200
→ total_results: 303 (observations updated since 2026-01-01)
```

The dlt RESTAPIConfig for the new pipeline is structurally identical to the existing `inaturalist_source`, with `project_id` replaced by `"field%3AWABA": ""` (or equivalent param construction).

**Note on dlt RESTAPIConfig param encoding:** dlt's REST API source sends params as query string key-value pairs. The param key must be the literal string `field:WABA` (with colon, not URL-encoded) — the HTTP library handles URL encoding. Verify this during implementation; if dlt does not encode colons in param keys, pass it pre-encoded as `field%3AWABA`.

## WABA Field Value Format and Join Key

WABA field values are **plain integers** (datatype: numeric), e.g., `2420796`. They correspond to the numeric suffix of Ecdysis `catalog_number` values, which have the format `WSDA_{integer}`.

**Join condition verified by live data:**

| iNat observation | WABA value | Ecdysis catalog_number |
|-----------------|-----------|----------------------|
| 225243616 | 2420796 | WSDA_2420796 |
| 229760637 | 2417133 | WSDA_2417133 |
| 220980576 | 2414072 | WSDA_2414072 |

The export join is:
```sql
CAST(waba_observations.waba_value AS BIGINT) = CAST(SPLIT_PART(occurrences.catalog_number, '_', 2) AS BIGINT)
```

Or equivalently:
```sql
occurrences.catalog_number = 'WSDA_' || waba_observations.waba_value
```

The second form is simpler — WABA values are always the raw integer suffix.

## Minimum Fields Required

The WABA pipeline only needs to extract: `id`, `uuid`, `updated_at`, `ofvs.field_id`, `ofvs.value`. The WABA value is in `ofvs` filtered to `field_id=18116`.

Verified response shape from v2 with `fields=id,uuid,updated_at,ofvs.field_id,ofvs.value`:
```json
{"id": 225243616, "uuid": "0497519d-...", "updated_at": "2024-07-16T...", "ofvs": [{"field_id": 18116, "value": "2420796"}]}
```

The `value` field is a string in the API response even though the field datatype is numeric. Cast to integer in the transform or in the export SQL.

## Pagination

With 1,374 total observations and `per_page=200`, the full corpus spans 7 pages. The existing pipeline uses `stop_after_empty_page: true` with no `total_path` — this works correctly here too. The iNat API does not paginate beyond 10,000 results (hard cap), so the WABA corpus (1,374) is well within bounds.

No pagination behavior differences between observation field queries and project queries were observed.

## Rate Limiting

The iNat API has an **official limit of 100 requests/minute**, with a recommendation to stay at or below 60/minute. Community reports indicate 429 errors can appear even at 60/minute for some endpoints. The existing pipeline does not implement explicit rate limiting beyond dlt's default behavior.

For the WABA pipeline: 7 pages per full fetch is negligible. Incremental nightly runs will typically fetch 1-3 pages. Rate limiting is not a concern for this pipeline at its current scale.

No authentication is required for read access to public observations filtered by observation field. The WABA field observations are all public.

## Differences from Project-Based Queries

| Aspect | Project query (existing) | Field query (new) |
|--------|--------------------------|-------------------|
| Filter param | `project_id=166376` | `field%3AWABA=` |
| Auth required | No | No |
| Incremental cursor | `updated_since` | `updated_since` (identical) |
| Pagination behavior | `stop_after_empty_page` | `stop_after_empty_page` (identical) |
| OFVs in response | Yes, multiple fields | Yes, at least field_id=18116 |
| Total corpus size | ~unknown | 1,374 observations |
| Rate limit exposure | Same | Same |

The only material difference is the filter parameter. The rest of the pipeline configuration is identical.

## Sources

- `https://www.inaturalist.org/observation_fields.json?q=WABA` — live API call confirming field id=18116, name="WABA", datatype="numeric", values_count=1374 — HIGH confidence
- `https://api.inaturalist.org/v1/observations?field%3AWABA=&per_page=1` — live API call confirming 1374 results — HIGH confidence
- `https://api.inaturalist.org/v2/observations?field%3AWABA=&per_page=1&fields=id` — live API call confirming v2 support — HIGH confidence
- `https://api.inaturalist.org/v2/observations?field%3AWABA=&updated_since=...&order_by=updated_at` — live API call confirming incremental query works — HIGH confidence
- [iNaturalist API rate limits — forum discussion](https://forum.inaturalist.org/t/429-error-from-observations-histogram-api-when-calling-at-60-calls-minute/64709) — MEDIUM confidence (community report; documented limit is 100/min, practical safe limit ~60/min)
- [iNaturalist API forum — field: parameter syntax](https://forum.inaturalist.org/t/query-api-by-observation-field-or-observation-field-value/39719) — MEDIUM confidence (community-confirmed syntax; not in official Swagger docs)

---
*iNat API field filtering research for: BeeAtlas v2.3 — WABA observation field pipeline*
*Researched: 2026-04-12*

---

# DEM Elevation Annotation: Raster Stack (v2.5 addition)

**Domain:** USGS 3DEP DEM download + raster point sampling in Python pipeline
**Researched:** 2026-04-15
**Confidence:** HIGH for rasterio capabilities and Python compatibility; MEDIUM for seamless-3dep (newer library, limited secondary sources); LOW for DuckDB-native raster sampling (community extension, not production-ready)

This section covers only NEW stack additions for v2.5 elevation annotation. All existing decisions (dlt, DuckDB, uv, export.py spatial pattern) are unchanged.

## Recommended Stack

### New Python Dependencies

| Package | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `seamless-3dep` | `>=0.4.1` | Download USGS 3DEP 10m DEM GeoTIFF tiles for a bounding box | Recommended successor to py3dep (v0.19.0 changelog explicitly directs users here). `get_dem(bbox, data_dir)` downloads tiles to disk; returns list of file paths. Lightweight: only requires `requests` + `rasterio`. No xarray/shapely needed for the download path alone. Latest: 0.4.1 (2026-03-13). |
| `rasterio` | `>=1.4.4` | Sample elevation values at (lon, lat) point coordinates from GeoTIFF | Industry-standard raster I/O for Python. `rasterio.sample.sample_gen(dataset, xy_pairs)` yields one array per coordinate — the exact primitive needed. v1.4.4 explicitly supports Python 3.14 (confirmed; free-threading wheels available). Requires GDAL >=3.6 (bundled in pip wheels — no system GDAL needed). |

### Integration Point: export.py

No new pipeline step is needed. The DEM download and elevation sampling belongs in `export.py`, alongside the existing spatial join logic:

1. Download WA DEM once per run to a local cache path (e.g., `data/dem_cache/`). Skip download if files already exist.
2. Open the GeoTIFF with rasterio and call `sample_gen` with all (lon, lat) coordinate pairs from the ecdysis and samples tables.
3. Add `elevation_m` as INT16 (nullable) to both `ecdysis.parquet` and `samples.parquet` output via the existing `COPY (...) TO ... (FORMAT PARQUET)` SQL.

The DEM is a pipeline input, not a dlt resource — it does not need dlt wrapping.

### DEM Source: USGS 3DEP 1/3 arc-second (~10m)

The 1/3 arc-second (~10m horizontal resolution) seamless DEM covers all of Washington state. This is the correct product:
- USGS dataset: "1/3rd arc-second Digital Elevation Models (DEMs) — USGS National Map 3DEP"
- Accessed via: `seamless-3dep` calls the TNM (The National Map) staging service directly
- WA bounding box: `(-124.85, 45.55, -116.95, 49.0)` — covers the full state
- At 10m resolution, this covers ~760km × ~370km ≈ ~10.5 million pixels. Tile-based download is automatic.

### Rasterio Sampling Pattern

```python
import rasterio
from rasterio.sample import sample_gen

with rasterio.open("path/to/dem_tile.tif") as src:
    # xy must be in the dataset's CRS (EPSG:4326 for 3DEP)
    # yields arrays; band 1 value is the elevation in meters
    for val in sample_gen(src, [(lon, lat), ...], indexes=1):
        elevation = val[0]  # INT or nodata sentinel
```

For the export use case: collect all (lon, lat) pairs from both tables, batch-sample against the merged/VRT DEM, then join elevations back by index position before writing parquet.

seamless-3dep returns tiles in EPSG:4326, which matches the lat/lon stored in ecdysis and samples tables — no reprojection needed.

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `py3dep` | Superseded. The HyRiver changelog for v0.19.0 explicitly recommends `seamless-3dep` as the replacement. py3dep has heavier dependencies (aiohttp, async stack). | `seamless-3dep` |
| `geopandas` | Already removed from pipeline in v2.2 (caused OOM in geographies pipeline). No vector operations needed here — sampling is coordinate-list-based. | `rasterio.sample.sample_gen` directly |
| `xarray` / `rioxarray` | Required only by `seamless-3dep`'s `tiffs_to_da()` conversion function. That function is not needed — we want files on disk for rasterio, not an xarray array. | Omit; use `get_dem()` return value (list of file paths) directly |
| `shapely` | Only required by `seamless-3dep`'s optional `tiffs_to_da()` path. Not needed for download + rasterio sampling. | Omit |
| `pyproj` | Only needed for CRS reprojection. 3DEP tiles are already EPSG:4326 — same CRS as stored coordinates. | Omit |
| `elevation` (PyPI) | Older SRTM-based library. SRTM data is 30m (3 arc-second) vs 10m for 3DEP. Lower resolution; not USGS-sourced. | `seamless-3dep` + `rasterio` |
| DuckDB `geotiff` community extension | Exposes `read_geotiff()` as a table function returning (cell_id, value) pairs — not a point-sampling primitive. No spatial join to coordinate pairs. Community extension (not core spatial extension). Would require rebuilding the entire sampling logic in SQL against a cell-id join, which is more complex and less direct than `rasterio.sample_gen`. | `rasterio` |
| DuckDB spatial raster prototype (`duckdb-spatial-raster`) | Early-stage community prototype; no stable API, no pip package. | `rasterio` |
| `GDAL` system install | `rasterio` wheels from PyPI bundle GDAL internally — no system `libgdal-dev` needed. Installing system GDAL alongside pip rasterio risks version conflicts. | `pip install rasterio` only |

## DEM Caching Strategy

The DEM tiles (~500MB–1GB for WA at 10m) should be cached on disk between pipeline runs — consistent with the S3 caching pattern used for `links.parquet` and `samples.parquet`.

Recommended approach:
- Store tiles in `data/dem_cache/` (local, gitignored)
- `seamless-3dep`'s `get_dem()` accepts a `data_dir` argument and skips download if files exist
- On maderas (the nightly cron host), the cache persists between runs in the same directory — no S3 round-trip needed for the DEM
- The DEM is a stable dataset (USGS updates are infrequent) — no incremental update logic needed

If the pipeline moves to Lambda, the DEM would need S3 caching (same pattern as links.parquet). That is out of scope for v2.5 since maderas cron is the execution path.

## pyproject.toml Addition

```toml
dependencies = [
    "dlt[duckdb]>=1.23.0",
    "duckdb",
    "requests",
    "beautifulsoup4",
    "boto3>=1.42.78",
    "seamless-3dep>=0.4.1",
    "rasterio>=1.4.4",
]
```

No frontend changes. The `elevation_m` column is consumed via the existing DuckDB WASM SQL query path in the browser — no new frontend libraries.

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|------------|-------|
| rasterio 1.4.4 supports Python 3.14 | HIGH | Official release notes confirm Python 3.14 support and free-threading wheels |
| `sample_gen(dataset, xy_pairs)` is the correct sampling API | HIGH | Context7 (rasterio official docs), confirmed by PyPI `rasterio.sample` module docs |
| seamless-3dep 0.4.1 is the recommended 3DEP download library | MEDIUM | py3dep v0.19.0 changelog recommends it; PyPI page confirms 0.4.1 (2026-03-13); limited secondary sources |
| WA bounding box covers all specimens | MEDIUM | Based on known WA state bounds; verify against actual data extent at implementation time |
| No CRS reprojection needed (3DEP = EPSG:4326) | HIGH | seamless-3dep documentation states "downloads as GeoTIFF files in EPSG:4326" |
| DuckDB has no production-ready ST_Value equivalent | HIGH | DuckDB spatial extension docs confirm no raster sampling functions; community extensions are prototypes only |

## Sources

- [rasterio 1.4.4 release — Python 3.14 support confirmed](https://sgillies.net/2025/12/12/rasterio-1-4-4.html) — HIGH confidence (author's blog; Sean Gillies is rasterio maintainer)
- [rasterio PyPI page](https://pypi.org/project/rasterio/) — HIGH confidence (official)
- [rasterio Context7 docs — sample_gen](https://github.com/rasterio/rasterio/blob/main/docs/api/rasterio.sample.rst) — HIGH confidence (official source)
- [seamless-3dep PyPI page — version 0.4.1, 2026-03-13](https://pypi.org/project/seamless-3dep/) — HIGH confidence (official)
- [seamless-3dep GitHub — get_dem API](https://github.com/hyriver/seamless-3dep) — MEDIUM confidence (official repo; limited doc depth fetched)
- [py3dep v0.19.0 changelog — recommends seamless-3dep](https://docs.hyriver.io/changelogs/py3dep.html) — HIGH confidence (official HyRiver docs)
- [DuckDB geotiff community extension](https://duckdb.org/community_extensions/extensions/geotiff) — HIGH confidence (official DuckDB community extensions page; confirmed limited to cell_id/value tabular output, not point sampling)
- [USGS 3DEP 1/3 arc-second dataset catalog](https://data.usgs.gov/datacatalog/data/USGS:3a81321b-c153-416f-98b7-cc8e5f0e17c3) — HIGH confidence (official USGS data catalog)

---
*DEM elevation annotation stack research for: BeeAtlas v2.5*
*Researched: 2026-04-15*
