# Project Research Summary

**Project:** Washington Bee Atlas — v1.7 Lambda + EFS Production Pipeline Infrastructure
**Domain:** Scheduled serverless data pipeline with persistent DuckDB state, serving a static frontend via CloudFront
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

BeeAtlas v1.7 moves the data pipeline from manual/CI invocation to a fully automated Lambda function with EFS-backed DuckDB persistence. The architecture is well-understood: a Python 3.14 container image on Lambda runs the existing `run.py` pipeline on a schedule, writes exported Parquets and GeoJSON to S3, and the frontend fetches those files from CloudFront at runtime instead of loading bundled build assets. All new constructs (VPC, EFS, Lambda, EventBridge Scheduler, Lambda URL) are additions to the existing `BeeAtlasStack` — no new CDK stacks are required.

The recommended approach uses a container image (not zip) because geopandas + duckdb + dlt combined exceed Lambda's 250 MB zip limit. EFS holds the persistent `beeatlas.duckdb` between invocations; S3 holds a backup copy for disaster recovery. The pipeline must be seeded locally first (Ecdysis link scraping at 45K+ records takes ~38 min, far exceeding Lambda's 15-min hard limit), and only the incremental delta runs in Lambda on a schedule. The two-level skip cache already in the codebase handles this correctly when operating against the EFS DuckDB.

The key risks are configuration-level traps rather than architectural unknowns: DuckDB temp files must stay on `/tmp` (not EFS) to avoid NFS stale handle errors; CloudFront must include the `Origin` header in its cache key to avoid serving cached non-CORS responses to browser fetch calls; dlt's working directory must be explicitly set to `/tmp/dlt` because Lambda's `/var/task` is read-only; and Lambda concurrency must be reserved to 1 to prevent DuckDB write lock conflicts. All of these are preventable with known countermeasures documented in the research.

## Key Findings

### Recommended Stack

The existing stack (CDK v2 ^2.238.0, Python 3.14, dlt[duckdb], hyparquet, Lit, OpenLayers) requires no new npm packages. All new AWS constructs are already in `aws-cdk-lib`. See [STACK.md](./STACK.md) for the full inventory.

**Core new technologies:**
- `lambda.DockerImageFunction` + ECR container image — only viable packaging approach; geopandas native libs (GDAL/GEOS) and DuckDB exceed the 250 MB zip limit
- `efs.FileSystem` + `efs.AccessPoint` — persistent DuckDB store across Lambda invocations; `removalPolicy: RETAIN` is non-negotiable
- `ec2.Vpc` with `natGateways: 1` + S3 Gateway Endpoint (free) — EFS requires VPC; NAT Gateway provides outbound internet for iNat and Ecdysis API calls
- `scheduler.Schedule` (EventBridge Scheduler L2, GA April 2025) — preferred over EventBridge Rules for cron-triggered Lambda; supports flexible time windows
- `lambda.FunctionUrl` with `authType: NONE` — simpler than API Gateway for single-function manual invocation
- `asyncBufferFromUrl` (already in hyparquet ^1.23.3) — no version change needed; replace bundled asset imports with runtime CloudFront-relative URLs

**Version notes:**
- Python 3.14 Lambda base image (`public.ecr.aws/lambda/python:3.14`) — GA November 2025; verify tag exists before writing Dockerfile
- CDK EventBridge Scheduler L2 — available in aws-cdk-lib ^2.178+; already pinned at ^2.238.0

### Expected Features

See [FEATURES.md](./FEATURES.md) for the full feature breakdown and dependency graph.

**Must have (v1.7 launch):**
- Scheduled Lambda invocation (nightly iNat incremental + weekly full pipeline)
- Lambda timeout set to 15 minutes (900s hard limit)
- EFS mount at `/mnt/data/beeatlas.duckdb` with restore-from-S3 on empty EFS
- S3 upload of 4 exported data files + DuckDB backup after successful run
- Lambda URL for manual pipeline invocation (async, 202 response)
- Frontend runtime fetch replacing all bundled Parquet and GeoJSON imports
- Loading state and error handling in frontend for failed fetches
- CloudFront invalidation (`/data/*`) after successful S3 upload
- Reserved concurrency = 1 to prevent DuckDB write lock conflicts
- `data/fixtures/beeatlas-test.duckdb` committed for pytest coverage of `export.py`
- CI simplified to frontend-only build; `fetch-data.yml` workflow deleted

**Should have (v1.x after validation):**
- Separate EventBridge schedules: iNat-only nightly vs full pipeline weekly (reduces runtime)
- Cache-Control headers tuned per file type (Parquets: 1h TTL; GeoJSON: 24h TTL)
- CloudWatch alarm on Lambda error rate or timeout

