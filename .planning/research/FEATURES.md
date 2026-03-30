# Feature Research

**Domain:** Lambda + EFS pipeline serving a static frontend — nightly data pipeline with runtime S3 data fetching
**Researched:** 2026-03-27
**Confidence:** HIGH (AWS docs and CDK patterns verified; iNat API limits confirmed from official source; DuckDB/Lambda patterns from multiple sources; pipeline code directly inspected)

---

## Scope: v1.7 Production Pipeline Infrastructure

This milestone moves pipeline execution from local/CI invocation to a scheduled Lambda function
with EFS-backed DuckDB. The frontend stops receiving bundled Parquets and GeoJSON; instead, it
fetches all data files from CloudFront at runtime after each pipeline run uploads them to S3.

**Existing baseline:**
- `data/run.py` orchestrates six pipeline steps sequentially (geographies → ecdysis →
  ecdysis-links → inaturalist → projects → export)
- `data/export.py` writes four files to `frontend/src/assets/` (two Parquets, two GeoJSON)
- CI deploys frontend only; pipeline runs locally against local `beeatlas.duckdb`
- CloudFront + S3 already deployed via CDK

**v1.7 target:**
- Lambda runs `run.py` on a schedule and on-demand; outputs go to S3 not local filesystem
- EFS holds `beeatlas.duckdb` between Lambda invocations; S3 holds a backup copy
- Frontend fetches Parquets and GeoJSON from CloudFront URL at runtime; no bundled data
- `data/fixtures/beeatlas-test.duckdb` committed for reproducible pytest coverage
- CI builds frontend only (no pipeline code, no data fetching)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any production-grade Lambda data pipeline must have. Missing these makes the
system fragile or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Scheduled invocation (EventBridge) | Data freshness without manual intervention; nightly fetch is the standard for incremental APIs | LOW | EventBridge Scheduler cron rule → Lambda; CDK `aws_events` + `aws_events_targets`; prefer EventBridge Scheduler over legacy CloudWatch Events rule |
| Lambda timeout set to maximum (15 min) | Full pipeline run (Ecdysis scrape on first run, iNat incremental, export) can take several minutes; default 3s is fatal | LOW | AWS hard limit is 900s; set to 900 in CDK; scrape-heavy runs must complete within this window or be broken into phases |
| EFS mount on Lambda via VPC | DuckDB requires a persistent writable filesystem between invocations; Lambda `/tmp` is 10 GB but ephemeral — data disappears between cold starts | MEDIUM | Lambda must be in VPC; EFS mount target in same VPC; CDK `FileSystem` + `AccessPoint` + `addFileSystemMount`; adds VPC cold start (~1s, no longer significant as of 2023) |
| S3 backup of DuckDB after pipeline run | EFS is persistent but not durable against EFS volume loss; S3 is the authoritative backup and restore point | LOW | `aws s3 cp /mnt/efs/beeatlas.duckdb s3://bucket/pipeline/beeatlas.duckdb` after successful export; restore from S3 if EFS file missing on cold start |
| S3 upload of exported data files | Pipeline output (4 files) must be in S3 for the frontend to fetch them from CloudFront | LOW | `export.py` writes to `/tmp/` or directly to S3 via DuckDB `COPY TO 's3://...'`; or write locally then `aws s3 cp` |
| Frontend fetches data at runtime | Frontend can no longer rely on bundled Parquets; they must be fetched from CloudFront URL | MEDIUM | `fetch()` calls in frontend boot path; URLs hardcoded to CloudFront domain or injected via Vite env var; hyparquet already reads from `ArrayBuffer` so wire format is compatible |
| CloudFront CORS configured for data files | `fetch()` from the same CloudFront origin as the HTML page does not trigger CORS; but if the distribution domain is different from the app domain, CORS headers are required | LOW | Same origin = no CORS needed; if beeatlas.net CloudFront distribution also serves data files, CORS is a non-issue; confirm single vs. separate distribution decisions |
| Lambda URL for manual invocation | Operators need a way to trigger a pipeline run outside the schedule (post-incident re-run, test after deploy) | LOW | CDK `FunctionUrl` with `authType: NONE` is simplest; restrict to IAM auth if any sensitive data flows through the URL; async invoke pattern returns 202 immediately |
| IAM role for Lambda execution | Lambda needs S3 write access (data files + DuckDB backup), EFS access, CloudWatch Logs | LOW | CDK `role` with `s3:PutObject`, `s3:GetObject` on specific prefixes; EFS access via VPC/security group; least-privilege |
| CloudWatch Logs for pipeline runs | The primary debugging surface for scheduled Lambda; print() from run.py must appear in logs | LOW | Lambda writes stdout/stderr to CloudWatch by default; log group retention should be set (default is never-expire) |

