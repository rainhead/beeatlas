# Phase 25: CDK Infrastructure - Research

**Researched:** 2026-03-27
**Domain:** AWS CDK v2 — Lambda (DockerImage), EventBridge Scheduler, Lambda Function URL, scoped S3 IAM
**Confidence:** HIGH (all constructs verified against installed aws-cdk-lib 2.238.0 type declarations and official AWS docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** EFS is dropped. Lambda stores beeatlas.duckdb in S3, downloads to /tmp on invocation, runs pipelines, and uploads the updated file back to S3. No VPC, no NAT Gateway, no EFS FileSystem needed.
- **D-02:** beeatlas.duckdb lives at `siteBucket/db/beeatlas.duckdb`. Lambda role gets scoped read/write on the `/db/*` prefix only.
- **D-03:** LAMBDA-01 (VPC) and LAMBDA-02 (EFS) are eliminated. LAMBDA-03 loses the EFS mount and VPC attachment.
- **D-04:** Single `siteBucket` for everything: frontend static files, `/data/` prefix for exported Parquets + GeoJSON, `/db/` prefix for beeatlas.duckdb backup. No separate bucket.
- **D-05:** Lambda role permissions: read/write on `/data/*` (export destination) and `/db/*` (DuckDB backup). No access to site root (frontend files).
- **D-06:** The stub handler downloads beeatlas.duckdb from S3 to /tmp, writes a test row (or touch), then uploads it back.
- **D-07:** Invoking the Lambda URL must return 200 and CloudWatch logs must confirm the S3 round-trip succeeded.
- **D-08:** Dockerfile lives in `data/`. CDK references it via `DockerImageCode.fromImageAsset('data/')`. Python 3.14 base image per `data/pyproject.toml` requirement.
- **D-09:** Two EventBridge Scheduler rules: iNat pipeline nightly, full pipeline (all 5) weekly. Use EventBridge Scheduler constructs (not old-style EventBridge Rules).
- **D-10:** Reserved concurrency = 1 on the Lambda function.
- **D-11:** Lambda URL added for manual invocation (auth is Claude's discretion).

### Claude's Discretion
- Auth mode on Lambda URL (NONE vs IAM) — either is acceptable
- Exact IAM policy statement structure for the scoped S3 permissions
- Whether stub handler lives in `data/stub_handler.py` or inline in CDK — recommend a small dedicated Python file

### Deferred Ideas (OUT OF SCOPE)
- Lambda monitoring / alerting (CloudWatch dashboards, SNS on failure)
- Lambda concurrency controls beyond reserved=1
- Multi-region deployment
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAMBDA-03 | CDK adds `DockerImageFunction` (Python 3.14 base image, no VPC, 15-min timeout, reserved concurrency 1, env vars `DLT_DATA_DIR=/tmp/dlt` and `temp_directory=/tmp/duckdb_swap`); Lambda role has scoped S3 read/write on `/data/*` and `/db/*` prefixes of siteBucket | DockerImageFunction props verified; scoped grantReadWrite API verified |
| LAMBDA-04 | CDK adds EventBridge Scheduler rules: iNat pipeline nightly, full pipeline (all 5) weekly | Schedule + LambdaInvoke confirmed in aws-cdk-lib 2.238.0; ScheduleExpression.cron API verified |
| LAMBDA-05 | CDK adds Lambda Function URL for manual invocation | addFunctionUrl + FunctionUrl.url property verified; FunctionUrlAuthType options confirmed |
</phase_requirements>

---

## Summary

Phase 25 adds three constructs to `BeeAtlasStack`: a `DockerImageFunction` (stub handler, Python 3.14 container), two `Schedule` rules (nightly iNat, weekly full pipeline), and a Lambda Function URL. The stub handler performs an S3 round-trip to prove IAM permissions and /tmp access before Phase 26 wires in the real pipeline.

All three constructs — `DockerImageFunction`, `Schedule`/`LambdaInvoke`, and `addFunctionUrl` — are stable and present in the installed `aws-cdk-lib` 2.238.0. No alpha packages are needed. The `aws-scheduler` and `aws-scheduler-targets` modules graduated to GA in April 2025 and are fully integrated into `aws-cdk-lib`.

A `Dockerfile` does not yet exist in `data/`. It must be created in this phase as a minimal stub. CDK will call `docker build` pointing to `data/` as the build context when running `cdk synth` or `cdk deploy`. The developer's machine already has Docker 29.3.1 and the CDK CLI 2.1112.0 installed.

**Primary recommendation:** Add the Lambda, two Scheduler rules, and Function URL to `BeeAtlasStack`. Create a minimal `data/Dockerfile` and `data/stub_handler.py`. Use `authType: FunctionUrlAuthType.NONE` for the Lambda URL (volunteer project, manual invocation only, no sensitive data in the URL endpoint). Use `bucket.grantReadWrite(fn, 'data/*')` and `bucket.grantReadWrite(fn, 'db/*')` for prefix-scoped IAM.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| aws-cdk-lib | 2.238.0 (installed) | All CDK constructs | Already used in project |
| constructs | ^10.0.0 | CDK construct tree | Peer dependency |

### Submodules in use (this phase)
| Import path | Key exports | Available in 2.238.0 |
|-------------|-------------|---------------------|
| `aws-cdk-lib/aws-lambda` | `DockerImageFunction`, `DockerImageCode`, `FunctionUrlAuthType`, `Architecture` | Yes — verified |
| `aws-cdk-lib/aws-ecr-assets` | `Platform` | Yes — verified |
| `aws-cdk-lib/aws-scheduler` | `Schedule`, `ScheduleExpression`, `TimeZone` | Yes — verified |
| `aws-cdk-lib/aws-scheduler-targets` | `LambdaInvoke` | Yes — verified |
| `aws-cdk-lib/aws-iam` | `PolicyStatement`, `Effect` | Already imported |
| `aws-cdk-lib` | `Duration`, `Size`, `cdk.CfnOutput` | Already used |

**No new npm packages are needed.** All required constructs are in `aws-cdk-lib` 2.238.0.

---

## Architecture Patterns

### Recommended Project Structure (additions this phase)

```
infra/lib/beeatlas-stack.ts   # add Lambda, Scheduler, URL constructs here
data/
├── Dockerfile                # NEW: minimal Python 3.14 Lambda container
└── stub_handler.py           # NEW: S3 round-trip stub
```

### Pattern 1: DockerImageFunction with all required props

```typescript
// Source: aws-cdk-lib/aws-lambda type declarations (verified 2.238.0)
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';

const pipelineFn = new lambda.DockerImageFunction(this, 'PipelineFunction', {
  code: lambda.DockerImageCode.fromImageAsset(
    path.join(__dirname, '../../data'),
    {
      // Force x86_64 build regardless of developer's host CPU (ARM Mac).
      // CDK passes --platform linux/amd64 to docker build.
      platform: Platform.LINUX_AMD64,
    }
  ),
  architecture: lambda.Architecture.X86_64,
  timeout: cdk.Duration.minutes(15),
  memorySize: 1024,
  ephemeralStorageSize: cdk.Size.mebibytes(4096), // 4 GB /tmp for DuckDB + exports
  reservedConcurrentExecutions: 1,
  environment: {
    DLT_DATA_DIR: '/tmp/dlt',
    temp_directory: '/tmp/duckdb_swap',
    BUCKET_NAME: siteBucket.bucketName,
  },
});
```

**Key points:**
- `platform: Platform.LINUX_AMD64` in `fromImageAsset` props sets `--platform linux/amd64` at Docker build time. Required when deploying x86_64 Lambda from an ARM Mac.
- `architecture: lambda.Architecture.X86_64` on the function is the Lambda runtime architecture.
- Both must agree — mismatching causes container failure at invocation.
- `ephemeralStorageSize` uses `cdk.Size.mebibytes()` not a raw number.
- Default /tmp is 512 MB; DuckDB working + export files can easily exceed that. 4 GB is a reasonable buffer.

### Pattern 2: Scoped S3 access (prefix-based, not whole-bucket)

```typescript
// Source: aws-cdk-lib/aws-s3 grantReadWrite second argument = objectsKeyPattern
// Grants object-level actions (GetObject, PutObject, DeleteObject) scoped to prefix.
// Bucket-level s3:ListBucket is also granted (applies to whole bucket — unavoidable with grant methods).
siteBucket.grantReadWrite(pipelineFn, 'data/*');
siteBucket.grantReadWrite(pipelineFn, 'db/*');
```

**Why two calls, not one:** Each call generates a separate IAM policy statement with a distinct resource ARN pattern. This keeps permissions minimal and auditable.

**What `grantReadWrite(principal, pattern)` includes:**
- `s3:GetObject`, `s3:PutObject`, `s3:PutObjectAcl`, `s3:DeleteObject` on `arn:aws:s3:::BUCKET/data/*`
- `s3:ListBucket` on `arn:aws:s3:::BUCKET` (bucket-level, cannot be scoped to prefix by grant methods alone)

**If stricter ListBucket scoping is needed** (not required for this phase), add a manual `addToRolePolicy` with a `Condition: { StringLike: { 's3:prefix': ['data/*', 'db/*'] } }`.

### Pattern 3: EventBridge Scheduler (nightly + weekly)

```typescript
// Source: aws-cdk-lib/aws-scheduler and aws-cdk-lib/aws-scheduler-targets
// Both verified in installed 2.238.0 type declarations
import { Schedule, ScheduleExpression, TimeZone } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';

// Nightly: iNat pipeline only (UTC 08:00 = midnight Pacific during standard time)
new Schedule(this, 'NightlyInatSchedule', {
  schedule: ScheduleExpression.cron({
    minute: '0',
    hour: '8',     // 08:00 UTC
    timeZone: TimeZone.ETC_UTC,
  }),
  target: new LambdaInvoke(pipelineFn, {
    input: ScheduleTargetInput.fromObject({ pipeline: 'inat' }),
  }),
  description: 'Nightly iNat pipeline refresh',
});

// Weekly: full pipeline run (all 5) — Sunday 10:00 UTC
new Schedule(this, 'WeeklyFullSchedule', {
  schedule: ScheduleExpression.cron({
    minute: '0',
    hour: '10',
    weekDay: 'SUN',
    timeZone: TimeZone.ETC_UTC,
  }),
  target: new LambdaInvoke(pipelineFn, {
    input: ScheduleTargetInput.fromObject({ pipeline: 'full' }),
  }),
  description: 'Weekly full pipeline run (all 5 pipelines)',
});
```

**Key points:**
- `ScheduleProps.schedule` (not `expression`) is the property name — verified in type declaration.
- `CronOptionsWithTimezone` extends `events.CronOptions` which has `weekDay?: string` (not `dayOfWeek`).
- `LambdaInvoke` auto-creates an IAM role with `lambda:InvokeFunction` on the target function. No manual IAM needed.
- The stub handler in Phase 25 ignores the `pipeline` input; Phase 26 handler will use it.

### Pattern 4: Lambda Function URL + CfnOutput

```typescript
// Source: aws-cdk-lib/aws-lambda FunctionUrl.url property verified
const fnUrl = pipelineFn.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
});

new cdk.CfnOutput(this, 'PipelineFunctionUrl', {
  value: fnUrl.url,
  description: 'Lambda Function URL for manual pipeline invocation',
});

new cdk.CfnOutput(this, 'PipelineFunctionArn', {
  value: pipelineFn.functionArn,
  description: 'Lambda function ARN',
});
```

**Auth decision — NONE is correct for this project:**
- This is a volunteer project with no sensitive data served through the URL.
- `NONE` allows direct invocation via `curl` without AWS credentials.
- `AWS_IAM` would require signing requests with `sigv4`, complicating manual testing.
- The endpoint only triggers pipeline execution (no data exfiltration risk from invocation alone).

### Pattern 5: Minimal Dockerfile (data/Dockerfile)

```dockerfile
FROM public.ecr.aws/lambda/python:3.14

# Install stub dependencies (boto3 is pre-installed in Lambda base image)
COPY stub_handler.py ${LAMBDA_TASK_ROOT}/

CMD [ "stub_handler.handler" ]
```

**Notes:**
- `boto3` is pre-installed in AWS Lambda base images — no pip install needed for the stub.
- `${LAMBDA_TASK_ROOT}` is `/var/task` in the Lambda environment.
- Phase 26 will replace or augment this Dockerfile with full pip install of `requirements.txt`.
- Python 3.14 base image is available at `public.ecr.aws/lambda/python:3.14` (GA as of late 2025, AL2023-based).

### Pattern 6: Stub handler Python code (data/stub_handler.py)

```python
import os
import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ['BUCKET_NAME']
DB_KEY = 'db/beeatlas.duckdb'
TMP_PATH = '/tmp/beeatlas.duckdb'
SENTINEL_KEY = 'db/stub-sentinel.txt'


def handler(event, context):
    s3 = boto3.client('s3')

    # Download DuckDB file — graceful miss on first run
    print(f"Attempting download: s3://{BUCKET}/{DB_KEY}")
    try:
        s3.download_file(BUCKET, DB_KEY, TMP_PATH)
        size = os.path.getsize(TMP_PATH)
        print(f"Downloaded {DB_KEY}: {size} bytes")
    except ClientError as e:
        if e.response['Error']['Code'] in ('NoSuchKey', '404'):
            print(f"File not found (first run): {DB_KEY}")
            # Write a placeholder so upload has something to push
            with open(TMP_PATH, 'w') as f:
                f.write('stub-placeholder')
        else:
            raise

    # Verify /tmp write access
    sentinel = '/tmp/dlt/.sentinel'
    os.makedirs('/tmp/dlt', exist_ok=True)
    with open(sentinel, 'w') as f:
        f.write('ok')
    print(f"/tmp write confirmed: {sentinel}")

    # Upload back to S3
    s3.upload_file(TMP_PATH, BUCKET, SENTINEL_KEY)
    print(f"Uploaded sentinel to s3://{BUCKET}/{SENTINEL_KEY}")

    return {
        'statusCode': 200,
        'body': 'S3 round-trip complete',
    }
```

**Notes:**
- Uploads to `db/stub-sentinel.txt` rather than overwriting `db/beeatlas.duckdb` — safer during stub phase.
- Catches `NoSuchKey` (key doesn't exist) via `ClientError` — boto3 raises `ClientError` for all S3 errors; check `Error.Code`.
- Creates `/tmp/dlt` to verify the `DLT_DATA_DIR` path is writable.

### Anti-Patterns to Avoid

- **Using `@aws-cdk/aws-scheduler-targets-alpha`:** This alpha package is superseded. Use `aws-cdk-lib/aws-scheduler-targets` instead (confirmed in v2.238.0).
- **Using old EventBridge Rules for scheduling:** `aws_events.Rule` with `schedule` is the legacy approach. Use `aws-cdk-lib/aws-scheduler` `Schedule` construct instead.
- **Omitting `platform` in `fromImageAsset` on ARM Mac:** Without this, `docker build` produces an ARM64 image that silently fails at Lambda invocation (exec format error).
- **Using `bucket.grantReadWrite(fn)` without prefix:** This grants access to all objects in the bucket, including the CloudFront-served frontend files. Always pass the key pattern.
- **Hardcoding the bucket name:** Inject `siteBucket.bucketName` as a Lambda environment variable; do not hardcode.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EventBridge Scheduler IAM role | Manual `iam.Role` + `lambda:InvokeFunction` policy | `LambdaInvoke` auto-creates the role | Handles ARN resolution, versioning edge cases |
| Scoped S3 permissions | Custom `PolicyStatement` array | `bucket.grantReadWrite(fn, 'prefix/*')` | CDK computes correct ARN patterns, handles both bucket and object statements |
| Lambda execution role | `new iam.Role(...)` | CDK creates it automatically when Lambda is created | CDK wires AssumeRolePolicyDocument correctly |
| Docker build platform | Explicit `--platform` in Dockerfile | `platform: Platform.LINUX_AMD64` in `fromImageAsset` props | CDK passes the flag to `docker build` automatically |

**Key insight:** EventBridge Scheduler and Lambda URL constructs handle IAM wiring automatically. Manual policy statements are only needed for non-standard patterns (e.g., strict ListBucket prefix conditions).

---

## Common Pitfalls

### Pitfall 1: ARM/x86 Mismatch (Developer on M-series Mac)
**What goes wrong:** CDK deploys a Lambda container image built for ARM64 to an x86_64 Lambda runtime. The function fails with "exec format error" at invocation.
**Why it happens:** `docker build` on Apple Silicon defaults to `linux/arm64`. Lambda defaults to x86_64.
**How to avoid:** Set `platform: Platform.LINUX_AMD64` in `DockerImageCode.fromImageAsset` props AND `architecture: lambda.Architecture.X86_64` on the function. Both must agree.
**Warning signs:** Lambda invocation returns a `Runtime.ExitError` or `exec format error` in CloudWatch logs.

### Pitfall 2: ScheduleProps uses `schedule:` not `expression:`
**What goes wrong:** TypeScript compiler error or runtime failure because the property is named `schedule`, not `expression`.
**Why it happens:** Older blog posts and alpha-era docs used `expression`.
**How to avoid:** The `ScheduleProps` interface (verified in 2.238.0 type declarations) uses `schedule: ScheduleExpression`. Always check the installed type declarations.
**Warning signs:** `tsc` compile error: "Object literal may only specify known properties".

### Pitfall 3: `FunctionUrl.url` not `functionUrl`
**What goes wrong:** Accessing `.functionUrl` on the returned `FunctionUrl` object returns `undefined`.
**Why it happens:** The property is `.url`, not `.functionUrl` (despite the class name being `FunctionUrl`).
**How to avoid:** Use `fnUrl.url` — verified in `aws-cdk-lib/aws-lambda/lib/function-url.d.ts`.
**Warning signs:** `CfnOutput` with value `undefined` produces an empty CloudFormation output.

### Pitfall 4: Dockerfile not present at CDK synth time
**What goes wrong:** `cdk synth` fails with "Cannot find Dockerfile" because `data/Dockerfile` doesn't exist yet.
**Why it happens:** `DockerImageCode.fromImageAsset` requires the Dockerfile to exist at synth time — CDK tries to hash the asset.
**How to avoid:** Create `data/Dockerfile` and `data/stub_handler.py` BEFORE running `cdk synth` or `cdk deploy`.
**Warning signs:** `Error: Cannot find file at path 'data/Dockerfile'` during synthesis.

### Pitfall 5: /tmp space exhaustion with real DuckDB
**What goes wrong:** Lambda aborts with out-of-space error when beeatlas.duckdb + DuckDB temp files exceed the configured /tmp size.
**Why it happens:** Default /tmp is 512 MB. DuckDB uses temp files in `temp_directory` for sorting and joins. A multi-GB database + temp files easily exceeds 512 MB.
**How to avoid:** Set `ephemeralStorageSize: cdk.Size.mebibytes(4096)` (4 GB). The stub phase won't hit this, but the CDK config should be production-ready from the start.
**Warning signs:** `No space left on device` in CloudWatch logs.

### Pitfall 6: S3 NoSuchKey error code via boto3 ClientError
**What goes wrong:** Stub handler crashes on first invocation when `db/beeatlas.duckdb` doesn't exist in S3 yet.
**Why it happens:** boto3's `s3.download_file` raises `ClientError` (not `S3.Client.exceptions.NoSuchKey`) for missing keys; the error code is in `e.response['Error']['Code']`.
**How to avoid:** Catch `ClientError` and check `e.response['Error']['Code'] in ('NoSuchKey', '404')`.
**Warning signs:** `ClientError: An error occurred (NoSuchKey)` in CloudWatch logs on first run.

---

## Code Examples

### Complete imports block for beeatlas-stack.ts additions

```typescript
// Source: verified against aws-cdk-lib 2.238.0 installed node_modules
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Schedule, ScheduleExpression, TimeZone, ScheduleTargetInput } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import * as path from 'path';
```

### CronOptionsWithTimezone — verified field names

```typescript
// CronOptionsWithTimezone extends events.CronOptions
// events.CronOptions fields (verified): minute, hour, day, month, year, weekDay
// timeZone field added by CronOptionsWithTimezone

ScheduleExpression.cron({
  minute: '0',
  hour: '8',
  // weekDay: 'SUN'  ← add for weekly only; omit for nightly (every day)
  timeZone: TimeZone.ETC_UTC,
})
```

### LambdaInvoke constructor

```typescript
// Source: aws-cdk-lib/aws-scheduler-targets/lib/lambda-invoke.d.ts
// constructor(func: lambda.IFunction, props?: ScheduleTargetBaseProps)
// ScheduleTargetBaseProps: { role?, deadLetterQueue?, input?, maxEventAge?, retryAttempts? }
new LambdaInvoke(pipelineFn)  // no props required
```

### ephemeralStorageSize

```typescript
// Source: aws-cdk-lib/aws-lambda/lib/function.d.ts line 196
// readonly ephemeralStorageSize?: Size;
ephemeralStorageSize: cdk.Size.mebibytes(4096)  // 4 GB /tmp
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@aws-cdk/aws-scheduler-targets-alpha` | `aws-cdk-lib/aws-scheduler-targets` | April 2025 (GA) | No separate package install needed |
| `@aws-cdk/aws-scheduler-alpha` | `aws-cdk-lib/aws-scheduler` | April 2025 (GA) | Stable, no breaking changes planned |
| `s3.S3Origin` (deprecated OAI) | `origins.S3BucketOrigin.withOriginAccessControl()` | CDK v2.156.0 | Already used correctly in existing stack |

**Deprecated/outdated:**
- `@aws-cdk/aws-scheduler-targets-alpha`: Superseded by stable module in aws-cdk-lib. Do not install.
- `events.Rule` with `Schedule.cron()` for Lambda scheduling: Functional but the legacy approach. EventBridge Scheduler is the modern replacement with flexible time windows and retry policies.

---

## Open Questions

1. **Cron time for nightly iNat schedule**
   - What we know: "nightly" is the requirement; exact UTC time is not specified
   - What's unclear: Best UTC hour to avoid peak AWS load and align with WA timezone (Pacific)
   - Recommendation: Use `hour: '8'` (08:00 UTC = midnight Pacific Standard / 1 AM Pacific Daylight). Planner can adjust.

2. **Cron day/time for weekly full schedule**
   - What we know: "weekly" is the requirement; day is not specified
   - What's unclear: Preferred day of week
   - Recommendation: Use Sunday 10:00 UTC. Low-traffic day; gives fresh data for Monday.

3. **CDK asset path: relative vs. path.join**
   - What we know: `DockerImageCode.fromImageAsset('data/')` is in the CONTEXT.md D-08 decision
   - What's unclear: Whether CDK resolves relative paths from the stack file location or from `cdk.json`
   - Recommendation: Use `path.join(__dirname, '../../data')` for explicit resolution. CDK evaluates asset paths relative to the CDK app entrypoint, but using `__dirname` in the stack file is unambiguous.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| AWS CLI | `aws s3 ls` verification in success criteria | Yes | 2.34.14 | — |
| CDK CLI | `cdk deploy` | Yes | 2.1112.0 | — |
| Docker | `cdk synth` (builds container image) | Yes | 29.3.1 | — |
| docker buildx | Platform-targeted builds (`--platform linux/amd64`) | Likely (bundled with Docker Desktop 29.x) | unknown | Use `DOCKER_DEFAULT_PLATFORM=linux/amd64` env var |
| Node.js | CDK CLI | — | — | — |

**Note on docker buildx:** Docker Desktop 29.x ships with buildx. The `platform: Platform.LINUX_AMD64` in CDK assets uses `--platform` which requires buildx (or BuildKit). If `docker buildx` is not available, set `DOCKER_DEFAULT_PLATFORM=linux/amd64` as a workaround; alternatively, CDK falls back to the legacy builder which also supports `--platform` via BuildKit.

**No blocking missing dependencies.**

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None applicable for CDK infrastructure (no unit test suite configured in infra/) |
| Quick run command | `cd infra && npm run build` (TypeScript compilation catches type errors) |
| Full suite command | `cd infra && npm run synth` (CloudFormation synthesis validates construct configuration) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LAMBDA-03 | DockerImageFunction exists with correct props | synth smoke | `cd infra && npx cdk synth 2>&1 \| grep -c PipelineFunction` | No CDK stack yet — Wave 0 |
| LAMBDA-04 | Two Schedule constructs present | synth smoke | `cd infra && npx cdk synth 2>&1 \| grep -c AWS::Scheduler::Schedule` | No CDK stack yet — Wave 0 |
| LAMBDA-05 | Lambda URL output present | synth smoke | `cd infra && npx cdk synth 2>&1 \| grep PipelineFunctionUrl` | No CDK stack yet — Wave 0 |

**Manual verification (required by success criteria):**
- `cdk deploy` completes without error
- `curl <Lambda URL>` returns 200
- CloudWatch logs show S3 round-trip completion
- EventBridge Scheduler console shows two rules

### Sampling Rate
- **Per task commit:** `cd infra && npm run build` (TypeScript compile)
- **Per wave merge:** `cd infra && npx cdk synth` (full CloudFormation synthesis)
- **Phase gate:** `cdk deploy` + manual invocation test before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `data/Dockerfile` — must exist before `cdk synth` can hash the asset
- [ ] `data/stub_handler.py` — required by Dockerfile CMD
- [ ] Additions to `infra/lib/beeatlas-stack.ts` — Lambda, Scheduler, URL constructs

---

## Sources

### Primary (HIGH confidence)
- Installed `aws-cdk-lib` 2.238.0 node_modules type declarations — verified all construct APIs, property names, method signatures
  - `aws-lambda/lib/function.d.ts` — `reservedConcurrentExecutions`, `ephemeralStorageSize`, `addFunctionUrl`
  - `aws-lambda/lib/function-url.d.ts` — `FunctionUrl.url` property, `FunctionUrlAuthType`
  - `aws-scheduler/lib/schedule.d.ts` — `ScheduleProps.schedule` (not `expression`)
  - `aws-scheduler/lib/schedule-expression.d.ts` — `ScheduleExpression.cron()`, `CronOptionsWithTimezone`
  - `aws-scheduler-targets/lib/lambda-invoke.d.ts` — `LambdaInvoke(func, props?)`
  - `aws-scheduler-targets/lib/target.d.ts` — `ScheduleTargetBaseProps`
  - `aws-ecr-assets/lib/image-asset.d.ts` — `Platform.LINUX_AMD64`, `Platform.LINUX_ARM64`
- [AWS CDK DockerImageFunction docs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.DockerImageFunction.html)
- [AWS CDK FunctionUrlOptions docs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda.FunctionUrlOptions.html)
- [AWS Lambda Python 3.14 container image docs](https://docs.aws.amazon.com/lambda/latest/dg/python-image.html)

### Secondary (MEDIUM confidence)
- [EventBridge Scheduler GA announcement (April 2025)](https://aws.amazon.com/blogs/devops/announcing-the-general-availability-of-the-amazon-eventbridge-scheduler-l2-construct/) — confirms scheduler/scheduler-targets graduation from alpha to stable aws-cdk-lib
- [Lambda ephemeral storage docs](https://docs.aws.amazon.com/lambda/latest/dg/configuration-ephemeral-storage.html) — 512 MB default, 10240 MB max, `ephemeralStorageSize` prop
- [Python 3.14 runtime GA announcement](https://aws.amazon.com/blogs/compute/python-3-14-runtime-now-available-in-aws-lambda/) — confirms `public.ecr.aws/lambda/python:3.14` available

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all constructs verified in installed node_modules type declarations
- Architecture: HIGH — construct APIs verified against source; patterns cross-checked with official docs
- Pitfalls: HIGH — ARM/x86 mismatch, property name differences, and NoSuchKey behavior verified against CDK source and boto3 docs

**Research date:** 2026-03-27
**Valid until:** 2026-06-27 (stable CDK constructs; re-verify if aws-cdk-lib upgraded past 2.238.0)