**Defer to v2+:**
- Step Functions (pipeline is sequential; no branching/parallel execution needed at current scale)
- Multi-region S3 replication (WA-focused atlas; not needed)
- Lambda concurrency > 1 (DuckDB single-writer is a hard constraint)

**Anti-features to avoid:**
- SnapStart (incompatible with EFS mounts — AWS hard constraint as of 2025)
- DynamoDB/RDS for pipeline state (DuckDB on EFS is the correct choice for this access pattern)
- Real-time iNat webhook updates (iNat has no webhooks; static hosting precludes WebSocket server)

### Architecture Approach

The v1.7 architecture adds a Lambda execution layer alongside the existing S3 + CloudFront static hosting. All new constructs are additions to `BeeAtlasStack` in `infra/lib/beeatlas-stack.ts`. The CDK deploy order is deterministic: VPC first (prerequisite for EFS), EFS next (prerequisite for Lambda access point), then Lambda, EventBridge schedule, and Lambda URL. The frontend and CI changes are independent of the CDK deploy order but depend on the Lambda having written files to `S3/data/` before they take effect. See [ARCHITECTURE.md](./ARCHITECTURE.md) for CDK construct snippets and the complete data flow diagrams.

**Major components:**
1. `PipelineFn` (Lambda `DockerImageFunction`) — runs `data/run.py` against EFS DuckDB, exports to `/tmp/data/`, uploads to S3 `data/` and `backup/` prefixes
2. `EFS FileSystem` + `AccessPoint` — durable DuckDB store at `/mnt/data/beeatlas.duckdb`; `removalPolicy: RETAIN`
3. `EventBridge Schedule` — weekly cron (and optionally separate nightly iNat-only schedule)
4. `Lambda URL` — HTTP endpoint for on-demand pipeline invocation
5. `data/lambda/Dockerfile` — Python 3.14 Lambda base image with system deps for geopandas, uv-installed Python deps, pre-installed DuckDB spatial extension
6. Modified `export.py` — parameterized output directory (`EXPORT_DIR` env var); S3 upload when `S3_BUCKET` is set
7. Modified frontend (`bee-map.ts`, `region-layer.ts`) — `?url` import removal; runtime fetch from `/data/` CloudFront-relative path
8. Simplified `deploy.yml` — frontend-only build; `fetch-data.yml` deleted

**Key file changes inventory:**

| File | Status |
|------|--------|
| `infra/lib/beeatlas-stack.ts` | MODIFY — add VPC, EFS, Lambda, EventBridge, URL |
| `data/lambda/Dockerfile` | NEW |
| `data/run.py` | MODIFY — add `handler(event, context)` wrapper |
| `data/export.py` | MODIFY — parameterize output dir; add S3 upload |
| `data/fixtures/beeatlas-test.duckdb` | NEW |
| `data/tests/test_export.py` | NEW |
| `frontend/src/bee-map.ts` | MODIFY — runtime fetch |
| `frontend/src/region-layer.ts` | MODIFY — runtime fetch |
| `frontend/src/assets/` | MODIFY — remove data files |
| `.github/workflows/deploy.yml` | MODIFY — remove build:data step |
| `.github/workflows/fetch-data.yml` | DELETE |

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for the complete list with recovery strategies and a "looks done but isn't" checklist.

1. **DuckDB temp files on EFS cause stale file handle errors** — Keep DB file on EFS but set `temp_directory='/tmp/duckdb_swap'` immediately after `duckdb.connect()`. Do not point temp to EFS. (Pitfall 1)

2. **CloudFront caches non-CORS responses, blocking browser hyparquet fetch** — Add `Origin` to CloudFront cache key headers; configure S3 CORS with `AllowedHeaders: [Range]` and `ExposeHeaders: [Content-Range, Accept-Ranges, Content-Length]`. Both S3 CORS and CloudFront cache policy must be configured together. (Pitfall 4)

3. **dlt writes to read-only `/var/task` on Lambda cold start** — Set `DLT_DATA_DIR=/tmp/dlt` as Lambda environment variable. This is separate from the DuckDB path configuration. (Pitfall 10)

4. **DuckDB single-writer lock blocks concurrent invocations** — Set `reservedConcurrentExecutions: 1` in CDK. Add stale lock file detection in handler (mtime > 15 min = stale lock, safe to delete). (Pitfall 6)

5. **Ecdysis links pipeline exceeds 15-minute Lambda timeout on cold run** — Seed DuckDB locally before enabling the Lambda schedule. Only incremental runs (new occurrenceIDs) belong in Lambda. Document the bootstrap procedure. (Pitfall 9)

6. **EFS security group misconfiguration causes silent Lambda timeout** — Use `fileSystem.connections.allowDefaultPortFrom(lambdaFunction)` in CDK; explicitly verify Lambda SG has egress TCP 2049 to EFS SG. (Pitfall 8)