### Differentiators (Competitive Advantage)

Features that go beyond the baseline and make the system more maintainable or resilient.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| EFS restore-from-S3 on cold start | If EFS is empty (new deployment, accidental deletion), Lambda automatically restores from S3 backup instead of failing | MEDIUM | Check for DuckDB file at startup; if absent, copy from S3 before running pipeline; avoids operator intervention |
| Async Lambda URL with 202 response | Manual invocation returns immediately with 202 Accepted; pipeline runs in background; prevents HTTP timeout on slow runs | LOW | Set `InvocationType: Event` when calling via Lambda URL or use Lambda URL with async mode; useful for operator UX |
| Separate iNat and Ecdysis schedule cadences | iNat data updates daily (observations added/edited by volunteers continuously); Ecdysis updates weekly at most (curator-reviewed specimen data); separate schedules reduce unnecessary S3 uploads and pipeline runtime | LOW | Two EventBridge rules: iNat+export nightly; full pipeline weekly; requires run.py to support step selection |
| Seed DuckDB for pytest (`fixtures/beeatlas-test.duckdb`) | Without a committed seed DB, pipeline tests are integration tests requiring live API access; a seed enables unit-level export.py tests | MEDIUM | Commit a small representative DuckDB snapshot with real schema; pytest fixtures load it; tests verify export SQL produces correct Parquet schema; enables CI test gate |
| Cache-Control on S3 data files | Fresh pipeline output should not be served stale from CloudFront edge; `Cache-Control: max-age=3600` or shorter on Parquets; `Cache-Control: max-age=86400` on GeoJSON (rarely changes) | LOW | Set via S3 object metadata on upload; CDK can configure cache behavior per path pattern on the distribution |
| CloudFront invalidation after pipeline upload | Ensures edge caches immediately serve the freshest Parquets; without invalidation, stale TTL may persist up to the cache duration | LOW | `aws cloudfront create-invalidation --paths '/data/*'` after successful upload; Lambda needs `cloudfront:CreateInvalidation` permission |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Lambda concurrency > 1 | "What if two schedules overlap?" — natural concern | DuckDB on EFS cannot safely handle concurrent writers; two Lambda invocations writing to the same `.duckdb` file will corrupt it | Reserve concurrency = 1 in CDK; EventBridge schedule gap is large enough that overlap is impossible in practice; the Lambda URL call can check if a run is in progress via a lock file on EFS |
| SnapStart for cold start reduction | SnapStart reduces Python cold start times significantly | SnapStart is explicitly incompatible with EFS mounts (AWS constraint as of 2025) | Accept the EFS cold start overhead (~1-3s extra); VPC cold start is now minimal; provisioned concurrency is the alternative but costs money for a nightly pipeline |
| Real-time data refresh triggered by iNat webhooks | "Update the map the moment a new observation is submitted" | iNat does not offer webhooks; polling is the only option; real-time at the frontend would require a WebSocket server, violating the static hosting constraint | Nightly incremental fetch is appropriate for bee atlas data cadence; volunteers submit observations over days, not seconds |
| Store pipeline state in DynamoDB or RDS instead of DuckDB on EFS | "EFS feels wrong for a database" — concern about durability | DuckDB on EFS with S3 backup is the right architecture for this workload: analytical query engine, single-writer, low concurrency, cheap; DynamoDB or RDS adds cost and complexity with no benefit | DuckDB on EFS + S3 backup is the correct choice for this scale and access pattern |
| VPC NAT Gateway for Lambda internet access | Lambda in VPC cannot reach external APIs (iNat, Ecdysis) without routing | NAT Gateway costs ~$32-68/month idle; significant ongoing cost for a low-budget project | Use VPC with public subnets for Lambda + security group egress rules; or use IPv6 Egress-Only Internet Gateway (~$0/month idle); or deploy Lambda outside VPC for the fetch steps and inside VPC only for EFS access (split function approach) |
| Step Functions to orchestrate pipeline steps | "Pipeline is multiple steps — Step Functions is the right tool" | The pipeline is a sequential Python script with no parallelism; Step Functions adds cost and complexity for no benefit at this scale | `run.py` sequential orchestration is sufficient; if a step fails, CloudWatch Logs shows which step; retry is re-invoking the Lambda |
| Container image deployment for Lambda | Geopandas + dlt + duckdb may exceed 250 MB zip limit | Container images up to 10 GB work but add ECR cost, image build time in CI, and cold start overhead | Use container image if zip + layers exceeds 250 MB unzipped; otherwise zip with a Lambda layer for large native deps (GDAL/GEOS for geopandas); verify size first before committing to containers |

