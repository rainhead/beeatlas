# Pitfalls Research

**Domain:** Adding Lambda+EFS pipeline execution to an existing Python dlt/DuckDB project serving a static frontend via S3/CloudFront (v1.7)
**Researched:** 2026-03-27
**Confidence:** HIGH for Lambda/EFS/CORS — all critical claims verified against AWS docs or primary sources. MEDIUM for dlt-specific Lambda behavior — limited official dlt-on-Lambda documentation; extrapolated from DuckDB-on-Lambda community reports.

---

## Critical Pitfalls

---

### Pitfall 1: DuckDB Temp Files on EFS Produce Stale File Handle Errors

**What goes wrong:**
DuckDB writes temporary files (spill-to-disk, WAL, lock files) to its configured `temp_directory`. When `temp_directory` is set to an EFS mount path (e.g., `/mnt/efs/duckdb`), DuckDB hits NFS-level locking issues. Errors include `IO Error: could not truncate file ... Stale file handle` and `Could not read all bytes from file`. These can occur mid-pipeline run, producing a partial or corrupt DuckDB file. The errors are non-deterministic — they may not appear on small test datasets.

**Why it happens:**
EFS uses NFSv4. DuckDB's file locking model (POSIX advisory locks + file truncation) does not reliably work over NFS. The `fcntl` lock calls succeed but the lock is advisory and not honored across NFS client failovers. Lambda can silently remount EFS under load, producing stale handles. Documented in the DuckDB GitHub discussions: users who directed DuckDB's temp directory to EFS in Lambda encountered segfaults and truncation errors that did not appear when using `/tmp`.

