# Architecture Research

**Domain:** Lambda + EFS pipeline infrastructure — Washington Bee Atlas v1.7
**Researched:** 2026-03-27
**Confidence:** HIGH — CDK constructs verified against official docs; data flow derived from direct source inspection

## System Overview

### Current Architecture (v1.6, before this milestone)

```
┌────────────────────────────────────────────────────────────────────┐
│  GitHub Actions (CI)                                                │
│  deploy.yml: npm run build:data → npm run build (frontend) → S3    │
│  fetch-data.yml (manual/scheduled): runs dlt pipelines             │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                         frontend/dist/
                      (bundled parquet + geojson)
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  S3 (siteBucket) — private, OAC                                     │
│  ├── index.html, *.js, *.css                                        │
│  ├── assets/ecdysis.parquet    ← bundled at build time              │
│  ├── assets/samples.parquet    ← bundled at build time              │
│  ├── assets/counties.geojson   ← bundled at build time              │
│  └── assets/ecoregions.geojson ← bundled at build time             │
│  ── cache/ prefix (pipeline incremental state)                      │
└───────────────────────────────┬────────────────────────────────────┘
                                │ OAC
┌───────────────────────────────▼────────────────────────────────────┐
│  CloudFront (beeatlas.net)                                           │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼────────────────────────────────────┐
│  Browser — static SPA                                               │
│  Reads Parquet via hyparquet (bundled as assets)                    │
└────────────────────────────────────────────────────────────────────┘
```

### Target Architecture (v1.7)

```
┌────────────────────────────────────────────────────────────────────────┐
│  GitHub Actions (CI) — SIMPLIFIED                                       │
│  deploy.yml: npm run build (frontend only, no data) → S3               │
│  No fetch-data.yml needed (Lambda owns pipeline execution)              │
└────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  EventBridge Schedule (weekly cron)  Lambda URL (manual invoke)        │
│         │                                       │                      │
│         └────────────────┬────────────────────── ┘                     │
│                          ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │  Lambda Function (PipelineFn) — Python 3.14 container image  │        │
│  │  VPC: private subnet, SG allows EFS port 2049 egress          │        │
│  │  EFS mount: /mnt/data  → beeatlas.duckdb lives here           │        │
│  │                                                               │        │
│  │  Handler: data/run.py main()                                  │        │
│  │    1. run dlt pipelines (writes to /mnt/data/beeatlas.duckdb) │        │
│  │    2. export.py: export parquets + geojson to /tmp/           │        │
│  │    3. upload /tmp/*.parquet, /tmp/*.geojson → S3 data/ prefix │        │
│  │    4. upload /mnt/data/beeatlas.duckdb → S3 backup/ prefix    │        │
│  └───────────────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  S3 (siteBucket)                                                    │
│  ├── index.html, *.js, *.css    (deployed by CI)                    │
│  ├── data/ecdysis.parquet       (written by Lambda)                 │
│  ├── data/samples.parquet       (written by Lambda)                 │
│  ├── data/counties.geojson      (written by Lambda)                 │
│  ├── data/ecoregions.geojson    (written by Lambda)                 │
│  ├── backup/beeatlas.duckdb     (DuckDB EFS backup by Lambda)       │
│  └── cache/ prefix              (legacy — no longer used)           │
└───────────────────────────────┬────────────────────────────────────┘
                                │ OAC
┌───────────────────────────────▼────────────────────────────────────┐
│  CloudFront (beeatlas.net)                                           │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼────────────────────────────────────┐
│  Browser — static SPA                                               │
│  fetch('https://beeatlas.net/data/ecdysis.parquet')  ← runtime     │
│  fetch('https://beeatlas.net/data/samples.parquet')  ← runtime     │
│  fetch('https://beeatlas.net/data/counties.geojson') ← runtime     │
│  fetch('https://beeatlas.net/data/ecoregions.geojson') ← runtime   │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `BeeAtlasStack` (CDK) | MODIFY | Add VPC, EFS, Lambda, EventBridge, Lambda URL; grant Lambda S3 write to `data/` and `backup/` prefixes |
| `PipelineFn` (Lambda) | NEW | Run dlt pipelines against EFS DuckDB, export to /tmp, upload to S3 |
| `EFS FileSystem` | NEW | Persistent store for `beeatlas.duckdb`; survives Lambda invocations |
| `EventBridge Schedule` | NEW | Weekly cron trigger for PipelineFn |
| `Lambda URL` | NEW | HTTP endpoint for manual pipeline invocation without API Gateway |
| `export.py` | MODIFY | Write output to /tmp (not frontend/src/assets/) when S3_UPLOAD_PREFIX is set |
| `frontend` | MODIFY | Replace bundled `?url` imports with `fetch()` from CloudFront runtime URLs |
| `deploy.yml` | MODIFY | Remove build:data step; build frontend only; frontend build no longer needs parquet files present |

## Recommended Project Structure

```
infra/lib/
├── beeatlas-stack.ts    MODIFY — add Lambda, EFS, VPC, EventBridge, Lambda URL
└── global-stack.ts      UNCHANGED