---

## Feature Dependencies

```
[EFS FileSystem + AccessPoint + VPC]
    └──required by──> [Lambda EFS mount]
                          └──required by──> [DuckDB persistent state between invocations]
                                                └──required by──> [Incremental iNat pipeline]
                                                └──required by──> [Ecdysis links pipeline (skip already-fetched)]

[Lambda IAM role with S3 write]
    └──required by──> [DuckDB backup upload to S3]
    └──required by──> [Data file upload to S3]
    └──required by──> [CloudFront invalidation]

[Data files uploaded to S3 + CloudFront]
    └──required by──> [Frontend runtime fetch]

[Seed DuckDB (fixtures/beeatlas-test.duckdb)]
    └──required by──> [pytest coverage of export.py]

[Lambda URL]
    └──enhances──> [Manual pipeline invocation]

[EventBridge schedule]
    └──triggers──> [Lambda handler (run.py)]

[S3 restore logic on cold start]
    └──requires──> [S3 backup of DuckDB]
    └──enhances──> [EFS mount reliability]

[Lambda concurrency = 1]
    └──prevents conflict with──> [DuckDB single-writer requirement]

[Cache-Control on S3 objects]
    └──required by──> [CloudFront invalidation effectiveness]
    └──improves──> [Frontend data freshness UX]
```

### Dependency Notes

- **VPC is required for EFS but complicates internet access:** Lambda in a VPC cannot reach
  external APIs (iNaturalist, Ecdysis) unless the VPC provides a path to the internet. A NAT
  Gateway works but costs ~$32/month idle. Alternatives: deploy Lambda in public subnets with
  auto-assigned public IP (not standard but possible), use IPv6 + Egress-Only IGW (cost: ~$0),
  or split the pipeline into a VPC-attached DuckDB-writing step and a non-VPC API-fetching step.
  The simplest approach for this project: Lambda in private subnet + NAT Gateway, accepted cost.

- **DuckDB spatial extension requires native binaries:** `INSTALL spatial; LOAD spatial;` at
  runtime downloads from DuckDB's extension server. In Lambda, outbound internet access must be
  confirmed. Pre-installing the extension into the DuckDB file or bundling it with the deployment
  package avoids the runtime download. Test this in the Lambda environment early.