## Implications for Roadmap

Based on combined research, the dependency chain dictates a 5-phase structure. Each phase builds on infrastructure that must exist before the next phase can be validated.

### Phase 1: CDK Infrastructure (VPC + EFS + Lambda stub)

**Rationale:** All subsequent phases depend on the Lambda existing in AWS with EFS mounted. A stub handler (prints "hello", verifies EFS read/write) confirms VPC networking, EFS security groups, and NAT Gateway routing before any real pipeline code is involved. Debugging infra issues is far easier with a minimal handler.

**Delivers:** VPC with NAT Gateway + S3 Gateway Endpoint; EFS FileSystem + AccessPoint (`removalPolicy: RETAIN`); `DockerImageFunction` stub; EventBridge schedule; Lambda URL output in CDK; clean `cdk deploy`.

**Features addressed:** Scheduled invocation, Lambda URL, EFS persistence foundation, IAM role with S3 grants.

**Pitfalls to address:** EFS security group misconfiguration (Pitfall 8); DuckDB single-writer lock via `reservedConcurrentExecutions: 1` (Pitfall 6); container image packaging decision (Pitfall 2).

**Note:** Expect 15-25 min for first CDK deploy (NAT Gateway provisioning + Docker image build).

### Phase 2: Lambda Handler + Dockerfile

**Rationale:** The Dockerfile and handler code must work before the frontend can depend on S3 output. Build real pipeline execution in Lambda: multi-stage Dockerfile with geopandas + DuckDB spatial extension pre-installed, `handler(event, context)` wrapper in `run.py`, `export.py` parameterized for S3 output, CloudFront invalidation after upload.

**Delivers:** Working end-to-end pipeline run triggered by Lambda URL; `S3/data/*.parquet` and `S3/data/*.geojson` present after invocation; `S3/backup/beeatlas.duckdb` present; CloudFront invalidated.

**Features addressed:** Full pipeline execution in Lambda, S3 backup, CloudFront invalidation, restore-from-S3 on empty EFS.

**Pitfalls to address:** DuckDB temp on `/tmp` not EFS (Pitfall 1); dlt data dir set to `/tmp/dlt` (Pitfall 10); Lambda timeout at 900s; Python 3.14 base image verified (Pitfall 3); seed DuckDB locally before first Lambda run to avoid links timeout (Pitfall 9).

### Phase 3: Seed DuckDB + Pytest Coverage

**Rationale:** Establishing the test fixture before frontend changes pins the export contract. Tests can run in CI without live AWS access or local DuckDB. A failing export.py test after pipeline changes is caught before deployment.

**Delivers:** `data/fixtures/beeatlas-test.duckdb` committed to git; `data/tests/test_export.py` passing with `uv run pytest`; export column schema validated.

**Features addressed:** Test coverage gate; export contract pinning.

**Pitfalls to address:** Incremental run logic validated against DuckDB (not links.parquet) so skip logic survives Lambda restarts (Pitfall 9).

### Phase 4: Frontend Runtime Fetch

**Rationale:** Safe to change only after Phase 2 has confirmed `S3/data/` files exist in production. Remove bundled asset imports; add loading state and error handling; validate same-origin fetch from CloudFront. CORS configuration must be done in this phase even though same-origin (beeatlas.net) doesn't need it — local dev (localhost:5173) does.

**Delivers:** Frontend builds without local Parquet/GeoJSON files; loading spinner during fetch; user-visible error on fetch failure; local dev working via Vite proxy or CloudFront direct.

**Features addressed:** Runtime data fetching, loading state, error handling, Cache-Control headers.

**Pitfalls to address:** CloudFront CORS cache (Pitfall 4); S3 CORS OPTIONS preflight (Pitfall 5); avoid hardcoding CloudFront domain — use root-relative `/data/` path (Architecture Anti-Pattern 5).

### Phase 5: CI Simplification

**Rationale:** Cleanup that is cosmetic until Phases 1-4 are stable. Removing `fetch-data.yml` before the Lambda schedule is confirmed working would break the existing fallback. Do this last once the pipeline has completed at least one successful scheduled run.

**Delivers:** `deploy.yml` builds frontend only (no `build:data` step, no S3 cache env var); `fetch-data.yml` deleted; CI deploys in less time.

**Features addressed:** CI cleanup, removal of obsolete pipeline workflow.

### Phase Ordering Rationale

- Infrastructure must precede code: Lambda handler code cannot be tested in AWS without the VPC, EFS, and Lambda construct deployed first.
- Tests before frontend swap: pinning the export schema before changing how the frontend loads data prevents silent breakage of the data contract.
- Frontend swap before CI cleanup: changing CI before Phase 4 confirms live data fetch works would leave the site broken with no fallback.
- Manual bootstrap prerequisite: the Ecdysis timeout constraint (38 min cold run vs 15 min Lambda limit) means the DuckDB must be seeded locally and uploaded before the EventBridge schedule is enabled. This is a manual step documented in Phase 2, not a separate phase.