**How to avoid:**
Keep DuckDB's temp directory on Lambda's local ephemeral storage (`/tmp`), not on EFS. Store only the *persistent* DuckDB file (`beeatlas.duckdb`) on EFS. Configure `duckdb.connect('/mnt/efs/beeatlas.duckdb')` for the database path but explicitly `SET temp_directory='/tmp/duckdb_swap'` immediately after opening the connection. Set `/tmp` ephemeral storage to 2–4 GB in CDK (Lambda's default is 512 MB, configurable to 10 GB at extra cost; 2 GB is sufficient for the current ~50 K row dataset with spatial joins).

**Warning signs:**
- `IO Error: could not truncate file ... Stale file handle` in Lambda CloudWatch logs
- Pipeline succeeds locally but fails intermittently in Lambda
- DuckDB file on EFS grows unboundedly (temp files not cleaned up after crash)
- Segmentation fault in Lambda execution log

**Phase to address:** Lambda CDK setup phase (EFS mount + Lambda function definition)

---

### Pitfall 2: Lambda Deployment Package Exceeds 250 MB Unzipped Limit

**What goes wrong:**
The pipeline depends on `dlt[duckdb]`, `duckdb`, `geopandas`, `shapely`, `pyarrow`, `requests`, and `beautifulsoup4`. Combined, these exceed Lambda's 250 MB unzipped zip deployment limit. `duckdb` alone is ~284 MB unzipped on some platforms; `geopandas` adds native GDAL/PROJ binaries. A zip-based Lambda deployment will fail at deploy time with a size limit error, or at runtime with `ImportError` if dependencies are split across layers.

**Why it happens:**
Lambda's zip deployment limit is 250 MB unzipped (50 MB zipped upload). geospatial native libraries (GEOS, PROJ, GDAL bundled with geopandas/shapely) are large C binaries that must be compiled for Amazon Linux 2023 (the runtime for Python 3.12+). Locally-compiled binaries from macOS or Ubuntu will fail with `cannot execute binary file` or missing shared library errors.

**How to avoid:**
Use a **container image** (ECR) instead of a zip deployment. Lambda container images support up to 10 GB. Build the image on `public.ecr.aws/lambda/python:3.14` (or `python:3.13` as the current latest — see Pitfall 3). The image builds native binaries for Amazon Linux 2023 during `pip install`, so architecture mismatch is avoided. CDK's `DockerImageFunction` with `DockerImageCode.fromImageAsset('./data')` handles ECR push automatically.

**Warning signs:**
- `Error: Code storage limit exceeded` during CDK deploy
- `Runtime.ImportModuleError: No module named 'duckdb'` in Lambda — binary compiled for wrong OS
- `OSError: libgeos_c.so.1: cannot open shared object file` — geopandas native lib not found

**Phase to address:** Lambda CDK setup phase (must choose container image before any other Lambda work)

---

### Pitfall 3: Python 3.14 Is Now Supported on Lambda — But Must Verify Before Assuming

**What goes wrong:**
The `data/pyproject.toml` requires `python>=3.14`. As of November 2025, AWS Lambda added Python 3.14 support. However, if this is missed or a CDK construct defaults to an earlier runtime, the Lambda will run on Python 3.12 or 3.13. Python 3.14 introduced breaking changes in some standard library behaviors (removed deprecated APIs, changed typing). If the pipeline uses any 3.14-specific syntax, it will fail silently at runtime with `SyntaxError` or `AttributeError`.

**Why it happens:**
CDK's `lambda.Runtime.PYTHON_3_14` is only available in CDK v2.178+ (approximate — verify against CDK changelog). Developers using an older CDK version will not see `PYTHON_3_14` in the enum and may silently fall back to `PYTHON_3_13`. With container images, this is irrelevant — the base image tag determines the runtime, not the CDK `runtime` field.

**How to avoid:**
With the container image approach (Pitfall 2), use `FROM public.ecr.aws/lambda/python:3.14` in the Dockerfile. The CDK `runtime` field is not used for container image functions, so the CDK version constraint is moot. Verify the base image tag exists: `docker pull public.ecr.aws/lambda/python:3.14` before writing the Dockerfile. If 3.14 is not yet available as a Lambda base image tag, use `python:3.13` as the next closest and document the deviation.

**Warning signs:**
- `Runtime.PYTHON_3_14 is not a valid Runtime` TypeScript error in CDK
- `SyntaxError` or `AttributeError` in Lambda logs for code that works locally
- Lambda CloudWatch shows Python version mismatch in init log

**Phase to address:** Lambda CDK setup phase (Dockerfile base image selection)

---

### Pitfall 4: CloudFront Caches Parquet Responses Without CORS Headers — Browser Fetch Fails

**What goes wrong:**
hyparquet fetches Parquet files from CloudFront using HTTP Range requests (`fetch(url, { headers: { Range: 'bytes=0-7' } })`). CloudFront uses S3 as its origin (via OAC). If CloudFront caches a response from a non-CORS request (e.g., a `curl` or CDK deploy-triggered HEAD request without `Origin` header), that cached response has no `Access-Control-Allow-Origin` header. Subsequent browser requests get the cached CORS-less response and fail with `No 'Access-Control-Allow-Origin' header is present`. This is intermittent and environment-dependent — it may work in local dev (different origin) but fail in production.

**Why it happens:**
S3 only returns CORS headers when the request includes an `Origin` header. CloudFront caches the first response it receives for a URL. If the first request has no `Origin` (e.g., a cache warm-up, CDK invalidation, or `curl` test), CloudFront caches the non-CORS response. Subsequent browser requests with `Origin: https://d1o1go591lqnqi.cloudfront.net` receive the cached response without CORS headers. S3 does not add `Vary: Origin` unless the request was already CORS, so CloudFront does not know to vary the cache key.

**How to avoid:**
In the CloudFront cache policy (CDK), add `Origin` to the cache key headers. This causes CloudFront to maintain separate cache entries for CORS and non-CORS requests. Also add `Access-Control-Request-Headers` and `Access-Control-Request-Method` to the Origin Request Policy for preflight forwarding. On the S3 bucket CORS config, allow `GET`, `HEAD`, and `OPTIONS` methods, allow `Range` header, and expose `Content-Range`, `Accept-Ranges`, and `Content-Length` in `ExposeHeaders`. The project already uses OAC which handles auth, so only CORS headers need to be added.

**Warning signs:**
- `No 'Access-Control-Allow-Origin' header is present` in browser console for Parquet fetches
- Works in development (localhost origin may not be cached) but fails on deployed CloudFront URL
- `hyparquet` throws `TypeError: Failed to fetch` instead of a parse error
- Issue is intermittent — clears after CloudFront cache invalidation but recurs

**Phase to address:** Frontend runtime fetching phase (S3 CORS config + CloudFront cache policy)

---

### Pitfall 5: hyparquet Range Requests Require S3 to Accept `OPTIONS` Preflight

**What goes wrong:**
Browser `fetch()` with non-simple headers (like `Range`) triggers a CORS preflight `OPTIONS` request. S3 must respond to `OPTIONS` with a `200` or `204` and the appropriate CORS headers. If the S3 CORS config only lists `GET` and `HEAD` but not `OPTIONS`, the preflight fails with `Response to preflight request doesn't pass access control check`. This completely blocks hyparquet from reading any Parquet file.

**Why it happens:**
`Range` is not a CORS-safelisted header. Any `fetch()` that includes it causes the browser to send an `OPTIONS` preflight. S3 CORS configs often omit `OPTIONS` because direct access tools (AWS CLI, SDK) don't need it. The project currently has no S3 CORS config because Parquets are bundled — no cross-origin fetch exists in the current architecture.

**How to avoid:**
Set S3 CORS `AllowedMethods` to `["GET", "HEAD"]` — S3 handles `OPTIONS` automatically based on the CORS config, it does not need to be listed explicitly. However, `AllowedHeaders` must include `Range` (or `*`). `ExposeHeaders` must include `Content-Range`, `Accept-Ranges`, and `Content-Length`. Verify by opening browser DevTools Network tab and confirming the OPTIONS preflight returns 200 with `Access-Control-Allow-Headers: range`.

**Warning signs:**
- `OPTIONS https://…/ecdysis.parquet` returns `403` or `405` in browser Network tab
- `Failed to load resource: preflight response` in console
- Error appears before any byte of Parquet is read

**Phase to address:** Frontend runtime fetching phase (S3 CORS configuration — same phase as Pitfall 4)

---

### Pitfall 6: DuckDB Single-Writer Lock Blocks Concurrent Lambda Invocations

**What goes wrong:**
DuckDB opens the database file with an exclusive write lock. If two Lambda invocations run simultaneously (e.g., EventBridge fires while a previous invocation is still running, or a manual Lambda URL invocation overlaps a scheduled run), the second invocation fails to open the database with `IO Error: Could not set lock on "/mnt/efs/beeatlas.duckdb"`. This is DuckDB's by-design single-writer model. With EFS as the shared filesystem, the lock file is visible across all Lambda instances.

**Why it happens:**
DuckDB is not designed for concurrent write access. The lock is a `.duckdb.lock` file in the same directory as the database. Over NFS (EFS), lock acquisition uses advisory locks that can fail if a previous Lambda execution terminated uncleanly without releasing the lock — leaving a stale `.duckdb.lock` file that blocks all future writers indefinitely until manually deleted.

**How to avoid:**
Configure Lambda concurrency to 1 (reserved concurrency in CDK: `lambda.reservedConcurrentExecutions = 1`). This prevents simultaneous invocations at the AWS level. For manual invocations via Lambda URL, add a guard in the handler: check if `beeatlas.duckdb.lock` exists and is stale (mtime > 15 min = max Lambda timeout) and delete it before opening the database. Use EventBridge schedule with `schedule.rate(Duration.hours(24))` — the pipeline takes well under 15 min, so the stale lock window is narrow.

**Warning signs:**
- `IO Error: Could not set lock on "/mnt/efs/beeatlas.duckdb"` in Lambda logs
- Lambda invocation fails immediately without running any pipeline code
- `.duckdb.lock` file persists on EFS after Lambda completes (sign of unclean exit)

**Phase to address:** Lambda CDK setup phase (reserved concurrency) and Lambda handler phase (stale lock cleanup)

---

### Pitfall 7: EFS Mount Requires VPC — Lambda URL and NAT Gateway Add Cost/Complexity

**What goes wrong:**
Lambda functions with EFS mounts must run inside a VPC (EFS mount targets are VPC resources). VPC-attached Lambdas lose internet access by default. The pipeline makes outbound HTTPS calls to Ecdysis (`ecdysis.org`) and iNaturalist API. Without a NAT Gateway or VPC Endpoint for internet egress, all outbound requests time out silently.

**Why it happens:**
VPC-attached Lambda executes in the VPC's private subnets. Private subnets have no direct internet route unless a NAT Gateway (or NAT Instance) provides egress. NAT Gateways cost ~$32/month + data transfer. Without one, external API calls fail with `ConnectionError: HTTPSConnectionPool ... Max retries exceeded`.

**How to avoid:**
Add a NAT Gateway in CDK for the VPC used by the Lambda. Use private subnets for Lambda (no direct internet exposure) and route all internet traffic through the NAT. Alternatively, for a cost-conscious project, use a single-AZ NAT Gateway (~$32/month is acceptable) or explore NAT Instance (EC2 t3.nano, ~$4/month but operational overhead). Do not use a public subnet for Lambda — EFS security group rules require private subnet placement. Separately, add `DESTINATION__DUCKDB__CREDENTIALS__DATABASE=/mnt/efs/beeatlas.duckdb` as a Lambda environment variable so dlt resolves the correct DB path.

**Warning signs:**
- Ecdysis download times out inside Lambda but works locally
- iNaturalist API returns no data (connection refused, not 403)
- Lambda VPC execution logs show `Network Unreachable` or `Name resolution failure`
- EFS mount succeeds (intra-VPC) but external requests fail

**Phase to address:** VPC/networking CDK phase (must precede any pipeline code in Lambda)

---

### Pitfall 8: EFS Security Group Rules Misconfiguration — Lambda Cannot Mount

**What goes wrong:**
Lambda cannot reach the EFS mount target. The Lambda invocation hangs for the full timeout (up to 15 min) then fails with `Error: EfsMountConnectivityError`. No partial output is produced. The Lambda appears to "do nothing."

**Why it happens:**
EFS requires two security group rules: (1) the Lambda security group must allow outbound TCP port 2049 to the EFS security group, and (2) the EFS mount target security group must allow inbound TCP port 2049 from the Lambda security group. Missing either rule causes a silent connection hang — Lambda does not report an EFS-specific error until timeout. CDK's `fileSystem.connections.allowDefaultPortFrom(lambdaFunction)` helper creates the inbound EFS rule, but the Lambda egress rule must be added separately if the default security group is restrictive.

**How to avoid:**
In CDK, use `fileSystem.grantRootAccess(lambdaFunction.role)` for IAM and `fileSystem.connections.allowDefaultPortFrom(lambdaFunction)` for the security group. Explicitly verify: add a CDK test or manual check that the Lambda security group has egress 2049 → EFS SG, and the EFS SG has ingress 2049 from Lambda SG. Deploy to a test environment and check CloudWatch logs immediately — `EfsMountConnectivityError` appears in the first 30 seconds if networking is wrong.

**Warning signs:**
- Lambda invocation always times out at the configured limit (not at pipeline logic)
- No CloudWatch log entries after the START line
- `EfsMountConnectivityError` in Lambda error response
- EFS mount target shows no active connections in EFS console

**Phase to address:** VPC/networking CDK phase

---

### Pitfall 9: Lambda 15-Minute Timeout May Be Hit by the Links Pipeline (Ecdysis Scraper)

**What goes wrong:**
The `load_links` pipeline fetches Ecdysis specimen HTML pages at ≤20 req/sec. With ~45,754 specimens, a full cold run takes ~2,300 seconds (~38 minutes) — far exceeding Lambda's 15-minute hard limit. Even with the two-level skip cache (links.parquet + disk HTML), a partial cache miss (e.g., first Lambda run or after EFS is wiped) will time out mid-run, producing a partial and corrupt pipeline state in DuckDB.

**Why it happens:**
Lambda has a hard maximum execution timeout of 900 seconds (15 minutes). The links pipeline was designed for local execution where there is no timeout. The rate limit of 20 req/sec was set to be polite to Ecdysis, not to fit within Lambda constraints.

**How to avoid:**
The links pipeline should run **incrementally** — only fetch pages for occurrenceIDs not already in `occurrence_links` in DuckDB. On Lambda, if the HTML cache (raw pages) is on EFS, re-fetches of already-processed pages are avoided. Verify the incremental skip logic works against DuckDB (not links.parquet) so the skip check survives Lambda restarts. For the initial seed: run `load_links` locally to build the full DuckDB state, then upload the seeded `beeatlas.duckdb` to EFS (or restore from S3 backup). Subsequent Lambda runs only process new occurrenceIDs — a few hundred at most — well within 15 minutes. Document the bootstrap procedure in the data README.

**Warning signs:**
- Lambda invocation timeout in CloudWatch with a mid-pipeline partial DuckDB state
- `load_links` step is the last log line before timeout
- EFS DuckDB file is larger than expected (partial write without commit)

**Phase to address:** Lambda handler phase (incremental run logic) and seed DuckDB phase (bootstrap procedure)

---

### Pitfall 10: dlt Pipeline Directory Defaults to `/var/task` (Read-Only) on Lambda

**What goes wrong:**
dlt writes pipeline state, staging files, and `_dlt_pipeline_state` to a `.dlt/` directory relative to the working directory or `~/.dlt/`. On Lambda, the working directory (`/var/task`) and home directory (`/root`) are read-only — only `/tmp` is writable. dlt will raise `PermissionError` or `OSError: [Errno 30] Read-only file system` when it tries to create `.dlt/` on the first run. This can be mistaken for a DuckDB issue.

**Why it happens:**
Lambda's Lambda runtime mounts `/var/task` (the function code) read-only. dlt's default pipeline working directory is `os.getcwd()` or the directory containing `run.py`, which resolves to `/var/task/data` — read-only. Environment variables or config must override this.

**How to avoid:**
Set the `DLT_DATA_DIR` environment variable to `/tmp/dlt` in the Lambda CDK definition. Also set `DLT_PROJECT_DIR=/tmp` or configure `dlt.pipeline(..., pipelines_dir='/tmp/dlt')` in `run.py`. Verify by checking if `.dlt/` directory creation succeeds in a test invocation before any pipeline logic runs. The DuckDB file path (`/mnt/efs/beeatlas.duckdb`) is a separate configuration from dlt's working directory.

**Warning signs:**
- `OSError: [Errno 30] Read-only file system: '/var/task/.dlt'` in Lambda logs
- `PermissionError: [Errno 13] Permission denied: '/root/.dlt'`
- Pipeline fails on first line of `dlt.pipeline(...)` call

**Phase to address:** Lambda handler phase (environment variable configuration)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using Lambda /tmp for DuckDB temp (not EFS) | Avoids stale handle NFS errors | Temp files are instance-local; large spill-to-disk ops limited to /tmp size | Always correct — this is the right architecture |
| Committing seed DuckDB to git LFS | Simple bootstrap; no separate restore script | Large binary in repo history; must re-commit when schema changes | Acceptable for a small ~10 MB seeded DB; use S3 backup for production state |
| Single-AZ EFS + Lambda (one subnet) | Simpler CDK; lower cost | EFS + Lambda in different AZs adds ~1ms latency and requires cross-AZ traffic (billed) | Acceptable for a low-frequency scheduled pipeline |
| Reserved concurrency = 1 for simplicity | Prevents DuckDB lock conflicts | Manual invocations queue instead of failing fast | Acceptable; pipeline is not latency-sensitive |
| Not handling Lambda handler idempotency | Simpler code | Duplicate data if EventBridge retries after partial success | Acceptable given dlt's built-in idempotency on re-load |

---

## Integration Gotchas

Common mistakes when connecting Lambda to existing systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| S3 CORS + CloudFront | Setting S3 CORS correctly but not adding `Origin` to CloudFront cache key | Both must be configured: S3 CORS rules AND CloudFront cache policy forwarding `Origin` header |
| dlt + Lambda | Not setting `DLT_DATA_DIR` — dlt writes to read-only `/var/task` | Set `DLT_DATA_DIR=/tmp/dlt` as Lambda environment variable |
| DuckDB + EFS | Pointing DuckDB temp directory to EFS mount | Keep DB file on EFS, temp files on `/tmp` |
| EFS + VPC | Lambda in VPC without NAT Gateway — external API calls fail silently | Add NAT Gateway or NAT Instance for internet egress from private subnets |
| hyparquet + CloudFront | Fetching Parquet without `byteLength` — causes extra HEAD request per file | Pass `byteLength` to `asyncBufferFromUrl` if file size is known; saves one RTT per Parquet file |
| Lambda URL + EFS lock | Manual invocations while EventBridge scheduled run is in progress | Set reserved concurrency to 1; add stale lock detection in handler |
| CDK container image | Using `lambda.Function` (zip) instead of `lambda.DockerImageFunction` — fails at deploy for large deps | Use `lambda.DockerImageFunction` with `DockerImageCode.fromImageAsset` for all Lambda functions with heavy Python deps |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Default Lambda memory (128 MB) with DuckDB spatial joins | OOM kill mid-pipeline, no useful error | Set Lambda memory to 1024–2048 MB; DuckDB spatial join of 45K rows needs ~200–400 MB headroom | First full pipeline run |
| EFS throughput in bursting mode | Pipeline I/O stalls if burst credits exhausted (EFS baseline is 1 MB/s per GB stored) | For a small DuckDB file (<1 GB), burst credits drain in minutes under sustained write load | If DuckDB grows beyond 500 MB and runs frequently |
| No CloudFront cache invalidation after pipeline run | Frontend loads stale Parquet data (old ecdysis.parquet) after pipeline updates it | Lambda handler must call `cloudfront.create_invalidation()` for `/*` after successful S3 export | Every pipeline run that updates data |
| hyparquet fetching full Parquet without row group filtering | Loads all 45K rows on every page view even with filters applied | Accept this for the current dataset size; hyparquet reads only requested row groups if the Parquet has row group metadata | Breaks user experience at ~500K rows |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Lambda URL without auth — publicly invocable | Anyone can trigger pipeline runs (Ecdysis scraping, API calls, cost) | Set `authType: lambda.FunctionUrlAuthType.AWS_IAM` on the Lambda URL; use OIDC role for CI trigger if needed |
| EFS access point with root UID/GID | Lambda writes as root to EFS; files inaccessible if access point POSIX user changes | Set EFS access point POSIX user to a fixed UID (e.g., 1000) and configure Lambda execution role accordingly |
| S3 CORS with `AllowedOrigins: ["*"]` | Any origin can fetch the data — acceptable for public data, but note it's intentionally public | For BeeAtlas (public dataset), `*` is correct; document this decision explicitly |
| Storing API keys in Lambda environment variables (plaintext) | Visible in Lambda console; logged if `printenv` runs in handler | Use AWS Secrets Manager or SSM Parameter Store; retrieve at handler init, not at deploy time |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state while Parquet fetches from CloudFront | Map appears blank for 1–3 seconds; user thinks site is broken | Add a loading spinner or skeleton layer in `bee-map.ts`; show "Loading data..." until hyparquet resolves |
| Parquet fetch fails silently (CORS error) | Map stays blank with no error message | Catch fetch errors in `ParquetSource` and display a user-visible error banner |
| Large GeoJSON files fetched at runtime (counties 56 KB, ecoregions 357 KB) | Slower than bundled; noticeable on mobile | Keep GeoJSON small; current sizes are acceptable; no change needed |
| CloudFront returns stale Parquet after pipeline run | Data appears fresh to Lambda but old to users until CloudFront TTL expires | Use short TTL (1 hour) for data files + explicit `create_invalidation` after each pipeline run |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **EFS mount working:** Verify `beeatlas.duckdb` is readable AND writable from Lambda — open connection, run `SELECT 1`, insert a row, verify no error
- [ ] **DuckDB temp on /tmp:** Confirm `SET temp_directory` is called immediately after `duckdb.connect()` — check Lambda logs for any `Stale file handle` on first real data load
- [ ] **CORS preflight succeeds:** Open browser DevTools on the deployed site and confirm the `OPTIONS` preflight for `ecdysis.parquet` returns 200 with `Access-Control-Allow-Origin`
- [ ] **CloudFront cache key includes Origin:** After deploying, fetch Parquet via `curl -H "Origin: https://d1o1go591lqnqi.cloudfront.net"` and verify `Access-Control-Allow-Origin` is present in the response headers (not just in a direct S3 fetch)
- [ ] **dlt data dir writable:** Lambda first invocation succeeds without `PermissionError: /var/task/.dlt` — check CloudWatch on first deploy
- [ ] **NAT Gateway in place:** From inside the Lambda VPC subnet, the pipeline can reach `ecdysis.org` and `api.inaturalist.org` — test by adding a `requests.get('https://api.inaturalist.org/v2/observations?id=1').status_code` assert to a test handler
- [ ] **Reserved concurrency = 1:** Confirm in AWS Lambda console that the function has reserved concurrency set; test by invoking twice in rapid succession and verifying the second queues rather than runs concurrently
- [ ] **Pipeline completes in under 15 min:** Time the full incremental run from Lambda CloudWatch `START` to `END` — must be < 900 seconds. If close, profile which step is slow
- [ ] **CloudFront invalidation called after export:** After pipeline completes, check CloudFront invalidation history in console — an invalidation for `/*` should appear within 30 seconds of pipeline completion
- [ ] **Seed DuckDB committed:** `data/fixtures/beeatlas-test.duckdb` exists in repo; `pytest data/tests/` passes with it

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stale `.duckdb.lock` on EFS | LOW | SSH/SSM into VPC or use a Lambda cleanup function: `rm /mnt/efs/beeatlas.duckdb.lock` |
| DuckDB file corrupted by unclean Lambda exit | MEDIUM | Restore from last S3 backup (`aws s3 cp s3://bucket/backups/beeatlas.duckdb /mnt/efs/beeatlas.duckdb`); re-run pipeline |
| CORS error in production (cached non-CORS response) | LOW | Invalidate CloudFront cache (`aws cloudfront create-invalidation --paths '/*'`); the next request will get CORS-correct response |
| Lambda zip deployment fails (size exceeded) | MEDIUM | Switch to container image (`DockerImageFunction` in CDK); rebuild and redeploy |
| NAT Gateway missing — external calls time out | HIGH | Add NAT Gateway in CDK; redeploy VPC stack; Lambda cold starts will increase ~50ms but internet access is restored |
| dlt writes to read-only filesystem | LOW | Add `DLT_DATA_DIR=/tmp/dlt` to Lambda environment variables; redeploy function |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| DuckDB temp files on EFS (stale handle) | Lambda CDK setup | `SET temp_directory='/tmp/duckdb_swap'` present in handler; no `Stale file handle` errors in first 3 Lambda invocations |
| Lambda package >250 MB | Lambda CDK setup | Use `DockerImageFunction`; `cdk deploy` succeeds without size limit error |
| Python 3.14 runtime availability | Lambda CDK setup | Dockerfile `FROM public.ecr.aws/lambda/python:3.14` pulls successfully; Lambda logs show Python 3.14.x |
| CloudFront CORS cache | Frontend runtime fetching phase | `OPTIONS` preflight returns 200 with correct CORS headers in production browser |
| S3 CORS `OPTIONS` preflight | Frontend runtime fetching phase | hyparquet successfully reads first 8 bytes (magic) of ecdysis.parquet without CORS error |
| DuckDB single-writer lock | Lambda CDK setup | Reserved concurrency = 1 set in CDK |
| VPC egress for external APIs | VPC/networking phase | Lambda can reach `ecdysis.org` and `api.inaturalist.org` |
| EFS security group misconfiguration | VPC/networking phase | Lambda mounts EFS within 5 seconds on cold start; no `EfsMountConnectivityError` |
| Links pipeline timeout | Lambda handler + seed phase | Full incremental run completes in < 900s from CloudWatch timestamps |
| dlt read-only filesystem | Lambda handler phase | `DLT_DATA_DIR=/tmp/dlt` set; no `PermissionError` on first invocation |

---

## Sources

- [AWS Lambda Python runtimes — official docs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) — Python 3.14 support confirmed (November 2025)
- [Python 3.14 now available in AWS Lambda — AWS blog](https://aws.amazon.com/blogs/compute/python-3-14-runtime-now-available-in-aws-lambda/)
- [duckdb in AWS-Lambda: Memory/Storage issues — GitHub discussion #8687](https://github.com/duckdb/duckdb/discussions/8687) — EFS stale file handle, Lambda not suitable for DuckDB with large data
- [DuckDB concurrency docs](https://duckdb.org/docs/stable/connect/concurrency) — single-writer, POSIX lock model
- [DuckDB lock on NFS issue #17158](https://github.com/duckdb/duckdb/issues/17158) — `IO Error: Could not set lock on file` even read_only
- [Lambda EFS configuration — AWS docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-filesystem.html) — access point, security group, VPC requirements
- [Improved VPC networking for Lambda — AWS blog](https://aws.amazon.com/blogs/compute/announcing-improved-vpc-networking-for-aws-lambda-functions/) — Hyperplane ENI; VPC cold starts now under 100ms
- [Lambda ephemeral storage up to 10 GB — AWS blog](https://aws.amazon.com/blogs/aws/aws-lambda-now-supports-up-to-10-gb-ephemeral-storage/)
- [CORS through CloudFront — AWS networking blog](https://aws.amazon.com/blogs/networking-and-content-delivery/cors-configuration-through-amazon-cloudfront/) — Origin header in cache key requirement
- [S3 CORS headers proxied by CloudFront require HEAD not just GET — Bibliographic Wilderness blog](https://bibwild.wordpress.com/2023/10/09/s3-cors-headers-proxied-by-cloudfront-require-head-not-just-get/)
- [Resolve No Access-Control-Allow-Origin error in CloudFront — AWS re:Post](https://repost.aws/knowledge-center/no-access-control-allow-origin-error)
- [hyparquet GitHub — asyncBufferFromUrl, byteLength option](https://github.com/hyparam/hyparquet)
- [Lambda container image vs zip — deployment size limits](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html)
- [Using DuckDB in AWS Lambda — tobilg.com](https://tobilg.com/posts/using-duckdb-in-aws-lambda/)
- [Installing geopandas on Amazon Linux 2023 — AWS re:Post](https://repost.aws/articles/ARJV3lAJE0TcWZMrxqpQ5D3Q/installing-python-package-geopandas-on-amazon-linux-2023-for-graviton)
- [Lambda timeout — 900 second hard limit docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html)
- [dlt DuckDB destination configuration](https://dlthub.com/docs/dlt-ecosystem/destinations/duckdb)
- Live codebase: `data/run.py`, `data/export.py`, `data/ecdysis_pipeline.py`, `data/pyproject.toml`

---
*Pitfalls research for: v1.7 Production Pipeline Infrastructure — Lambda+EFS+DuckDB+CloudFront*
*Researched: 2026-03-27*