- **Container image vs zip package:** `geopandas` (GEOS, GDAL, Shapely, pyproj) plus `dlt` plus
  `duckdb` plus `requests` + `beautifulsoup4` is likely to exceed 250 MB unzipped for a zip
  deployment. A container image (up to 10 GB) is the reliable path. ECR costs are minimal for a
  single image. Build time adds ~2-3 minutes to CDK deploy. Plan for container from the start.

- **Lambda timeout is a hard constraint:** The full pipeline (all six steps including Ecdysis HTML
  scraping with 45,000+ records at ≤20 req/sec) would take hours on first run. The 15-minute
  Lambda timeout makes a full Ecdysis scrape in Lambda impossible without the EFS-based skip
  logic. The links pipeline must load the EFS DuckDB (which contains already-scraped records) and
  skip those — exactly the existing two-level skip behavior. First-run Ecdysis link scraping must
  be done locally to seed EFS before the Lambda schedule can handle incremental runs.

---

## MVP Definition

### Launch With (v1.7)

Minimum viable production pipeline — fully automated nightly runs with no CI pipeline code.

- [ ] INFRA: Lambda function in VPC with EFS mount; IAM role with S3 and CloudFront permissions
- [ ] INFRA: EventBridge Scheduler triggers full pipeline nightly (iNat incremental + full export)
- [ ] INFRA: Lambda URL for manual invocation (async, returns 202 immediately)
- [ ] PIPELINE: Lambda handler wraps `data/run.py`; reads/writes DuckDB on EFS at `/mnt/efs/beeatlas.duckdb`
- [ ] PIPELINE: `export.py` writes data files to S3 (not local filesystem); CloudFront invalidation after upload
- [ ] PIPELINE: S3 backup of `beeatlas.duckdb` after successful pipeline run
- [ ] PIPELINE: Restore `beeatlas.duckdb` from S3 if absent from EFS on startup
- [ ] FRONTEND: Remove bundled Parquets and GeoJSON from `frontend/src/assets/`; fetch from CloudFront URL at runtime
- [ ] FRONTEND: Loading state while data files are being fetched; graceful error if fetch fails
- [ ] CI: Remove all pipeline code from GitHub Actions workflow; frontend build only
- [ ] TEST: `data/fixtures/beeatlas-test.duckdb` committed; pytest covers `export.py` with seed DB

### Add After Validation (v1.x)

- [ ] Separate EventBridge schedules for iNat-only (nightly) vs full pipeline including Ecdysis scrape (weekly) — reduces runtime and API calls; add once nightly run is stable
- [ ] Cache-Control headers on S3 data files tuned per file type (Parquets: shorter TTL; GeoJSON: longer TTL)
- [ ] CloudWatch alarm on Lambda error rate or timeout — notifies operator of pipeline failure

### Future Consideration (v2+)

- [ ] Lambda concurrency controls beyond reserved=1 if multi-step pipeline parallelism is needed
- [ ] Multi-region replication of S3 data files for lower-latency global access (not needed for WA-focused atlas)
- [ ] Step Functions if pipeline grows to > 6 steps or requires branching/parallel execution

---

## Schedule Frequency Recommendations

### iNaturalist (nightly incremental)

iNat pipeline uses `updated_since` cursor (dlt incremental state in DuckDB). Observations for
Washington Bee Atlas project 166376 are added and updated by volunteers continuously throughout
the active collection season (April–October). Daily incremental fetches keep the map current.

**Recommended schedule:** Nightly at 04:00 UTC (8 PM Pacific / 9 PM Mountain). Off-peak for iNat
servers; after most same-day field session records are submitted by volunteers.

**API rate limits:** iNat recommends ≤60 req/min, hard limit 100 req/min, ≤10,000 req/day.
An incremental daily fetch for a single project with ~2,000 total observations is at most a few
hundred API calls. Well within limits.

### Ecdysis (weekly, not nightly)