data/
├── run.py               MODIFY (or new lambda_handler.py) — adapt for Lambda entry point
├── export.py            MODIFY — parameterize output dir; write to /tmp when in Lambda
├── lambda/
│   └── Dockerfile       NEW — Python 3.14, uv, data/ dependencies, Lambda runtime
├── ecdysis_pipeline.py  UNCHANGED
├── inaturalist_pipeline.py  UNCHANGED
├── geographies_pipeline.py  UNCHANGED
├── projects_pipeline.py UNCHANGED
└── fixtures/
    └── beeatlas-test.duckdb  NEW — seed DuckDB for pytest

frontend/src/
├── assets/              EMPTY (no parquet/geojson; removed from git)
├── bee-map.ts           MODIFY — replace ?url imports with fetch() calls
├── region-layer.ts      MODIFY — replace static GeoJSON imports with fetch()
└── ...                  UNCHANGED
```

### Structure Rationale

- **`data/lambda/Dockerfile`:** Lambda requires a container image to use Python 3.14 with geopandas + duckdb spatial extension. uv is the package manager already in use. Docker allows bundling system libraries (libgdal, etc.) that geopandas needs and that cannot be installed as Lambda layers.
- **`data/fixtures/beeatlas-test.duckdb`:** Enables pytest for export.py without running full pipelines. Committed small fixture database allows deterministic test validation of export SQL queries.
- **Empty `frontend/src/assets/`:** Parquet and GeoJSON files are no longer bundled. The directory can remain for other static assets (e.g., icons). Vite asset imports become `fetch()` calls pointing at CloudFront.

## Architectural Patterns

### Pattern 1: Lambda Container Image for Python + geopandas

**What:** Build a Docker container image from `public.ecr.aws/lambda/python:3.14`. Install system dependencies (libgdal), then Python dependencies via uv. Package `data/` source files as the Lambda handler code.

**When to use:** When Lambda dependencies include compiled native extensions (geopandas, duckdb spatial). Lambda layers cannot satisfy geopandas system library requirements. Container images support up to 10GB and arbitrary OS packages.

**Trade-offs:** Container build adds ~2-5 minutes to CDK deploy. Cold starts are slower than zip-deployed functions (~5-15s for a data-heavy image). Acceptable for a weekly-scheduled pipeline — latency is not a concern.

**CDK construct (TypeScript):**
```typescript
import * as lambda from 'aws-cdk-lib/aws-lambda';

