# Phase 26: Lambda Handler + Dockerfile - Research

**Researched:** 2026-03-28
**Domain:** AWS Lambda Python container image, dlt pipeline orchestration, boto3 S3/CloudFront
**Confidence:** HIGH

## Summary

Phase 26 replaces the stub Lambda handler with a real pipeline orchestrator and expands the Dockerfile to include all geospatial and dlt dependencies. The core challenge is that every pipeline module hardcodes `DB_PATH = str(Path(__file__).parent / "beeatlas.duckdb")` at module level — in Lambda, `__file__` resolves to `/var/task/`, a read-only filesystem. The handler must redirect this to `/tmp/beeatlas.duckdb` via an env var pattern across all four pipeline files and `export.py` before those modules are imported.

The Dockerfile requires no system GDAL installation: geopandas 1.x uses pyogrio as its default engine, and pyogrio ships as a manylinux binary wheel that bundles libgdal internally. A plain `uv pip install` on the Lambda Python 3.14 base image (Amazon Linux 2023) handles all geospatial dependencies without any `microdnf install gdal` step.

The CDK stack in `infra/lib/beeatlas-stack.ts` requires two changes alongside the handler: add `DISTRIBUTION_ID` to the Lambda env vars, and grant `cloudfront:CreateInvalidation` to the pipeline function role (currently only granted to `deployerRole`).

**Primary recommendation:** Implement the handler in-place as `stub_handler.py` (keeping the Dockerfile CMD stable). Use env vars `DB_PATH` and `EXPORT_DIR` read at module import time in each pipeline file. Build the Docker image using the official uv multi-stage pattern with the Lambda Python 3.14 base image.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Nightly run (`event.pipeline == 'inat'`): run ecdysis → ecdysis-links → inaturalist → projects → export. Skip geographies.
- **D-02:** Weekly run (`event.pipeline == 'full'`): run all six steps: geographies → ecdysis → ecdysis-links → inaturalist → projects → export.
- **D-03:** Handler dispatches on `event.get('pipeline', 'full')` — default to full run if no pipeline field present.
- **D-04:** Replace hardcoded `ASSETS_DIR` in `export.py` with `os.environ.get('EXPORT_DIR', default_local_path)`. Lambda sets `EXPORT_DIR=/tmp/export`.
- **D-05:** Handler creates `/tmp/export/` before calling export, then uploads the four files from there to S3 `/data/` prefix.
- **D-06:** Add `DISTRIBUTION_ID` env var to the Lambda function in `infra/lib/beeatlas-stack.ts`. The handler reads this to create the invalidation.

### Claude's Discretion
- Whether to replace `stub_handler.py` in-place or create a new `handler.py` and update `CMD`. Prefer replacing in-place to avoid a CDK redeploy just to change CMD.
- Install all pipeline dependencies from `pyproject.toml` via `uv` during Docker build. Image must include GDAL/spatial stack (pyproj, duckdb spatial extension), dlt, and boto3. Pin to Python version in `pyproject.toml`.

### Deferred Ideas (OUT OF SCOPE)
- Lambda monitoring / CloudWatch alarms on failure
- Partial export on pipeline failure
- Separate Lambda functions for nightly vs. weekly
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-11 | Lambda handler downloads `beeatlas.duckdb` from `s3://BUCKET/db/beeatlas.duckdb` to `/tmp/`; invokes `data/run.py`; dlt pipelines write to `/tmp/beeatlas.duckdb`; reserved concurrency prevents concurrent runs | S3 download pattern exists in `stub_handler.py`; pipeline DB path must be redirected via env var; reserved concurrency already set in CDK |
| PIPE-12 | Handler runs `export.py` after successful pipeline run; uploads four files to S3 `/data/` prefix | `export.py` needs `EXPORT_DIR` and `DB_PATH` env var support (D-04); boto3 `upload_file` for each output |
| PIPE-13 | Handler uploads updated `beeatlas.duckdb` from `/tmp/` back to `s3://BUCKET/db/beeatlas.duckdb` | Straightforward boto3 S3 upload after pipeline run |
| PIPE-14 | Handler triggers CloudFront invalidation on `/data/*` after S3 upload | `cloudfront:CreateInvalidation` IAM permission missing from Lambda role — CDK change required; boto3 pattern documented |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| boto3 | (not in current pyproject.toml) | S3 download/upload, CloudFront invalidation | AWS SDK for Python; pre-installed on Lambda base image |
| dlt[duckdb] | 1.24.0 (locked in uv.lock) | Pipeline orchestration, DuckDB writes | Already in use |
| duckdb | 1.4.4 | Local database for pipelines | Already in use |
| geopandas | 1.1.2 | Shapefile reading in geographies pipeline | Already in use |
| pyogrio | 0.12.1 | Binary wheel with bundled GDAL — no system install needed | Bundles libgdal 3.11 via manylinux wheel |
| uv | 0.10.12 | Dependency installation in Dockerfile | Astral official tool; recommended Lambda pattern |

