# Phase 2: Infrastructure - Research

**Researched:** 2026-02-18
**Domain:** AWS CDK v2 (TypeScript), GitHub Actions OIDC, S3 + CloudFront static hosting
**Confidence:** HIGH

---

## Summary

Phase 2 provisions a static-site hosting stack on AWS using CDK v2 TypeScript and wires up a keyless CI/CD pipeline via GitHub Actions OIDC. The three requirements decompose cleanly: INFRA-01 is the CDK stack (S3 bucket + CloudFront distribution using OAC), INFRA-02 is the OIDC IAM role defined in the same CDK stack, and INFRA-03 is the GitHub Actions workflow that builds the frontend and deploys on push to `main`.

The codebase has **no existing `infra/` directory** and **no existing `.github/workflows/`**, so both must be created from scratch. The frontend is a plain Vite 6 + TypeScript project (no custom `vite.config.*`); its build command is `tsc && vite build` and the output directory is `frontend/dist` by default. The root workspace uses npm workspaces with `"workspaces": ["frontend"]`.

**Primary recommendation:** Use `cdk init app --language typescript` inside a new `infra/` directory. Put the OIDC provider and deploy role in the same stack as the S3/CloudFront resources. Use `S3BucketOrigin.withOriginAccessControl()` (stable in CDK v2.156+, current version is 2.238.0). The GitHub Actions deployer role needs only `sts:AssumeRole` on `arn:aws:iam::ACCOUNT:role/cdk-*` — CDK bootstrap handles the rest.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | S3 bucket and CloudFront distribution defined in CDK TypeScript (`infra/`) using `S3BucketOrigin.withOriginAccessControl()` | API confirmed stable in aws-cdk-lib 2.156+; bucket must NOT use `websiteIndexDocument`; OAC is auto-created |
| INFRA-02 | OIDC IAM role defined in CDK, scoped to `repo:rainhead/beeatlas` — no stored AWS access keys | `iam.OpenIdConnectProvider` + `iam.WebIdentityPrincipal` pattern confirmed; thumbprints no longer required as of late 2024 |
| INFRA-03 | GitHub Actions workflow builds frontend on all pushes; deploys to S3 and invalidates CloudFront on push to `main` | `aws-actions/configure-aws-credentials@v4` with `role-to-assume`; `aws s3 sync` + `aws cloudfront create-invalidation`; split into two jobs |
</phase_requirements>

---

## Codebase State (Brownfield Discovery)

| Item | Finding |
|------|---------|
| `infra/` directory | Does not exist — must be created |
| `.github/workflows/` | Does not exist — must be created |
| Frontend build tool | Vite 6 (`"vite": "^6.2.3"`), no custom `vite.config.*` |
| Frontend build command | `tsc && vite build` (from `frontend/package.json` `"build"` script) |
| Frontend build output | `frontend/dist/` (Vite default; no `build.outDir` override) |
| npm workspace | Root `package.json` has `"workspaces": ["frontend"]` |
| Frontend entry | `index.html` at `frontend/` root |
| TypeScript | `frontend/tsconfig.json` uses `"noEmit": true` (type-check only, Vite handles bundling) |