const pipelineFn = new lambda.DockerImageFunction(this, 'PipelineFn', {
  code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../data'), {
    file: 'lambda/Dockerfile',
  }),
  vpc,
  filesystem: lambda.FileSystem.fromEfsAccessPoint(accessPoint, '/mnt/data'),
  timeout: cdk.Duration.minutes(15),  // max Lambda timeout
  memorySize: 3008,                   // geopandas + spatial joins are memory-hungry
  environment: {
    DUCKDB_PATH: '/mnt/data/beeatlas.duckdb',
    S3_BUCKET: siteBucket.bucketName,
    DATA_PREFIX: 'data/',
    BACKUP_PREFIX: 'backup/',
  },
});
```

### Pattern 2: EFS Persistent DuckDB via Access Point

**What:** Create an EFS FileSystem in the VPC. Create an access point with a specific POSIX user/group that matches the Lambda execution context. Mount to `/mnt/data` in the Lambda runtime. `beeatlas.duckdb` lives at `/mnt/data/beeatlas.duckdb` and persists across invocations.

**When to use:** Lambda `/tmp` is ephemeral (10GB max, cleared between cold starts). DuckDB with the full bee atlas dataset grows over time. EFS provides durable, shared storage accessible only from within the VPC.

**CDK construct (TypeScript):**
```typescript
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';

const vpc = new ec2.Vpc(this, 'PipelineVpc', {
  maxAzs: 2,
  natGateways: 1,    // Lambda needs NAT to reach iNat API and Ecdysis
});

const fileSystem = new efs.FileSystem(this, 'PipelineEfs', {
  vpc,
  removalPolicy: cdk.RemovalPolicy.RETAIN,  // do NOT destroy on stack update
});

const accessPoint = fileSystem.addAccessPoint('LambdaAP', {
  path: '/beeatlas',
  createAcl: { ownerUid: '1000', ownerGid: '1000', permissions: '750' },
  posixUser: { uid: '1000', gid: '1000' },
});
```

**Critical:** `removalPolicy: RETAIN` on the EFS FileSystem. If the stack is updated or recreated, DESTROY would delete the DuckDB — months of pipeline history gone. Use RETAIN and manage EFS lifecycle manually.

### Pattern 3: EventBridge Scheduler for Weekly Pipeline Run

**What:** Use `aws-cdk-lib/aws-events` + `aws-cdk-lib/aws-events-targets` to create a Rule with a cron schedule targeting the Lambda function. The EventBridge Scheduler L2 construct is also now GA (as of April 2025) but the existing `aws-events` approach is simpler and sufficient.

**When to use:** Weekly pipeline execution on a fixed schedule. No dynamic scheduling, no payload variation.

**CDK construct (TypeScript):**
```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

new events.Rule(this, 'PipelineSchedule', {
  schedule: events.Schedule.cron({ weekDay: 'MON', hour: '6', minute: '0' }),
  targets: [new targets.LambdaFunction(pipelineFn)],
});
```

### Pattern 4: Lambda URL for Manual Invocation

**What:** Add a Function URL to the Lambda with `FunctionUrlAuthType.NONE` (no auth) or `AWS_IAM`. The URL allows triggering the pipeline without the EventBridge schedule — useful for immediate re-run after a data fix.

**When to use:** Operational convenience. No API Gateway needed for a single-endpoint, single-function invocation.

**Security note (October 2025 change):** New function URLs now require both `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction` permissions for IAM-authenticated calls. With `NONE` auth type, the URL is publicly accessible — acceptable for a trigger-only endpoint where the Lambda itself is idempotent and rate-limited by the pipeline's own logic. If the URL should be restricted, use `FunctionUrlAuthType.AWS_IAM` and call with signed requests.

**CDK construct (TypeScript):**
```typescript
const fnUrl = pipelineFn.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
});