**boto3 note:** boto3 comes pre-installed on the Lambda base image (`public.ecr.aws/lambda/python:3.14`) but is NOT in `pyproject.toml`. It must be added to `pyproject.toml` dependencies for local development and to ensure it is installed in the container image via uv. Alternatively, rely on the Lambda runtime's pre-installed boto3 (HIGH confidence — confirmed by AWS docs), but adding it explicitly to `pyproject.toml` is safer and enables local testing.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pyproj | 3.7.2 (locked) | CRS transformations for geographies pipeline | Bundled via pyogrio wheel on Linux; already used |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| uv multi-stage Docker build | pip + requirements.txt directly | uv is already used for local dev; consistent toolchain |
| Replacing stub_handler.py in place | New handler.py + update Dockerfile CMD | In-place replacement avoids CDK redeploy to change CMD |

**Installation (additions needed):**
```bash
# Add boto3 to pyproject.toml dependencies
cd data && uv add boto3
```

**Version verification:**
```bash
# In data/ directory:
uv run python -c "import boto3; print(boto3.__version__)"
uv run python -c "import dlt; print(dlt.__version__)"  # 1.24.0
uv run python -c "import duckdb; print(duckdb.__version__)"  # 1.4.4
uv run python -c "import geopandas; print(geopandas.__version__)"  # 1.1.2
```

## Architecture Patterns

### Recommended Project Structure (data/ directory)
```
data/
├── stub_handler.py     # Replace contents with real handler (keeps Dockerfile CMD)
├── run.py              # Pipeline orchestrator — STEPS list used by handler
├── export.py           # Needs EXPORT_DIR + DB_PATH env var support
├── ecdysis_pipeline.py     # Needs DB_PATH env var support
├── inaturalist_pipeline.py # Needs DB_PATH env var support
├── projects_pipeline.py    # Needs DB_PATH env var support
├── geographies_pipeline.py # Needs DB_PATH + CACHE_DIR env var/path support
├── Dockerfile          # Expand to install all pyproject.toml deps via uv
└── pyproject.toml      # Add boto3 to dependencies
```

### Pattern 1: Handler Dispatch Logic
**What:** Single handler dispatches to nightly (5 steps) or full (6 steps) based on `event.get('pipeline', 'full')`
**When to use:** D-03 decision
**Implementation note:** Lambda Function URL events arrive as HTTP events with `body`, `isBase64Encoded`, `headers`, etc. EventBridge Scheduler sends the raw JSON object directly. The handler must handle both shapes:

```python
import json, os

def handler(event, context):
    # EventBridge sends {"pipeline": "inat"} directly
    # Function URL sends {"body": '{"pipeline": "inat"}', "isBase64Encoded": False, ...}
    if 'body' in event:
        body = event.get('body') or '{}'
        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            payload = {}
    else:
        payload = event

    pipeline_mode = payload.get('pipeline', 'full')
    # ...
```

### Pattern 2: DB_PATH Env Var Across Pipeline Modules
**What:** Each pipeline module reads DB_PATH from `os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))`
**When to use:** Required for Lambda — `/var/task/` is read-only, pipelines must write to `/tmp/`
**Scope:** `ecdysis_pipeline.py`, `inaturalist_pipeline.py`, `projects_pipeline.py`, `geographies_pipeline.py`, `export.py` — all five files