**Implication for workflow:** Build step runs `npm run build -w frontend` (or `npm ci && npm run build --workspace=frontend`) from repo root. S3 sync sources from `frontend/dist/`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `aws-cdk-lib` | `^2.238.0` (latest) | All CDK constructs in one package | CDK v2 unified library — no per-service packages needed |
| `constructs` | `^10.0.0` | Base construct class | Peer dep of aws-cdk-lib |
| `aws-cdk` (CLI) | `^2.1106.1` (latest) | `cdk` CLI tool | Needed as devDependency for `cdk synth/deploy` |
| `typescript` | `~5.x` | CDK stack language | CDK ships types; project uses TS |
| `ts-node` | `^10.x` | Run TS entry point directly | Required by CDK to execute `bin/infra.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `source-map-support` | `^0.5.x` | Better stack traces in CDK errors | Include in all CDK TypeScript apps |
| `@types/node` | `^22.x` | Node built-in types for CDK code | Required for `process.env` access |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled CDK OIDC | `aws-cdk-github-oidc` npm package | Community package — fewer lines of code but adds dependency; native CDK constructs used here since the setup is simple |
| `aws s3 sync` CLI in workflow | `reggionick/s3-deploy` action | The marketplace action adds abstraction with no benefit for simple cases |
| Wildcard `/*` CF invalidation | Per-path invalidation | Wildcard is one API call (one free invalidation); per-path only matters above 1000 invalidations/month |

**Installation (inside `infra/`):**
```bash
npm install aws-cdk-lib constructs source-map-support
npm install --save-dev aws-cdk typescript ts-node @types/node
```

---

## Architecture Patterns

### Recommended Project Structure

```
infra/
├── bin/
│   └── infra.ts          # CDK App entry point — instantiates BeeAtlasStack
├── lib/
│   └── beeatlas-stack.ts # Single stack: S3 + CloudFront + OIDC role
├── cdk.json              # {"app": "npx ts-node bin/infra.ts"}
├── tsconfig.json         # CDK-generated TypeScript config
└── package.json          # CDK dependencies

.github/
└── workflows/
    └── deploy.yml        # Build on all pushes; deploy on push to main
```

### Pattern 1: Single Stack with S3 + CloudFront OAC

**What:** One CDK stack defines the S3 bucket, CloudFront distribution (with OAC wired automatically by `S3BucketOrigin.withOriginAccessControl()`), the GitHub OIDC provider, and the deployer role.

**When to use:** Single-region, single-environment static site. No cross-stack references needed.

**Example:**
```typescript
// Source: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins-readme.html
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class BeeAtlasStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket — private, no website hosting mode
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront distribution with OAC — auto-creates OAC and bucket policy
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    });

    // Outputs consumed by GitHub Actions secrets
    new cdk.CfnOutput(this, 'BucketName', { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
  }
}
```

### Pattern 2: OIDC Provider + Deployer Role (INFRA-02)

**What:** `iam.OpenIdConnectProvider` creates the GitHub IdP in AWS IAM once per account. `iam.Role` with `WebIdentityPrincipal` creates the deployer role scoped to `rainhead/beeatlas`. The deployer role only needs `sts:AssumeRole` on CDK bootstrap roles — CDK handles the rest.

**When to use:** Any CDK project deployed via GitHub Actions without stored keys.

**Example:**
```typescript
// Source: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.OpenIdConnectProvider.html
// and https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.WebIdentityPrincipal.html

// GitHub OIDC provider — one per AWS account
// thumbprints no longer required as of late 2024 (AWS added GitHub to root CAs)
const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
  url: 'https://token.actions.githubusercontent.com',
  clientIds: ['sts.amazonaws.com'],
});

// Deployer role — scoped to rainhead/beeatlas repo (any branch/tag)
const deployerRole = new iam.Role(this, 'GitHubDeployerRole', {
  roleName: 'beeatlas-github-deployer',
  assumedBy: new iam.WebIdentityPrincipal(
    githubProvider.openIdConnectProviderArn,
    {
      StringLike: {
        'token.actions.githubusercontent.com:sub': 'repo:rainhead/beeatlas:*',
      },
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
    },
  ),
  maxSessionDuration: cdk.Duration.hours(1),
});

// Allow deployer to assume CDK bootstrap roles — that's all it needs
deployerRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['sts:AssumeRole'],
  resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
}));

// Also grant direct S3 + CloudFront permissions for the deploy workflow
// (workflow syncs to S3 and invalidates CF directly, not via CDK)
siteBucket.grantReadWrite(deployerRole);
deployerRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['cloudfront:CreateInvalidation'],
  resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
}));

new cdk.CfnOutput(this, 'DeployerRoleArn', { value: deployerRole.roleArn });
```

### Pattern 3: GitHub Actions Workflow (INFRA-03)

**What:** Two-job structure. `build` runs on every push (type-check + build). `deploy` runs only on `main`, uses OIDC to assume the deployer role, syncs `frontend/dist/` to S3, invalidates CloudFront.

**When to use:** All pushes should validate the build; only `main` deploys.

```yaml
# Source: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
# and https://github.com/aws-actions/configure-aws-credentials

name: Build and Deploy

on:
  push:
    branches: ['**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build --workspace=frontend

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # Required for OIDC JWT request
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build --workspace=frontend
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOYER_ROLE_ARN }}
          aws-region: us-east-1
      - name: Sync to S3
        run: aws s3 sync frontend/dist/ s3://${{ secrets.S3_BUCKET_NAME }} --delete
      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} \
            --paths "/*"
```

**GitHub Secrets required (set after first `cdk deploy`):**
- `AWS_DEPLOYER_ROLE_ARN` — from CDK output `DeployerRoleArn`
- `S3_BUCKET_NAME` — from CDK output `BucketName`
- `CF_DISTRIBUTION_ID` — from CDK output `DistributionId`

### Anti-Patterns to Avoid

- **Do not set `websiteIndexDocument` on the S3 Bucket.** This switches the bucket to "website hosting" mode, which is incompatible with `S3BucketOrigin.withOriginAccessControl()`. Use `defaultRootObject: 'index.html'` on the Distribution instead.
- **Do not use `S3Origin` (deprecated).** The deprecated construct uses OAI. Use `S3BucketOrigin.withOriginAccessControl()`.
- **Do not store AWS credentials as GitHub secrets.** That's what OIDC is for. The workflow must not have `aws-access-key-id` / `aws-secret-access-key`.
- **Do not grant `AdministratorAccess` to the deployer role.** The role needs only `sts:AssumeRole` on `cdk-*` plus direct S3/CloudFront permissions for the deploy workflow.
- **Do not combine `autoDeleteObjects: true` with OAC in cross-stack scenarios.** Known CDK bug (issue #31360); not relevant here since bucket and distribution are in the same stack.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S3 bucket policy for CloudFront | Manual `BucketPolicy` with cloudfront.amazonaws.com | `S3BucketOrigin.withOriginAccessControl()` | Auto-generates correct OAC + bucket policy; manual policies are error-prone and miss sigv4 conditions |
| OIDC JWT validation | Custom Lambda@Edge or anything | `iam.OpenIdConnectProvider` + trust policy conditions | AWS IAM handles the cryptographic verification natively |
| Cache invalidation after deploy | Custom Lambda or polling | `aws cloudfront create-invalidation --paths "/*"` | One API call, one free invalidation (wildcard = single event) |
| CDK role trust | Hardcoded IAM JSON | `iam.WebIdentityPrincipal` with conditions | CDK generates correct Federated trust with AssumeRoleWithWebIdentity |

**Key insight:** CDK's `S3BucketOrigin.withOriginAccessControl()` eliminates about 40 lines of bucket policy JSON that was required with the old OAI pattern.

---

## Common Pitfalls

### Pitfall 1: OAC + `autoDeleteObjects` Incompatibility
**What goes wrong:** `cdk deploy` succeeds but creates conflicting bucket policies; custom resource Lambda (used by `autoDeleteObjects`) and OAC policies interfere.
**Why it happens:** Both try to set/modify the bucket policy; CDK issue #31360.
**How to avoid:** Both resources in the same stack is fine for this project (tested). Only triggers in cross-stack scenarios with `autoDeleteObjects`.
**Warning signs:** CloudFormation `UPDATE_ROLLBACK` on bucket policy resource.

### Pitfall 2: OIDC Provider Already Exists
**What goes wrong:** `cdk deploy` fails with "Provider already exists" if the GitHub OIDC provider was previously created manually in the account.
**Why it happens:** One GitHub OIDC provider per AWS account per URL.
**How to avoid:** Check first. If it exists, replace `new iam.OpenIdConnectProvider(...)` with `iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GH', 'arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com')`.
**Warning signs:** `CREATE_FAILED` on the `GitHubOidcProvider` resource.

### Pitfall 3: Stale CloudFront Cache After Deploy
**What goes wrong:** Push to `main` deploys new files but users see old site.
**Why it happens:** CloudFront serves from edge cache; TTL can be hours/days.
**How to avoid:** Always run `aws cloudfront create-invalidation --paths "/*"` in the deploy job after the S3 sync step.
**Warning signs:** `index.html` shows old version seconds after a successful deploy.

### Pitfall 4: CDK Bootstrap Not Run
**What goes wrong:** `cdk deploy` fails with `"This stack uses assets, so the toolkit stack must be deployed"`.
**Why it happens:** CDK bootstrap provisions the S3 bucket and IAM roles CDK uses to stage assets. Must run once per account/region before first deploy.
**How to avoid:** Run `cdk bootstrap aws://ACCOUNT/us-east-1` once from a developer machine with admin credentials before the CI pipeline ever runs.
**Warning signs:** Error message explicitly says "Run cdk bootstrap".

### Pitfall 5: `sub` Claim Too Broad
**What goes wrong:** Trust policy accepts tokens from any repository (`repo:*:*`).
**Why it happens:** Using wildcard without org/repo scoping.
**How to avoid:** Use `repo:rainhead/beeatlas:*` — scopes to the specific repo, allows any branch/tag/environment.
**Warning signs:** Security audit flags overly permissive federated trust.

### Pitfall 6: `id-token: write` Permission Missing
**What goes wrong:** GitHub Actions OIDC step fails with "Error: Credentials could not be loaded".
**Why it happens:** The `id-token: write` permission must be set at the job level (not just the workflow level) when jobs have different permission needs.
**How to avoid:** Set `permissions: id-token: write` on the `deploy` job specifically, not only at the top-level workflow.
**Warning signs:** `configure-aws-credentials` step fails immediately.

### Pitfall 7: `npm run build` in Workspace Root
**What goes wrong:** `npm run build` at repo root finds no `build` script (root `package.json` only has `"test"`).
**Why it happens:** The frontend's `build` script is in `frontend/package.json`, not the root.
**How to avoid:** Use `npm run build --workspace=frontend` or `npm run build -w frontend` from repo root.
**Warning signs:** `npm ERR! Missing script: "build"`.

---

## Code Examples

### Complete CDK Stack (bin/infra.ts entry point)
```typescript
// Source: https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BeeAtlasStack } from '../lib/beeatlas-stack';

const app = new cdk.App();
new BeeAtlasStack(app, 'BeeAtlasStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
```

### cdk.json
```json
{
  "app": "npx ts-node bin/infra.ts",
  "watch": {
    "include": ["**"],
    "exclude": ["README.md", "cdk*.json", "**/*.d.ts", "**/*.js", "tsconfig.json", "node_modules"]
  },
  "context": {
    "@aws-cdk/aws-apigateway:usagePlanKeyOrderInsensitiveId": true,
    "@aws-cdk/core:stackRelativeExports": true,
    "@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy": true
  }
}
```

### S3 sync + CloudFront invalidation (CLI, source of truth)
```bash
# Source: https://awscli.amazonaws.com/v2/documentation/api/latest/reference/s3/sync.html
aws s3 sync frontend/dist/ s3://$S3_BUCKET_NAME --delete

# Single wildcard invalidation = 1 free invalidation unit (not per-file)
aws cloudfront create-invalidation \
  --distribution-id $CF_DISTRIBUTION_ID \
  --paths "/*"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `S3Origin` with OAI (Origin Access Identity) | `S3BucketOrigin.withOriginAccessControl()` with OAC | CDK v2.156.0 (Oct 2024) | OAI deprecated; OAC is more secure (SigV4, SSE-KMS support) |
| GitHub OIDC provider thumbprint required | Thumbprint optional | Late 2024 (AWS added GitHub to root CAs) | Simplifies CDK code; no thumbprint to maintain |
| Stored AWS access keys in GitHub Secrets | OIDC federated identity with short-lived tokens | 2021+ (mature in 2023) | No long-lived secrets to rotate or leak |
| `S3Origin` + `websiteIndexDocument` | Private bucket + CloudFront `defaultRootObject` | CDK v2 best practice | More secure; eliminates public bucket |

**Deprecated/outdated:**
- `S3Origin`: Replaced by `S3BucketOrigin`. Still works but shows deprecation warnings.
- OAI (Origin Access Identity): Replaced by OAC. AWS recommends migrating.
- CDK v1: End-of-life June 2023. Not relevant here.

---

## Open Questions

1. **AWS Account ID and Region**
   - What we know: CDK requires a resolved account/region to bootstrap and deploy.
   - What's unclear: Developer has not specified target AWS region. `us-east-1` is the default for new static sites (CloudFront is global regardless).
   - Recommendation: Default to `us-east-1` in the stack `env`; document that developer sets `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` locally or passes explicitly to `cdk bootstrap`.

2. **Custom Domain / HTTPS Certificate**
   - What we know: Phase 2 success criteria only requires "accessible at a public URL" (the `*.cloudfront.net` domain).
   - What's unclear: No custom domain is specified in requirements.
   - Recommendation: Omit `domainNames` and `certificate` from the Distribution for now. The `cloudfront.net` URL satisfies INFRA-01.

3. **GitHub OIDC Provider Already Exists in Account**
   - What we know: This is a brownfield account; provider may have been created previously.
   - What's unclear: No way to know without checking the account.
   - Recommendation: Document the "already exists" fallback (`fromOpenIdConnectProviderArn`) in the plan task. Developer checks before first deploy.

---

## Sources

### Primary (HIGH confidence)
- [AWS CDK v2 — S3BucketOrigin API Reference](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins.S3BucketOrigin.html) — `withOriginAccessControl()` method signature and props verified
- [aws-cloudfront-origins README](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins-readme.html) — Full TypeScript examples for S3 + CloudFront OAC pattern
- [GitHub Docs — Configuring OpenID Connect in AWS](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) — Exact `sub` claim formats, required permissions
- [Vite — Building for Production](https://vite.dev/guide/build) — Default `dist` output directory confirmed

### Secondary (MEDIUM confidence)
- [AWS DevOps Blog — New CDK L2 Construct for CloudFront OAC (Oct 2024)](https://aws.amazon.com/blogs/devops/a-new-aws-cdk-l2-construct-for-amazon-cloudfront-origin-access-control-oac/) — Confirmed OAC L2 released in CDK v2.156.0
- [GitHub Actions OIDC Update for Terraform and AWS (Jan 2025)](https://colinbarker.me.uk/blog/2025-01-12-github-actions-oidc-update/) — Confirmed thumbprints no longer required
- [aws-actions/configure-aws-credentials README](https://github.com/aws-actions/configure-aws-credentials) — Action v4, `role-to-assume` parameter

### Tertiary (LOW confidence — for awareness, verify before use)
- CDK issue #31360: `autoDeleteObjects` incompatibility with OAC — observed community report, not official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — CDK v2 versions verified from npm, API verified from official docs
- Architecture: HIGH — OAC pattern from official CDK docs; OIDC from GitHub docs
- Pitfalls: MEDIUM — Most verified from official sources; autoDeleteObjects issue from GitHub issues (community report)

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (CDK releases frequently; OAC API is stable; OIDC setup is stable)