Ecdysis DarwinCore exports are curator-reviewed specimen data. New specimens are added after
physical processing, which takes weeks. A weekly Ecdysis download is adequate. Running Ecdysis
weekly also avoids hammering the Ecdysis server with a nightly download of a ~45,000-record zip.

**Recommended schedule:** Weekly, Sunday 05:00 UTC. Full Ecdysis download + links scrape (skip
already-linked records via EFS DuckDB state) + spatial join + export.

**Ecdysis links scrape:** At 45,000+ records and ≤20 req/sec, scraping all records takes ~37
minutes — exceeding the 15-minute Lambda timeout if run from scratch. The EFS-based skip logic
(already-linked records skipped) means only new records need scraping. Realistically, the weekly
incremental scrape adds a few hundred new records at most → a few minutes of scrape time.

### Practical schedule structure

Two EventBridge rules targeting the same Lambda:
1. `cron(0 4 * * ? *)` — nightly: iNat pipeline + export (skip Ecdysis scrape)
2. `cron(0 5 ? * SUN *)` — weekly Sunday: full pipeline including Ecdysis download + links

The Lambda handler receives the EventBridge event payload and uses a `mode` field to decide
which steps to run. Or: `run.py` supports `--steps` argument; Lambda handler passes steps based
on event source. Either approach is simpler than two separate Lambda functions.

---

## Cold Start Considerations

### VPC + EFS cold start

Lambda cold starts in a VPC were historically slow (10+ seconds for ENI creation). AWS resolved
this in 2019 by pre-creating ENIs. As of 2025, VPC cold starts add ~1-3 seconds, not 10-30s.
EFS mount adds another 1-2 seconds. Total cold start overhead for a nightly scheduled Lambda:
~3-5 seconds. Acceptable for a background pipeline; irrelevant for the frontend UX.

### Python dependency load time

`dlt`, `duckdb`, `geopandas` (which loads GDAL/GEOS/Shapely) are heavyweight imports. Cold start
Python import time for a full data science stack is typically 5-15 seconds in Lambda. Combined
with VPC+EFS overhead, total cold start before `main()` executes: ~10-20 seconds. This is fine
for a 15-minute pipeline; it becomes a non-factor after the first invocation (warm execution).

### DuckDB spatial extension

`INSTALL spatial; LOAD spatial;` on cold start attempts to download from DuckDB's extension
registry. If the extension is not pre-bundled, this adds a few seconds and requires outbound
internet access from the VPC. **Mitigate:** pre-install the spatial extension into `beeatlas.duckdb`
at seed time, or bundle extension files with the deployment package. Verify behavior in the Lambda
environment before assuming the runtime download works.

### SnapStart is not an option

SnapStart (Python Lambda snapshot-based cold start reduction) is incompatible with EFS mounts.
This is an AWS hard constraint as of 2025. Provisioned concurrency eliminates cold starts but
costs money 24/7 for a nightly function — not justified here. Accept cold start overhead.

---

## Frontend Runtime Fetch Behavior

### Expected behavior

On page load, the frontend initiates `fetch()` calls for each data file in parallel:
- `ecdysis.parquet` (current size: ~500 KB–1 MB compressed)
- `samples.parquet` (current size: ~50-100 KB)
- `counties.geojson` (current size: 56 KB)
- `ecoregions.geojson` (current size: 357 KB)

CloudFront serves from edge cache after the first request after each pipeline run. Subsequent
page loads hit the edge cache with low latency. First load after a pipeline run triggers cache
refresh — user may experience a 1-2 second delay vs. bundled-asset load.

### Loading state requirement (table stakes)

The map must not render with empty data while files are loading. Users expect a loading indicator
or spinner during the fetch. The existing `hyparquet` reading path accepts `ArrayBuffer` from
`fetch()` — the wire format is compatible, only the loading orchestration changes.

### Error handling requirement (table stakes)