```python
import os
from pathlib import Path

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
```

This preserves local dev behavior (no env var set → uses `data/beeatlas.duckdb`) while allowing Lambda to override with `DB_PATH=/tmp/beeatlas.duckdb`.

### Pattern 3: GEOGRAPHIES CACHE_DIR for Lambda
**What:** `geographies_pipeline.py` uses `CACHE_DIR = Path(".geography_cache")` — a relative path that resolves relative to the working directory. In Lambda, cwd is `/var/task/` (read-only).
**Resolution:** `geographies_pipeline.py` should set `CACHE_DIR = Path(os.environ.get('GEOGRAPHY_CACHE_DIR', '.geography_cache'))`. The Lambda handler sets `os.environ['GEOGRAPHY_CACHE_DIR'] = '/tmp/geography_cache'` before calling `load_geographies`.

**Alternative:** The Lambda handler can set env var `GEOGRAPHY_CACHE_DIR=/tmp/geography_cache` as a Lambda function environment variable in CDK, or set it in the handler before importing the module (but modules import at cold start, so it must be an env var set in CDK).

### Pattern 4: Dockerfile (uv multi-stage)
**What:** Multi-stage Dockerfile copies uv binary, installs all deps from uv.lock into LAMBDA_TASK_ROOT, copies source files
**When to use:** Full production build

```dockerfile
FROM ghcr.io/astral-sh/uv:0.10.12 AS uv
FROM public.ecr.aws/lambda/python:3.14 AS builder

ENV UV_COMPILE_BYTECODE=1
ENV UV_NO_INSTALLER_METADATA=1
ENV UV_LINK_MODE=copy

RUN --mount=from=uv,source=/uv,target=/bin/uv \
    --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv export --frozen --no-emit-workspace --no-dev --no-editable -o requirements.txt && \
    uv pip install -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

FROM public.ecr.aws/lambda/python:3.14
COPY --from=builder ${LAMBDA_TASK_ROOT} ${LAMBDA_TASK_ROOT}
COPY *.py ${LAMBDA_TASK_ROOT}/

CMD [ "stub_handler.handler" ]
```