new cdk.CfnOutput(this, 'PipelineFnUrl', {
  value: fnUrl.url,
  description: 'Lambda URL for manual pipeline invocation',
});
```

### Pattern 5: Runtime Fetch from CloudFront (Frontend)

**What:** Replace Vite `?url` asset imports with `fetch()` calls using hardcoded CloudFront-relative URLs. The data files are served from the same CloudFront distribution as the app, so relative paths work.

**When to use:** Data files are no longer bundled with the frontend. They are written to S3 by Lambda after each pipeline run. The frontend must fetch them at runtime.

**Trade-offs:** Adds 1-4 network requests on page load (4 files). CloudFront caching means subsequent loads are fast. The browser fetch API is already in use for hyparquet streaming. No additional library needed.

**Before (bundled):**
```typescript
import ecdysisDump from './assets/ecdysis.parquet?url';
import samplesDump from './assets/samples.parquet?url';
```

**After (runtime fetch):**
```typescript
const DATA_BASE = '/data/';  // relative to CloudFront origin
const ecdysisDump = `${DATA_BASE}ecdysis.parquet`;
const samplesDump = `${DATA_BASE}samples.parquet`;
```

GeoJSON files in `region-layer.ts` similarly change from static imports to URL strings passed to `VectorSource`.

### Pattern 6: NAT Gateway for Lambda Outbound Internet Access

**What:** Lambda in a VPC private subnet cannot reach the internet without a NAT Gateway (or VPC endpoints for each AWS service). The pipeline calls external APIs (iNaturalist REST API, Ecdysis scraper) and uses S3. NAT Gateway enables all outbound internet access from the private subnet.

**Cost implication:** NAT Gateway costs ~$32/month (1 AZ) plus ~$0.045/GB data processed. For a weekly pipeline that transfers ~100MB of data, this is ~$33/month total. This is the primary new ongoing cost of the v1.7 architecture.

**Alternative considered:** VPC Gateway Endpoint for S3 (free) eliminates S3 data transfer costs through the NAT but still requires the NAT for iNat/Ecdysis API calls. Use a Gateway Endpoint for S3 in addition to the NAT Gateway.

**CDK addition:**
```typescript
// VPC Gateway Endpoint for S3 (free — avoids routing S3 traffic through NAT)
vpc.addGatewayEndpoint('S3Endpoint', {
  service: ec2.GatewayVpcEndpointAwsService.S3,
});
```

## Data Flow

### Pipeline Execution Flow (Lambda, runtime)

```
EventBridge cron OR Lambda URL invoke
  │
  ▼
Lambda cold start: mount /mnt/data (EFS), import Python modules
  │
  ▼