If a data file fetch fails (network error, S3 outage, CloudFront misconfiguration), the frontend
must show a user-visible error rather than silently rendering an empty map. An empty map with no
specimens looks like a bug, not a loading state.

### Cache-Control strategy

Parquet files change after every pipeline run. Set `Cache-Control: max-age=3600, must-revalidate`
on Parquets so CloudFront revalidates hourly and after invalidation. GeoJSON files change rarely
(only when county/ecoregion data is regenerated). Set `Cache-Control: max-age=86400` on GeoJSON.

CloudFront invalidation (`/data/*`) triggered by the Lambda after upload ensures the edge serves
fresh files within seconds of the pipeline completing, even if the TTL has not expired.

### Same-origin vs CORS

The frontend is served from `beeatlas.net` (CloudFront). If data files are in the same S3 bucket
and served via the same CloudFront distribution under a `/data/` path prefix, there is no
cross-origin request — CORS configuration is not needed. This is the recommended approach:
add a second cache behavior to the existing distribution for `/data/*` rather than creating a
separate distribution.

---

## Sources

- AWS Lambda timeout (900s hard limit): [AWS Lambda timeout configuration](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html) — HIGH confidence
- Lambda invocation methods (sync vs async, Event type): [AWS Lambda invocation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-invocation.html) — HIGH confidence
- EFS with Lambda (VPC requirement, access points): [Lambda + EFS documentation](https://www.cloudtechsimplified.com/elastic-file-system-efs-aws-lambda/) — MEDIUM confidence
- EFS cold start overhead (1-3s as of 2025): [EFS on Lambda medium article](https://medium.com/@leocherian/aws-lambda-with-efs-leveraging-persistent-storage-for-serverless-architectures-6b5f361ce232) — MEDIUM confidence
- SnapStart incompatible with EFS: [Lambda cold start SnapStart constraints](https://dev.to/aws-builders/from-seconds-to-milliseconds-fixing-python-cold-starts-with-snapstart-59mn) — MEDIUM confidence
- DuckDB on Lambda discussion (stale file handles, memory limits): [DuckDB/duckdb GitHub Discussion #8687](https://github.com/duckdb/duckdb/discussions/8687) — MEDIUM confidence
- DuckDB on Lambda practical guide: [tobilg.com DuckDB Lambda](https://tobilg.com/posts/using-duckdb-in-aws-lambda/) — MEDIUM confidence
- Lambda container images (up to 10 GB): [AWS Lambda container images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html) — HIGH confidence
- NAT Gateway cost (~$32-68/month): [NAT Gateway pricing 2025](https://costgoat.com/pricing/aws-nat-gateway) — MEDIUM confidence
- IPv6 Egress-Only IGW as NAT alternative: [carriagereturn.nl Lambda IPv6 VPC](https://carriagereturn.nl/aws/lambda/ipv6/vpc/nat/2025/11/16/lambda-ipv6-vpc.html) — MEDIUM confidence
- EventBridge Scheduler for Lambda: [EventBridge Scheduler CDK pattern](https://www.ranthebuilder.cloud/post/build-serverless-scheduled-tasks-with-amazon-eventbridge-and-cdk) — MEDIUM confidence
- iNaturalist API rate limits (≤60 req/min, ≤10,000 req/day): [iNaturalist API recommended practices](https://www.inaturalist.org/pages/api+recommended+practices) — HIGH confidence
- GeoLambda (geospatial Lambda containers): [developmentseed/geolambda](https://github.com/developmentseed/geolambda) — MEDIUM confidence
- Existing codebase (`run.py`, `export.py`, `inaturalist_pipeline.py`, `pyproject.toml`, `beeatlas-stack.ts`, `PROJECT.md`) — HIGH confidence (direct inspection)

---
*Feature research for: Washington Bee Atlas v1.7 Lambda + EFS Production Pipeline Infrastructure*
*Researched: 2026-03-27*