**Source:** [Using uv with AWS Lambda](https://docs.astral.sh/uv/guides/integration/aws-lambda/) (official Astral docs)

### Pattern 5: CloudFront Invalidation via boto3
**What:** After S3 upload completes, create an invalidation on `/data/*`
**CallerReference:** Use `str(uuid.uuid4())` or epoch timestamp to ensure idempotency

```python
import boto3, uuid

def invalidate_cloudfront(distribution_id: str) -> None:
    cf = boto3.client('cloudfront')
    cf.create_invalidation(
        DistributionId=distribution_id,
        InvalidationBatch={
            'Paths': {'Quantity': 1, 'Items': ['/data/*']},
            'CallerReference': str(uuid.uuid4()),
        }
    )
    print(f"CloudFront invalidation created for /data/* on {distribution_id}")
```

**Source:** [boto3 create_invalidation docs](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/cloudfront/client/create_invalidation.html)

### Pattern 6: CDK Changes Required
**What:** Two additions to `infra/lib/beeatlas-stack.ts`
1. Add `DISTRIBUTION_ID: distribution.distributionId` to `pipelineFn` environment
2. Grant `cloudfront:CreateInvalidation` to `pipelineFn` role

```typescript
// In pipelineFn environment block:
environment: {
  DLT_DATA_DIR: '/tmp/dlt',
  temp_directory: '/tmp/duckdb_swap',
  BUCKET_NAME: siteBucket.bucketName,
  DISTRIBUTION_ID: distribution.distributionId,  // ADD THIS
  DB_PATH: '/tmp/beeatlas.duckdb',               // ADD THIS
  EXPORT_DIR: '/tmp/export',                      // ADD THIS
  GEOGRAPHY_CACHE_DIR: '/tmp/geography_cache',    // ADD THIS
},

// After pipelineFn definition:
pipelineFn.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['cloudfront:CreateInvalidation'],
  resources: [
    `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
  ],
}));
```

### Anti-Patterns to Avoid
- **Importing pipeline modules at handler module level:** If modules are imported at the top of `stub_handler.py`, they execute `DB_PATH = str(Path(__file__).parent / ...)` before the handler has a chance to set env vars. However, since env vars are set in CDK (not at runtime), this is actually fine — env vars are available at Lambda startup, before any imports.
- **Using `/var/task/` for any writes:** All files that change at runtime (DuckDB, dlt state, export output, geography cache) must land under `/tmp/`.
- **Not setting `GEOGRAPHY_CACHE_DIR`:** `geographies_pipeline.py` currently uses a relative path `Path(".geography_cache")`. In Lambda, cwd is `/var/task/` (read-only). This will fail on full runs unless CACHE_DIR is redirected.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Geospatial file reads | Custom shapefile parser | geopandas + pyogrio binary wheel | Bundled GDAL; manylinux wheels work on AL2023 without system GDAL |
| S3 file transfer | Custom HTTP download | `boto3.client('s3').download_file` / `upload_file` | Thread-safe, automatic retry, multi-part |
| CloudFront invalidation | Manual API call | `boto3.client('cloudfront').create_invalidation` | Official SDK; handles signing |
| Dependency installation | Manual pip with system GDAL | `uv pip install` with pyogrio wheel | pyogrio bundles GDAL; no microdnf required |

**Key insight:** GDAL is NOT available as a microdnf package on Amazon Linux 2023 (GitHub issue open since 2022, unresolved as of Feb 2026). pyogrio's binary wheel bundles libgdal — `pip install geopandas` is sufficient with no system-level GDAL.

## Common Pitfalls

### Pitfall 1: Hardcoded DB_PATH on Read-Only Filesystem
**What goes wrong:** All five pipeline modules set `DB_PATH = str(Path(__file__).parent / "beeatlas.duckdb")`. In Lambda, `__file__` is `/var/task/pipeline.py`, so DB_PATH = `/var/task/beeatlas.duckdb`. Lambda's `/var/task/` is read-only. DuckDB will fail to open a writable connection.
**Why it happens:** Code was written for local dev where `__file__` is in the repo's `data/` directory.
**How to avoid:** Change all five modules to `DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))`. Set `DB_PATH=/tmp/beeatlas.duckdb` in CDK env vars.
**Warning signs:** `OSError: [Errno 30] Read-only file system: '/var/task/beeatlas.duckdb'` in CloudWatch logs.

### Pitfall 2: GEOGRAPHY_CACHE_DIR Relative Path
**What goes wrong:** `geographies_pipeline.py` has `CACHE_DIR = Path(".geography_cache")`. This resolves to `/var/task/.geography_cache` in Lambda — read-only.
**Why it happens:** Relative path was fine locally where cwd is the `data/` directory.
**How to avoid:** Add `os.environ.get('GEOGRAPHY_CACHE_DIR', '.geography_cache')` pattern, and set `GEOGRAPHY_CACHE_DIR=/tmp/geography_cache` in CDK.
**Warning signs:** `PermissionError` or `OSError: [Errno 30] Read-only file system` on full weekly runs.

### Pitfall 3: Lambda Function URL vs Direct Invocation Event Shape
**What goes wrong:** Lambda Function URL sends HTTP request event: `{"body": '...', "isBase64Encoded": false, "headers": {...}, ...}`. Direct Lambda invocation (EventBridge, SDK) sends the raw payload dict: `{"pipeline": "inat"}`. If the handler uses `event.get('pipeline', 'full')` directly, Function URL invocations always get `'full'` (correct default, but no ability to pass pipeline mode via URL body).
**Why it happens:** Two different invocation mechanisms use different event shapes.
**How to avoid:** Parse body from Function URL events; fall back to `event` for direct invocations. Pattern shown in Code Examples section.
**Warning signs:** Manual URL invocations with a JSON body specifying pipeline mode are ignored.

### Pitfall 4: Missing CloudFront IAM Permission on Lambda Role
**What goes wrong:** `cloudfront:CreateInvalidation` is granted to `deployerRole` in the current CDK stack, but NOT to `pipelineFn`. Lambda will get `AccessDenied` from CloudFront.
**Why it happens:** The original stack was written before PIPE-14 was defined.
**How to avoid:** Add the IAM policy statement to `pipelineFn` in CDK (see Architecture Patterns section).
**Warning signs:** `botocore.exceptions.ClientError: An error occurred (AccessDenied) when calling the CreateInvalidation operation`.

### Pitfall 5: boto3 Not in pyproject.toml
**What goes wrong:** boto3 is available on the Lambda base image but is not in `pyproject.toml`. Uv will not install it into the container image unless it's declared. Local dev and testing will lack boto3.
**Why it happens:** stub_handler.py uses boto3 which came pre-installed on Lambda.
**How to avoid:** Run `uv add boto3` to add it to `pyproject.toml` and `uv.lock`. This also enables local unit testing of the handler.
**Warning signs:** `ModuleNotFoundError: No module named 'boto3'` in local tests or if the uv-installed image runs first.

### Pitfall 6: dlt Pipeline State in /tmp/dlt
**What goes wrong:** `DLT_DATA_DIR=/tmp/dlt` is already set in CDK, which is correct. dlt stores pipeline state (last run timestamps, load IDs) in this directory. Between Lambda invocations, `/tmp/` may persist within the same execution environment, or be wiped on cold start. If state is wiped, dlt incremental pipelines will re-fetch all data.
**Why it happens:** Lambda's `/tmp/` is ephemeral but not always cleared between warm invocations.
**Impact for this phase:** Incremental pipelines (ecdysis, inat) may run a full re-fetch on each cold start. This is acceptable behavior — data is idempotent. NOT a blocking issue, but worth noting.

## Code Examples

Verified patterns from official sources:

### S3 Download with Graceful Miss (existing pattern to reuse)
```python
# Source: data/stub_handler.py (existing)
try:
    s3.download_file(BUCKET, DB_KEY, TMP_PATH)
    size = os.path.getsize(TMP_PATH)
    print(f"Downloaded {DB_KEY}: {size} bytes")
