# Phase 25: CDK Infrastructure - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning — BUT see architecture note below

<domain>
## Phase Boundary

Add Lambda infrastructure to BeeAtlasStack: a DockerImageFunction, EventBridge Scheduler rules (nightly iNat, weekly full), and a Lambda Function URL. The Lambda stub verifies S3 read/write from /tmp works end-to-end. No VPC, no EFS.

</domain>

<decisions>
## Implementation Decisions

### Architecture change: EFS replaced by S3

- **D-01:** EFS is dropped. Lambda stores beeatlas.duckdb in S3, downloads to /tmp on invocation, runs pipelines, and uploads the updated file back to S3. No VPC, no NAT Gateway, no EFS FileSystem needed.
- **D-02:** beeatlas.duckdb lives at `siteBucket/db/beeatlas.duckdb`. Lambda role gets scoped read/write on the `/db/*` prefix only.
- **D-03:** This eliminates LAMBDA-01 (VPC) and LAMBDA-02 (EFS) from the requirements. LAMBDA-03 loses the EFS mount and VPC attachment. Requirements and roadmap need updating before planning.

### S3 bucket strategy

- **D-04:** Single `siteBucket` for everything: frontend static files, `/data/` prefix for exported Parquets + GeoJSON, `/db/` prefix for beeatlas.duckdb backup. No separate bucket.
- **D-05:** Lambda role permissions: read/write on `/data/*` (export destination) and `/db/*` (DuckDB backup). No access to site root (frontend files).

### Lambda stub

- **D-06:** The stub handler downloads beeatlas.duckdb from S3 to /tmp, writes a test row (or touch), then uploads it back. This proves IAM permissions, /tmp write access, and S3 connectivity end-to-end before real pipeline code is wired in Phase 26.
- **D-07:** Invoking the Lambda URL must return 200 and CloudWatch logs must confirm the S3 round-trip succeeded.

### Dockerfile

- **D-08:** Dockerfile lives in `data/`. CDK references it via `DockerImageCode.fromImageAsset('data/')` with build context pointing to the data directory. Python 3.14 base image per `data/pyproject.toml` requirement.

### EventBridge Scheduler

- **D-09:** Two rules: iNat pipeline nightly, full pipeline (all 5) weekly. Use EventBridge Scheduler (not old-style EventBridge Rules) — CDK v2.238.0 supports `aws_scheduler` constructs.
- **D-10:** Reserved concurrency = 1 on the Lambda function to prevent concurrent runs.

### Lambda Function URL

- **D-11:** Lambda URL added for manual invocation (no auth required for this volunteer-project context, or IAM auth — Claude's discretion).

### Claude's Discretion

- Auth mode on Lambda URL (NONE vs IAM) — either is acceptable
- Exact IAM policy statement structure for the scoped S3 permissions
- Whether stub handler lives in `data/stub_handler.py` or inline in CDK — recommend a small dedicated Python file

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements (need updating before planning)
- `.planning/REQUIREMENTS.md` §"v1.7 Requirements" — LAMBDA-01 through LAMBDA-05; note D-01/D-02/D-03 above: LAMBDA-01 and LAMBDA-02 are obsolete, LAMBDA-03 needs revision

### Existing CDK stack
- `infra/lib/beeatlas-stack.ts` — Current stack: S3 bucket, CloudFront, OIDC role, deployer role; Lambda constructs will be added here
- `infra/package.json` — CDK version: 2.238.0

### Roadmap
- `.planning/ROADMAP.md` §"Phase 25" — Success criteria will need updating once requirements are revised

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `siteBucket` in BeeAtlasStack — Lambda role will be granted scoped S3 access to /data/* and /db/* prefixes on this bucket
- `distribution` in BeeAtlasStack — CloudFront invalidation on `/data/*` triggered after export (Phase 26); Phase 25 stub doesn't need invalidation
- OIDC deployer role pattern — Lambda gets its own execution role, not the deployer role

### Established Patterns
- `removalPolicy: cdk.RemovalPolicy.DESTROY` on siteBucket — Lambda resources should follow same pattern (Lambda, Scheduler rules); EFS would have needed RETAIN but EFS is gone
- CfnOutput for consumed values — Lambda URL and function ARN should get Outputs

### Integration Points
- New Lambda execution role needs IAM grants on siteBucket for /data/* and /db/* prefixes
- DockerImageCode.fromImageAsset('data/') — build context is the data/ directory; Dockerfile will be added there in Phase 26 (stub can use a minimal Python image)

</code_context>

<specifics>
## Specific Ideas

- S3 round-trip stub: download `db/beeatlas.duckdb` (graceful miss on first run — file won't exist yet), write a sentinel file to /tmp, upload it back. Confirms IAM and connectivity without needing a real DuckDB file.

</specifics>

<deferred>
## Deferred Ideas

- Lambda monitoring / alerting (CloudWatch dashboards, SNS on failure) — out of scope for v1.7
- Lambda concurrency controls beyond reserved=1 — out of scope per REQUIREMENTS.md
- Multi-region deployment — out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 25-cdk-infrastructure*
*Context gathered: 2026-03-27*