data/run.py main():
  ├── geographies pipeline → /mnt/data/beeatlas.duckdb (geographies schema)
  ├── ecdysis pipeline → /mnt/data/beeatlas.duckdb (ecdysis_data schema)
  ├── ecdysis-links pipeline → /mnt/data/beeatlas.duckdb (ecdysis_data.occurrence_links)
  ├── inaturalist pipeline → /mnt/data/beeatlas.duckdb (inaturalist_data schema)
  ├── projects pipeline → /mnt/data/beeatlas.duckdb (projects schema)
  └── export pipeline:
        export.py main() [with output_dir='/tmp/data/']:
          ├── export_ecdysis_parquet() → /tmp/data/ecdysis.parquet
          ├── export_samples_parquet() → /tmp/data/samples.parquet
          ├── export_counties_geojson() → /tmp/data/counties.geojson
          └── export_ecoregions_geojson() → /tmp/data/ecoregions.geojson
        upload /tmp/data/* → S3 siteBucket/data/*
        upload /mnt/data/beeatlas.duckdb → S3 siteBucket/backup/beeatlas.duckdb
  │
  ▼
Lambda returns success response (or error)
  │
  ▼
CloudFront serves updated files on next request
(existing CloudFront cache TTL applies — may need invalidation after pipeline run)
```

### Frontend Data Load Flow (browser, runtime)

```
Browser loads https://beeatlas.net/
  │
  ├── fetch /data/ecdysis.parquet → CloudFront → S3
  │   hyparquet streams rows → OL Feature[] → specimenLayer
  │
  ├── fetch /data/samples.parquet → CloudFront → S3
  │   hyparquet streams rows → OL Feature[] → sampleLayer
  │
  ├── fetch /data/counties.geojson (deferred until boundary toggle activated)
  │   OL GeoJSON format → regionLayer (county mode)
  │
  └── fetch /data/ecoregions.geojson (deferred until boundary toggle activated)
      OL GeoJSON format → regionLayer (ecoregion mode)
```

### New vs. Modified Components — Explicit Inventory

| Component | Status | Key Changes |
|-----------|--------|-------------|
| `infra/lib/beeatlas-stack.ts` | MODIFY | Add: `ec2.Vpc`, `efs.FileSystem`, `efs.AccessPoint`, `lambda.DockerImageFunction`, `events.Rule`, `fn.addFunctionUrl()`, S3 grants for `data/*` and `backup/*` prefixes |
| `data/lambda/Dockerfile` | NEW | Python 3.14 Lambda base image, uv, geopandas system deps, data/ source |
| `data/run.py` | MODIFY | Add Lambda handler entry point (`handler(event, context)` wrapper around `main()`); handle DUCKDB_PATH env var |
| `data/export.py` | MODIFY | Parameterize output directory via env var `EXPORT_DIR` (default: `frontend/src/assets/`; Lambda: `/tmp/data/`); add S3 upload step when `S3_BUCKET` env var is set |
| `data/fixtures/beeatlas-test.duckdb` | NEW | Minimal DuckDB with enough rows to validate export SQL |
| `data/tests/test_export.py` | NEW | pytest for export functions against fixture DuckDB |
| `frontend/src/bee-map.ts` | MODIFY | Remove `?url` Parquet imports; replace with string constants pointing to `/data/ecdysis.parquet`, `/data/samples.parquet` |
| `frontend/src/region-layer.ts` | MODIFY | Remove static GeoJSON imports; replace with URL strings `/data/counties.geojson`, `/data/ecoregions.geojson` passed to `VectorSource` |
| `frontend/src/assets/` | MODIFY | Remove ecdysis.parquet, samples.parquet, counties.geojson, ecoregions.geojson from git and Vite bundling |
| `.github/workflows/deploy.yml` | MODIFY | Remove `build:data` step; remove cache-restore step; remove S3 cache env var from build job |
| `.github/workflows/fetch-data.yml` | DELETE | Lambda owns pipeline scheduling; this workflow is superseded |

## Integration Points

### CDK Construct Dependencies (deployment order)

```
GlobalStack (us-east-1) — certs, Route 53 — UNCHANGED
  ↓
BeeAtlasStack (us-west-2):
  ├── ec2.Vpc                     (prerequisite for EFS + Lambda)
  ├── efs.FileSystem              (requires VPC)
  ├── efs.AccessPoint             (requires FileSystem)
  ├── s3.Bucket (siteBucket)      (existing — no change)
  ├── cloudfront.Distribution     (existing — no change)
  ├── lambda.DockerImageFunction  (requires VPC, AccessPoint, siteBucket)
  ├── events.Rule                 (requires Lambda)
  └── fn.addFunctionUrl()         (requires Lambda)
```

All new constructs are additions to `BeeAtlasStack`. No new CDK stacks are required. The `GlobalStack` is unchanged.

### IAM Permission Changes

The Lambda execution role (auto-created by CDK) needs:

| Permission | Resource | Why |
|------------|----------|-----|
| `s3:PutObject` | `siteBucket/data/*` | Upload exported parquets + geojson |
| `s3:PutObject` | `siteBucket/backup/*` | Upload DuckDB backup |
| `s3:GetObject` | `siteBucket/backup/*` | Restore DuckDB backup on cold start (future) |
| EFS mount permissions | Auto-granted by `lambda.FileSystem.fromEfsAccessPoint()` | Mounts the access point |

The existing `deployerRole` (GitHub Actions OIDC) already has `siteBucket.grantReadWrite()`. No changes to its permissions are needed.

The deployer role may need `cloudfront:CreateInvalidation` after pipeline runs to clear cached data files — or the Lambda itself should call CloudFront invalidation after successful S3 upload.

### External Service Integration

| Service | How Lambda Reaches It | Notes |
|---------|----------------------|-------|
| iNaturalist REST API | NAT Gateway → internet | Same credentials/rate limits as current CI pipeline |
| Ecdysis website | NAT Gateway → internet | HTML scraping; rate-limited to ≤20 req/sec in pipeline code |
| S3 (siteBucket) | VPC Gateway Endpoint (free) | No NAT traversal for S3 calls |
| AWS Lambda service (for URL invocation) | Lambda URL is exposed externally | No VPC endpoint needed for incoming invocations |

## Build Order (Phases)

The CDK → Lambda → Frontend dependency chain dictates this ordering:

### Phase 1: CDK Infrastructure (VPC + EFS + Lambda stub)

Build the AWS infrastructure first. A stub Lambda (e.g., `handler` that prints "hello") validates that VPC, EFS mount, and Lambda URL all work before any real pipeline code is involved.

**Deliverables:**
- VPC with private subnets and NAT Gateway
- EFS FileSystem with access point
- `DockerImageFunction` stub with EFS mount at `/mnt/data`
- EventBridge weekly schedule rule
- Lambda URL output in CDK outputs
- CDK deploy succeeds cleanly

**Why first:** All subsequent phases depend on the Lambda existing in AWS. EFS mount issues are easier to debug with a minimal handler. NAT Gateway routing must be confirmed before the pipeline tries to call iNat/Ecdysis.

**Pitfall:** CDK deploy time increases significantly with NAT Gateway and Docker image build. Expect 15-25 minutes for first deploy.

### Phase 2: Lambda Handler + Dockerfile

Make the real pipeline code run inside Lambda. This requires:

1. Dockerfile for Lambda container (Python 3.14 base, system deps for geopandas, uv install)
2. `data/run.py` gets a `handler(event, context)` wrapper that calls `main()`
3. `data/export.py` reads `EXPORT_DIR` env var; writes to `/tmp/data/` in Lambda context; uploads to S3 after successful export
4. `DUCKDB_PATH` env var controls DuckDB file location (`/mnt/data/beeatlas.duckdb`)
5. Test by invoking Lambda URL manually; verify S3 receives `data/ecdysis.parquet`

**Why second:** Lambda handler must work before the frontend can fetch from it. The Dockerfile is a prerequisite for the Lambda deploy that was stubbed in Phase 1.

**Pitfall:** `geopandas` requires `libgdal` system library. The Lambda Python base image is minimal — the Dockerfile must `dnf install` or compile GDAL. Use the AWS-provided `public.ecr.aws/lambda/python:3.14` base and verify `geopandas` imports successfully in the container.

### Phase 3: Seed DuckDB + Tests

Before removing CI pipeline steps, establish a test fixture and pytest coverage for `export.py`.

1. Create `data/fixtures/beeatlas-test.duckdb` with minimal rows (5-10 occurrences, 5 samples, a few geographies)
2. Write `data/tests/test_export.py`: parameterize `export.py` functions with the fixture DB; assert output files have correct columns and row counts
3. Confirm tests pass locally with `uv run pytest`

**Why third:** Tests can be written before Lambda works end-to-end. Having tests before Phase 4 (frontend changes) means the export contract is pinned — frontend changes don't break the data contract silently.

### Phase 4: Frontend Runtime Fetch

Replace bundled asset imports with runtime fetch calls.

1. Remove `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, `ecoregions.geojson` from `frontend/src/assets/` and git
2. In `bee-map.ts`: replace `import ecdysisDump from './assets/ecdysis.parquet?url'` with `const ecdysisDump = '/data/ecdysis.parquet'`
3. In `region-layer.ts`: replace static GeoJSON imports with URL strings
4. Validate: `npm run build --workspace=frontend` succeeds without local parquet files present
5. Validate: browser loads the live site and fetches files from CloudFront `data/` prefix

**Why fourth:** The frontend change is safe to make only after the Lambda has successfully written files to `S3/data/`. If the frontend is changed before the data files exist in S3, the live site breaks.

### Phase 5: CI Simplification

Clean up the GitHub Actions workflows now that Lambda owns pipeline execution.

1. Remove `build:data` step from `deploy.yml` build job
2. Remove `cache-restore` step and `S3_BUCKET_NAME` env var from the build job (no longer needed for build)
3. Delete `.github/workflows/fetch-data.yml` (superseded by Lambda + EventBridge)
4. Optionally: add a post-pipeline CloudFront invalidation to the Lambda handler (invalidate `/data/*` after successful S3 upload)

**Why last:** CI simplification is cosmetic until the pipeline runs in Lambda. Changing CI before Phase 2-3 are complete would break the existing fallback where CI runs the pipeline.

## Anti-Patterns

### Anti-Pattern 1: Putting DuckDB on Lambda /tmp

**What people do:** Store `beeatlas.duckdb` in `/tmp` (the Lambda ephemeral filesystem).

**Why it's wrong:** Lambda `/tmp` is cleared on cold start. The pipeline is incremental — it relies on the existing DuckDB schema and data to avoid full re-fetches. Losing the DuckDB on every cold start means a full pipeline re-run every week, which takes hours (Ecdysis HTML scraping is the bottleneck at ≤20 req/sec for 45K+ records).

**Do this instead:** Store `beeatlas.duckdb` on EFS at `/mnt/data/beeatlas.duckdb`. EFS persists across Lambda invocations.

### Anti-Pattern 2: Using S3 as DuckDB Store (S3 direct read/write)

**What people do:** Store DuckDB on S3, read it at Lambda startup with `COPY FROM S3`, write back at the end.

**Why it's wrong:** DuckDB cannot use S3 as a native file backend — it requires a local writable path. Copying a DuckDB file from S3 at the start of every Lambda invocation (download GB-scale file) and uploading at the end doubles latency and S3 costs. EFS is already in the VPC and provides sub-millisecond access.

**Do this instead:** EFS for the primary store. S3 for a periodic backup only (after successful pipeline run). The DuckDB backup S3 upload is a safety net, not the primary access pattern.

### Anti-Pattern 3: Skipping NAT Gateway (Using VPC Endpoints for Everything)

**What people do:** Try to avoid the NAT Gateway cost (~$32/month) by using VPC Interface Endpoints for every service the pipeline calls.

**Why it's wrong:** The iNaturalist API and Ecdysis website are public internet endpoints — there is no VPC endpoint for them. A NAT Gateway (or NAT instance) is required. Only S3 can use a free Gateway Endpoint.

**Do this instead:** One NAT Gateway (single AZ is sufficient for this use case — the pipeline is not SLA-critical). Add a free S3 Gateway Endpoint to avoid routing S3 traffic through the NAT.

### Anti-Pattern 4: Bundling the Container Image in CDK Assets Without Docker Caching

**What people do:** Use `DockerImageCode.fromImageAsset()` with default settings, resulting in a full image rebuild on every `cdk deploy` even when source hasn't changed.

**Why it's wrong:** The Docker build for geopandas (GDAL compilation or system package install) takes 5-10 minutes. Unnecessary rebuilds slow down CDK deploys.

**Do this instead:** Structure the Dockerfile with dependency layers before source code layers. Docker layer caching will skip the slow dependency install when only Python source files change. CDK also caches the asset hash and skips ECR push if unchanged.

### Anti-Pattern 5: Hardcoding CloudFront Domain in Frontend

**What people do:** Set `const DATA_BASE = 'https://d1o1go591lqnqi.cloudfront.net/data/'` in the frontend.

**Why it's wrong:** The CloudFront domain changes if the distribution is recreated. Also breaks local development (can't serve local files from the production CloudFront URL).

**Do this instead:** Use a root-relative path: `const DATA_BASE = '/data/'`. This works on both beeatlas.net (via CloudFront) and local Vite dev server (where `/data/` can be proxied or the files symlinked).

### Anti-Pattern 6: Lambda URL with No Auth on a Destructive Operation

**What people do:** Expose a Lambda URL with `FunctionUrlAuthType.NONE` where invoking the URL triggers irreversible operations (e.g., deleting DuckDB, overwriting S3 data unconditionally).

**Why it's wrong:** Any public request to the URL triggers the pipeline. A malicious or accidental flood of requests would run the pipeline repeatedly, burning Lambda compute time and API rate limits.

**Do this instead:** The Lambda handler should be idempotent and check a cooldown (e.g., skip if last run was less than 1 hour ago). The pipeline's own rate limiting (≤20 req/sec for Ecdysis) naturally limits damage, but an explicit cooldown check is safer.

## Scaling Considerations

This is a low-traffic, single-tenant system. Scaling is not a concern. The key constraints are:

| Concern | Current | With Lambda + EFS |
|---------|---------|-------------------|
| Pipeline execution | CI runner (2 vCPU, 7GB RAM, 6h limit) | Lambda (up to 6 vCPU, 10GB RAM, 15min limit) |
| DuckDB persistence | Local developer machine only | EFS — durable, survives all deploys |
| Data freshness | Weekly CI manual trigger | Weekly EventBridge + on-demand Lambda URL |
| Frontend data size | Bundled at build time | Runtime fetch; CloudFront caches at edge |
| S3 storage cost | ~10MB/week (parquets + cache) | Same data volume; adds backup/ prefix (~100MB DuckDB) |

The 15-minute Lambda timeout is the binding constraint. The current pipeline (geographies + ecdysis + links + inat + projects + export) takes approximately 30-90 minutes on a local developer machine due to the Ecdysis HTML scraping. The Lambda will need EFS-persisted state to support incremental runs — the DuckDB already stores `last_fetch` timestamps via dlt's state mechanism, so this works correctly with EFS persistence.

If the pipeline consistently exceeds 15 minutes, the solution is to split into separate Lambda functions for slow steps (Ecdysis links scraping) versus fast steps (iNat delta fetch, export). This is deferred per milestone scope.

## Sources

- Direct inspection of `infra/lib/beeatlas-stack.ts` (HIGH confidence)
- Direct inspection of `data/run.py`, `data/export.py`, `data/pyproject.toml` (HIGH confidence)
- Direct inspection of `.github/workflows/deploy.yml`, `fetch-data.yml` (HIGH confidence)
- Direct inspection of `frontend/src/bee-map.ts`, `region-layer.ts` (HIGH confidence)
- AWS CDK v2 Lambda EFS official documentation: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda-readme.html (HIGH confidence)
- AWS Lambda Python 3.14 runtime: https://aws.amazon.com/about-aws/whats-new/2025/11/aws-lambda-python-314/ (HIGH confidence — GA November 2025)
- Lambda Function URL auth: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.FunctionUrl.html (HIGH confidence)
- DuckDB on Lambda: https://www.bbourgeois.dev/blog/2025/04-duckdb-aws-lambda-layers (MEDIUM confidence — confirms native extension requirements)
- EventBridge Scheduler L2 GA: https://aws.amazon.com/about-aws/whats-new/2025/04/aws-cdk-construct-library-eventbridge-scheduler/ (HIGH confidence)

---

*Architecture research for: Washington Bee Atlas v1.7 Lambda + EFS Pipeline Infrastructure*
*Researched: 2026-03-27*