except ClientError as e:
    if e.response['Error']['Code'] in ('NoSuchKey', '404'):
        print(f"File not found (first run): {DB_KEY}")
    else:
        raise
```

### S3 Upload All Four Export Files
```python
# After export runs, upload all four files from /tmp/export/ to s3://BUCKET/data/
export_files = ['ecdysis.parquet', 'samples.parquet', 'counties.geojson', 'ecoregions.geojson']
for filename in export_files:
    local_path = f'/tmp/export/{filename}'
    s3_key = f'data/{filename}'
    s3.upload_file(local_path, BUCKET, s3_key)
    print(f"Uploaded {local_path} -> s3://{BUCKET}/{s3_key}")
```

### Full Handler Skeleton
```python
import json, os, uuid
import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ['BUCKET_NAME']
DISTRIBUTION_ID = os.environ['DISTRIBUTION_ID']
DB_KEY = 'db/beeatlas.duckdb'
TMP_DB = '/tmp/beeatlas.duckdb'
EXPORT_DIR = '/tmp/export'
EXPORT_FILES = ['ecdysis.parquet', 'samples.parquet', 'counties.geojson', 'ecoregions.geojson']

NIGHTLY_STEPS = ['ecdysis', 'ecdysis-links', 'inaturalist', 'projects', 'export']
FULL_STEPS = ['geographies', 'ecdysis', 'ecdysis-links', 'inaturalist', 'projects', 'export']


