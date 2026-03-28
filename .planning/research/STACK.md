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