### Research Flags

Phases with straightforward, well-documented patterns (research-phase not needed):
- **Phase 1** — CDK VPC/EFS/Lambda constructs are all in `aws-cdk-lib`; official docs and CDK construct snippets are in ARCHITECTURE.md
- **Phase 3** — pytest + DuckDB fixture is standard Python testing; no novel integrations
- **Phase 5** — CI cleanup; no research needed

Phases that warrant careful review of PITFALLS.md before starting (not full research-phase, but read the relevant pitfalls first):
- **Phase 2** — Dockerfile for geopandas on Amazon Linux 2023 is finicky (GDAL system deps); DuckDB spatial extension pre-installation is non-obvious; refer to Pitfalls 1, 9, 10
- **Phase 4** — CloudFront CORS caching is the most likely production-only failure mode; refer to Pitfalls 4 and 5 before touching CloudFront/S3 config

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All new constructs in `aws-cdk-lib` (pinned); Python 3.14 Lambda runtime confirmed GA November 2025; hyparquet `asyncBufferFromUrl` confirmed stable API; no new npm packages needed |
| Features | HIGH | Based on direct inspection of `run.py`, `export.py`, `pyproject.toml`, existing CI workflows, CDK stack; iNat rate limits from official docs |
| Architecture | HIGH | CDK construct code verified against official docs; data flow derived from direct source inspection of actual pipeline code |
| Pitfalls | HIGH for Lambda/EFS/CORS (verified AWS docs); MEDIUM for dlt-specific Lambda behavior (limited official dlt-on-Lambda docs; extrapolated from DuckDB-on-Lambda community reports) |

**Overall confidence:** HIGH

### Gaps to Address

- **DuckDB spatial extension pre-installation:** The exact mechanism for bundling the spatial extension into the container image (during Docker build) needs to be verified against the Amazon Linux 2023 Lambda base image. The extension downloads binaries at install time; confirm the extension cache directory path and that it survives into the final image stage.

- **NAT Gateway cost decision:** Research recommends starting with a single NAT Gateway (~$32/month) for simplicity and revisiting with a NAT Instance (EC2 t3.nano, ~$3-4/month) if cost is a concern. This is an implementation-time decision, not a blocking gap.

- **`byteLength` for hyparquet `asyncBufferFromUrl`:** Passing `byteLength` to `asyncBufferFromUrl` saves one HEAD request per Parquet file on cold cache load. File sizes are known post-pipeline-run. Consider exposing Content-Length via CloudFront and using it in the frontend to optimize first-load time. Low priority but noted.

- **Bootstrap procedure documentation:** The manual steps to seed EFS before enabling the EventBridge schedule (run Ecdysis links locally, upload DuckDB to S3, restore from S3 to EFS) must be documented before Phase 2 is considered complete. This is not covered by any automated test.

## Sources

### Primary (HIGH confidence)
- AWS Lambda Python 3.14 runtime announcement (November 2025) — runtime availability confirmed
- AWS Lambda quotas — container image 10 GB limit vs zip 250 MB limit
- AWS CDK v2 Lambda, EFS, EC2, CloudFront API docs — construct signatures and behavior
- AWS Lambda EFS configuration docs — access point, security group, VPC requirements
- EventBridge Scheduler L2 GA announcement (April 2025) — preferred construct for cron Lambda
- iNaturalist API recommended practices — rate limits (60 req/min, 10,000 req/day)
- Live codebase (`run.py`, `export.py`, `pyproject.toml`, `beeatlas-stack.ts`, `deploy.yml`, `fetch-data.yml`, `bee-map.ts`, `region-layer.ts`) — direct inspection

### Secondary (MEDIUM confidence)
- duckdb/duckdb GitHub Discussion #8687 — EFS stale file handle, DuckDB on Lambda behavior
- DuckDB concurrency docs + GitHub issue #17158 — single-writer POSIX lock model over NFS
- AWS CORS through CloudFront networking blog — Origin header in cache key requirement
- NAT gateway vs VPC endpoint cost (Vantage.sh) — pricing analysis consistent with AWS pricing page
- EFS + Lambda cold start overhead (community sources) — 1-3s as of 2025
- tobilg.com DuckDB on Lambda — practical patterns for EFS temp directory separation
- dlt on AWS Lambda (Leolytix/community) — env var config pattern for read-only filesystem

### Tertiary (LOW confidence)
- IPv6 Egress-Only IGW as NAT alternative (carriagereturn.nl) — potential cost optimization; not the primary recommendation; needs validation if cost becomes a concern

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