def handler(event, context):
    s3 = boto3.client('s3')

    # Parse pipeline mode from event (handles both Function URL and direct invocations)
    if 'body' in event:
        try:
            payload = json.loads(event.get('body') or '{}')
        except (json.JSONDecodeError, TypeError):
            payload = {}
    else:
        payload = event
    pipeline_mode = payload.get('pipeline', 'full')
    steps = FULL_STEPS if pipeline_mode == 'full' else NIGHTLY_STEPS
    print(f"Pipeline mode: {pipeline_mode}, steps: {steps}")

    # 1. Download DuckDB from S3
    try:
        s3.download_file(BUCKET, DB_KEY, TMP_DB)
        print(f"Downloaded {DB_KEY}: {os.path.getsize(TMP_DB):,} bytes")
    except ClientError as e:
        if e.response['Error']['Code'] in ('NoSuchKey', '404'):
            print(f"No existing DuckDB (first run): {DB_KEY}")
        else:
            raise

    # 2. Run pipelines (import here to use env vars set in CDK)
    from run import STEPS as ALL_STEPS
    steps_map = {name: fn for name, fn in ALL_STEPS}
    os.makedirs(EXPORT_DIR, exist_ok=True)
    for step_name in steps:
        print(f"--- {step_name} ---")
        steps_map[step_name]()
        print(f"--- {step_name} done ---")

    # 3. Upload exports to S3 /data/
    for filename in EXPORT_FILES:
        s3.upload_file(f'{EXPORT_DIR}/{filename}', BUCKET, f'data/{filename}')
        print(f"Uploaded data/{filename}")

    # 4. Backup DuckDB to S3 /db/
    s3.upload_file(TMP_DB, BUCKET, DB_KEY)
    print(f"Backed up DuckDB to s3://{BUCKET}/{DB_KEY}")

    # 5. Invalidate CloudFront /data/*
    cf = boto3.client('cloudfront')
    cf.create_invalidation(
        DistributionId=DISTRIBUTION_ID,
        InvalidationBatch={
            'Paths': {'Quantity': 1, 'Items': ['/data/*']},
            'CallerReference': str(uuid.uuid4()),
        },
    )
    print(f"CloudFront invalidation created for /data/*")

    return {'statusCode': 200, 'body': f'Pipeline complete: {pipeline_mode}'}
```

### env var pattern for pipeline modules
```python
# Change in ecdysis_pipeline.py, inaturalist_pipeline.py, projects_pipeline.py, geographies_pipeline.py, export.py
import os
from pathlib import Path

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
```

### export.py ASSETS_DIR change (D-04)
```python
# export.py: replace hardcoded ASSETS_DIR
import os
from pathlib import Path

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'frontend' / 'src' / 'assets')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fiona for shapefile I/O | pyogrio (default in geopandas 1.0+) | geopandas 1.0 (2024) | No system GDAL needed; binary wheel bundles GDAL |
| Lambda zip packages (250 MB limit) | DockerImageFunction (up to 10 GB) | Ongoing | Required for geopandas + dlt stack |
| Lambda Python base images on AL2 | AL2023-based images (Python 3.12+) | 2023 | microdnf instead of yum; GDAL NOT in AL2023 repos |

**Deprecated/outdated:**
- Fiona as geopandas backend: replaced by pyogrio in geopandas 1.0
- `microdnf install gdal`: GDAL not in AL2023 package repos; use pyogrio binary wheel instead

## Open Questions

1. **dlt pipeline state across cold starts**
   - What we know: `/tmp/` may or may not persist between warm Lambda invocations
   - What's unclear: Whether stale dlt state in `/tmp/dlt` from a previous warm invocation causes correctness issues (double-fetching, incorrect incremental cursors)
   - Recommendation: Accept current behavior for v1.7; dlt's idempotent write disposition handles re-fetched data correctly. Address in a future phase if run times become a concern.

2. **geographies_pipeline CACHE_DIR: env var vs handler-set os.environ**
   - What we know: CACHE_DIR is a module-level relative path; needs to point to /tmp/ in Lambda
   - What's unclear: Whether setting os.environ before the module is imported (Lambda cold start imports happen early) is reliable vs. adding `GEOGRAPHY_CACHE_DIR` as a CDK env var
   - Recommendation: Add `GEOGRAPHY_CACHE_DIR=/tmp/geography_cache` to CDK env vars (D-06 approach); same pattern as `DB_PATH` and `EXPORT_DIR`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Dockerfile build | yes | 29.3.1 | — |
| uv | Dockerfile dependency install | yes | 0.10.12 | — |
| aws CLI | S3 seed upload (manual step) | yes | 2.34.14 | — |
| Python 3.14 | pyproject.toml requires-python | yes | 3.14.3 | — |
| geopandas (via wheel) | geographies pipeline | yes (bundled GDAL) | 1.1.2 | — |
| GDAL (system) | NOT required | N/A | N/A | pyogrio binary wheel |
| boto3 | handler (S3, CloudFront) | not in pyproject.toml | — | Add via `uv add boto3` |

**Missing dependencies with no fallback:**
- `boto3` must be added to `pyproject.toml` — currently relies on Lambda base image pre-install, which is acceptable in production but blocks local testing.

**Manual prerequisite (from STATE.md):**
- v1.7 seed prerequisite: DuckDB must be seeded locally and uploaded to `s3://BUCKET/db/beeatlas.duckdb` before EventBridge schedule is enabled. The ecdysis-links pipeline takes ~38 min cold, exceeding the Lambda 15-min limit.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (not yet installed) |
| Config file | none — Wave 0 gap |
| Quick run command | `cd data && uv run pytest tests/ -x -q` |
| Full suite command | `cd data && uv run pytest tests/ -v` |

**Note:** Phase 26 does not include pytest tests (TEST-01/02/03 are Phase 27). However, the handler can be manually validated by invoking the Lambda URL and checking CloudWatch logs and S3 state, as specified in the phase success criteria.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-11 | DuckDB downloaded from S3, pipelines run, DuckDB written to /tmp/ | smoke (Lambda invoke) | `curl -s $LAMBDA_URL` then `aws s3 ls s3://BUCKET/db/` | manual |
| PIPE-12 | Four export files appear in S3 /data/ with recent timestamps | smoke | `aws s3 ls s3://BUCKET/data/` | manual |
| PIPE-13 | beeatlas.duckdb uploaded to S3 /db/ after export | smoke | `aws s3 ls s3://BUCKET/db/` | manual |
| PIPE-14 | CloudFront invalidation appears in distribution history | smoke | `aws cloudfront list-invalidations --distribution-id $CF_ID` | manual |

### Sampling Rate
- **Per task commit:** `cd data && uv run python -c "import stub_handler; print('import OK')"` (smoke import test)
- **Per wave merge:** Manual Lambda URL invocation with CloudWatch log verification
- **Phase gate:** All four success criteria (S3 ls checks + CF invalidation) green before verification

### Wave 0 Gaps
- [ ] `data/tests/` directory — no test infrastructure exists; needed for Phase 27
- [ ] pytest not in pyproject.toml — needed for Phase 27; can be added in Wave 0 of Phase 27
- Framework install for this phase: not needed (Phase 26 has no automated tests)

## Sources

### Primary (HIGH confidence)
- `data/stub_handler.py` — existing S3 pattern (reused)
- `data/run.py` — STEPS list, pipeline function names
- `data/export.py` — ASSETS_DIR and DB_PATH hardcoding (confirmed by reading source)
- `data/*.py` grep — all DB_PATH hardcoding locations confirmed
- `infra/lib/beeatlas-stack.ts` — confirmed `cloudfront:CreateInvalidation` missing from Lambda role
- [uv AWS Lambda guide](https://docs.astral.sh/uv/guides/integration/aws-lambda/) — multi-stage Dockerfile pattern
- [AWS Lambda Python images docs](https://docs.aws.amazon.com/lambda/latest/dg/python-image.html) — AL2023, microdnf, boto3 availability
- [boto3 create_invalidation](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/cloudfront/client/create_invalidation.html) — CloudFront API

### Secondary (MEDIUM confidence)
- pyogrio binary wheel bundles libgdal — confirmed by local `otool -L` inspection showing `@loader_path/.dylibs/libgdal.37.3.11.4.dylib` in the installed wheel; manylinux Linux wheels follow same pattern
- [GDAL not in AL2023](https://github.com/amazonlinux/amazon-linux-2023/issues/129) — GitHub issue open Feb 2026, unresolved

### Tertiary (LOW confidence)
- Lambda Function URL event shape requiring JSON body parse — inferred from AWS docs description; test at integration time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via local venv + uv.lock
- Architecture patterns: HIGH — all existing code read and analyzed; CDK gap confirmed in source
- Pitfalls: HIGH — all pitfalls derived from direct code inspection, not assumption
- GDAL-free install: HIGH — confirmed via binary wheel inspection locally; manylinux assumption MEDIUM

**Research date:** 2026-03-28
**Valid until:** 2026-06-28 (stable libraries; check uv/dlt for updates if > 30 days)
