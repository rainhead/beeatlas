# Phase 6: Complete INFRA-03 Deployment - Research

**Researched:** 2026-02-22
**Domain:** AWS CDK v2 deployment, GitHub Actions Variables, cross-region CDK stacks
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-03 | GitHub Actions workflow builds frontend on all pushes; deploys to S3 and invalidates CloudFront on push to `main` | All CDK code, workflow file, and IAM role are already written. Gap is execution: `cdk bootstrap` + `cdk deploy` not run; GitHub Actions Variables not set; live site never verified. |
</phase_requirements>

---

## Summary

This phase is almost entirely a human-execution gap, not a code-writing gap. The CDK infrastructure code (S3, CloudFront, OIDC provider, deployer role) was written in Phase 2 and extended in a subsequent commit to add custom domains (beeatlas.net and beeatlas.com with Route 53 and ACM). The GitHub Actions workflow (`.github/workflows/deploy.yml`) was also written in Phase 2. What never happened was the actual execution: `cdk bootstrap`, `cdk deploy`, and setting the three GitHub Actions Variables the workflow needs.

There are, however, several concrete discrepancies between the current code and the Phase 2 plan documentation that need to be understood before planning execution steps. The most important: the workflow now uses `vars.*` (GitHub Actions Variables) but the Phase 2 SUMMARY documents the setup as creating Secrets. These are different settings tabs in GitHub and the SUMMARY is wrong — the audit identified this as a documentation error to correct. The workflow file is correct; the SUMMARY is not.

A second issue: the current `npm run build` command in the workflow invokes `build-data.sh`, which makes a live HTTP POST to ecdysis.org every time CI runs. The v1.0 audit flagged this as a tech debt risk (if ecdysis.org is down, every CI build fails), but the success criteria for this phase do not require fixing it — only verifying the deploy flow works.

The CDK stack now spans two regions (GlobalStack in us-east-1 for ACM certificates, BeeAtlasStack in us-west-2 for S3/CloudFront) and uses a custom bootstrap qualifier (`beeatlas`). This means `cdk bootstrap` must be run for both regions with the `--qualifier beeatlas` flag before `cdk deploy` will succeed. This is the highest-risk execution detail.

**Primary recommendation:** This phase needs one plan: a human-checkpoint plan that walks through `cdk bootstrap` (both regions with custom qualifier), `cdk deploy`, setting GitHub Actions Variables (not Secrets), pushing to main, verifying the GitHub Actions deploy job passes, visiting the CloudFront or custom domain URL, and correcting the SUMMARY documentation.

---

## Current Code State (Codebase Audit)

This section documents what already exists in the repo, so planning does not re-create what is already done.

### CDK Stack Structure (written, not deployed)

**Two stacks, two regions, custom bootstrap qualifier:**

```
infra/
├── bin/infra.ts          — App entry: instantiates GlobalStack (us-east-1) and BeeAtlasStack (us-west-2)
├── lib/global-stack.ts   — Route 53 hosted zones (beeatlas.net, beeatlas.com) + ACM certs
├── lib/beeatlas-stack.ts — S3 bucket, CloudFront (main + redirect), OIDC provider, deployer role
├── cdk.json              — bootstrapQualifier: "beeatlas" in context block
└── cdk.out/              — Synth output already present (GlobalStack + BeeAtlasStack templates)
```

The `cdk.out/` directory exists, meaning `cdk synth` has been run locally and the templates are valid. Both `GlobalStack.template.json` and `BeeAtlasStack.template.json` are present.

**Custom bootstrap qualifier in `cdk.json`:**
```json
{
  "context": {
    "@aws-cdk/core:bootstrapQualifier": "beeatlas"
  }
}
```
This means bootstrap must use `--qualifier beeatlas` in both regions.

**CDK Outputs defined in `beeatlas-stack.ts`:**
- `BeeAtlasStack.BucketName` → value for `S3_BUCKET_NAME` GitHub Variable
- `BeeAtlasStack.DistributionId` → value for `CF_DISTRIBUTION_ID` GitHub Variable
- `BeeAtlasStack.DistributionDomain` → CloudFront domain for site verification
- `BeeAtlasStack.DeployerRoleArn` → value for `AWS_DEPLOYER_ROLE_ARN` GitHub Variable
- `GlobalStack.NetNameServers` → nameservers to set at domain registrar (for beeatlas.net)
- `GlobalStack.ComNameServers` → nameservers to set at domain registrar (for beeatlas.com)

Note: custom domains (beeatlas.net, beeatlas.com) require registrar nameserver updates AND DNS propagation before HTTPS works on the custom domain. The CloudFront `*.cloudfront.net` URL works immediately. Phase 6 success criteria only require the CloudFront URL, not the custom domain.

### GitHub Actions Workflow (written, awaiting Variables)

**Current `.github/workflows/deploy.yml` state:**
```yaml
name: Build and Deploy

on:
  push:
    branches: ['**']

jobs:
  build:
    name: Build frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5       # needed for build-data.sh (Python/uv)
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build                 # runs build-data.sh + npm run build --workspace=frontend

  deploy:
    name: Deploy to S3 + CloudFront
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # Required for OIDC JWT request — must be on THIS job
      contents: read
    environment: production               # GitHub Actions environment
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOYER_ROLE_ARN }}
          aws-region: us-west-2           # BeeAtlasStack region
      - name: Sync to S3
        run: aws s3 sync frontend/dist/ s3://${{ vars.S3_BUCKET_NAME }} --delete
      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ vars.CF_DISTRIBUTION_ID }} \
            --paths "/*"
```

**Key observations about the current workflow:**

1. Uses `vars.*` (GitHub Actions Variables), NOT `secrets.*`. The SUMMARY documented this as "Secrets" — that was wrong. Variables must be set at: GitHub → rainhead/beeatlas → Settings → **Secrets and variables → Actions → Variables tab** (not the Secrets tab).

2. Uses `environment: production` on the deploy job. GitHub Actions Variables can be scoped to an environment or to the repository. The `vars.*` context resolves environment-scoped variables first. Variables must be set either at the repository level OR in the `production` environment. The simplest path: set as repository-level variables (they will be visible in the `production` environment via `vars.*`).

3. Uses `npm run build` (not `npm run build --workspace=frontend`). The root `package.json` has a `build` script (`npm run build:data && npm run build --workspace=frontend`), so this works — but it makes a live HTTP download from ecdysis.org on every CI run via `build-data.sh`. If ecdysis.org is unavailable, CI fails. This is an acknowledged tech debt item but is out of scope for Phase 6.

4. The `aws-region: us-west-2` is correct — BeeAtlasStack (which owns the S3 bucket and CloudFront) deploys to us-west-2.

### OIDC Subject Claim and `environment: production`

The OIDC subject claim in the trust policy is `repo:rainhead/beeatlas:*` (StringLike wildcard). This matches any ref including `refs/heads/main`. The `environment: production` in the workflow affects the OIDC subject claim format: with an environment, the `sub` claim becomes `repo:rainhead/beeatlas:environment:production`. The wildcard `*` in the trust policy covers both `refs/heads/main` and `environment:production`, so the existing trust policy is compatible with the `environment: production` workflow declaration.

---

## Standard Stack

No new libraries needed. All tools are already installed.

### CDK Deployment Tools (already in infra/)

| Tool | Version | Purpose |
|------|---------|---------|
| `aws-cdk-lib` | `^2.238.0` | CDK constructs (S3, CloudFront, IAM, ACM, Route 53) |
| `aws-cdk` (CLI) | `^2.1106.1` | `cdk bootstrap` and `cdk deploy` commands |
| `typescript` | `~5.7.0` | CDK stack language |
| `ts-node` | `^10.9.2` | Runs `bin/infra.ts` directly |

### AWS CLI (available in GitHub Actions runners)

The GitHub Actions `ubuntu-latest` runner includes AWS CLI v2. No installation step needed.

---

## Architecture Patterns

### Cross-Region CDK Bootstrap Pattern

The CDK app spans two regions. `cdk bootstrap` must be run for each region where a stack is deployed.

**Critical:** The `cdk.json` uses custom qualifier `"beeatlas"`. All bootstrap commands must include `--qualifier beeatlas`.

```bash
# Bootstrap us-east-1 (GlobalStack: ACM certs + Route 53)
cd infra
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1 --qualifier beeatlas

# Bootstrap us-west-2 (BeeAtlasStack: S3 + CloudFront)
npx cdk bootstrap aws://ACCOUNT_ID/us-west-2 --qualifier beeatlas
```

Omitting `--qualifier beeatlas` will create CDK bootstrap assets under the default qualifier, and `cdk deploy` will fail because the stack references the `beeatlas`-qualified bootstrap resources.

### CDK Deploy Order

The two stacks have a cross-region dependency (GlobalStack → BeeAtlasStack via ACM certificate). CDK handles this automatically with `crossRegionReferences: true`, but deploy may need to be run twice if the first run times out waiting for certificate DNS validation.

```bash
cd infra
npx cdk deploy --all
```

If ACM certificate DNS validation is pending (requires registrar nameserver update), the deploy will block waiting for it. To deploy without the custom domain dependency, there is currently no easy way to selectively skip GlobalStack. However, CDK has a `--exclusively` flag to deploy specific stacks — but since BeeAtlasStack references GlobalStack exports, deploying BeeAtlasStack alone will fail if GlobalStack hasn't deployed first.

**Practical implication for planning:** The human will need to either (a) update domain registrar nameservers first and wait for DNS propagation, then deploy; or (b) understand that ACM certificate DNS validation happens automatically if the Route 53 hosted zones are created first (CDK will add the CNAME records to the hosted zones as part of GlobalStack deployment — no registrar update needed for CDK to create the records, only for public DNS resolution to use the Route 53 zones).

**Correct sequence:**
1. Deploy GlobalStack first (creates Route 53 hosted zones + adds CNAME validation records)
2. CDK will auto-validate ACM certs via the Route 53 CNAME records it created — but this only works if Route 53 is the authoritative DNS (requires registrar nameserver update)
3. If nameservers are NOT updated yet, ACM cert stays in `PENDING_VALIDATION` state and `cdk deploy --all` will eventually timeout (default 30 min)

**Fastest path for success criteria:** Phase 6 success criteria require only the CloudFront URL to serve the site — NOT the custom domain. The custom domain requires DNS propagation which can take hours. The planner should structure tasks so the CDK deploy + GitHub Actions verification can succeed even if DNS is not yet propagated. The CloudFront `*.cloudfront.net` URL from `BeeAtlasStack.DistributionDomain` output will work immediately.

### GitHub Actions Variables vs Secrets

`vars.*` and `secrets.*` are distinct GitHub Actions contexts:
- `vars.*` — GitHub Actions Variables (plain text, visible in logs if you add a print step, suitable for non-sensitive config values like ARNs and bucket names)
- `secrets.*` — GitHub Actions Secrets (masked in logs, suitable for passwords, API keys)

The workflow uses `vars.*`, which is correct for these values (ARNs and bucket names are not sensitive). The SUMMARY instructions documented them as "Secrets" which is wrong. The correct UI path to set Variables:

> GitHub → rainhead/beeatlas → Settings → Secrets and variables → Actions → **Variables** tab → New repository variable

Variables to set (after `cdk deploy` outputs are available):
- `AWS_DEPLOYER_ROLE_ARN` = value of `BeeAtlasStack.DeployerRoleArn`
- `S3_BUCKET_NAME` = value of `BeeAtlasStack.BucketName`
- `CF_DISTRIBUTION_ID` = value of `BeeAtlasStack.DistributionId`

Note: These should be set as **repository** variables (not environment-scoped), so they are visible via `vars.*` in all jobs including those running in the `production` environment.

### OIDC Provider "Already Exists" Fallback

If the GitHub OIDC provider (`token.actions.githubusercontent.com`) was previously created in the AWS account, `cdk deploy` will fail with:

```
CREATE_FAILED | AWS::IAM::OIDCProvider | GitHubOidcProvider
Provider with url https://token.actions.githubusercontent.com already exists in this account
```

The fallback is already documented in a code comment in `beeatlas-stack.ts`. Replace:
```typescript
const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
  url: 'https://token.actions.githubusercontent.com',
  clientIds: ['sts.amazonaws.com'],
});
```
With:
```typescript
const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
  this, 'GitHubOidcProvider',
  `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`
);
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S3 bucket policy for CloudFront OAC | Manual `BucketPolicy` JSON | `S3BucketOrigin.withOriginAccessControl()` (already in stack) | Auto-generates OAC + SigV4 bucket policy |
| OIDC JWT validation | Custom Lambda | AWS IAM OIDC provider (already in stack) | Native IAM handles cryptographic verification |
| CloudFront cache busting | Per-file invalidation paths | `--paths "/*"` wildcard (already in workflow) | One API call = one free invalidation unit |
| Credentials in workflow | `aws-access-key-id` / `aws-secret-access-key` | `aws-actions/configure-aws-credentials@v4` with `role-to-assume` (already in workflow) | Short-lived tokens, no stored secrets |

All of these are already implemented correctly. This phase does not require new code.

---

## Common Pitfalls

### Pitfall 1: Missing `--qualifier beeatlas` on Bootstrap
**What goes wrong:** `cdk deploy` fails with asset/role ARN resolution errors even after bootstrap appears to succeed.
**Why it happens:** `cdk.json` sets `bootstrapQualifier: "beeatlas"`, so the stack templates reference CDK bootstrap resources with the `beeatlas` qualifier. If bootstrap was run without `--qualifier beeatlas`, those resources don't exist.
**How to avoid:** Always use `--qualifier beeatlas` in all bootstrap commands for this project.
**Warning signs:** Error like `arn:aws:iam::ACCOUNT:role/cdk-beeatlas-cfn-exec-role-ACCOUNT-REGION` not found.

### Pitfall 2: Setting Secrets Instead of Variables
**What goes wrong:** `vars.AWS_DEPLOYER_ROLE_ARN` expands to empty string; `role-to-assume: ` causes `configure-aws-credentials` step to fail with no useful error.
**Why it happens:** The Phase 2 SUMMARY incorrectly documents these as Secrets. Secrets are accessible via `secrets.*`, not `vars.*`.
**How to avoid:** Use the **Variables** tab (not the Secrets tab) at Settings → Secrets and variables → Actions.
**Warning signs:** `configure-aws-credentials` fails; check the `role-to-assume` value in the step summary — if it shows empty string, the variable wasn't found.

### Pitfall 3: ACM Certificate DNS Validation Timeout
**What goes wrong:** `cdk deploy --all` hangs waiting for ACM certificate to validate; times out after 30 minutes.
**Why it happens:** ACM uses DNS validation. CDK auto-creates the CNAME validation record in Route 53, but Route 53 only becomes authoritative if the domain registrar's nameservers point to it. Without that, the CNAME never resolves publicly and ACM validation never completes.
**How to avoid:** Either (a) update registrar nameservers before deploying, or (b) accept that the first deploy will timeout on ACM and re-run after DNS propagates. The S3 bucket, CloudFront distribution, OIDC provider, and deployer role will all be created regardless — only the custom domain HTTPS cert will be pending.
**Warning signs:** CloudFormation event stream shows `CREATE_IN_PROGRESS` on `AWS::CertificateManager::Certificate` for more than 5 minutes.
**Mitigation:** The phase success criteria require only the CloudFront `*.cloudfront.net` URL to serve the site — NOT the custom domain. Even if ACM cert stays pending, the plan can still be marked complete.

### Pitfall 4: OIDC Provider Already Exists
**What goes wrong:** `cdk deploy` fails with `Provider with url https://token.actions.githubusercontent.com already exists in this account`.
**Why it happens:** One GitHub OIDC provider per AWS account per URL.
**How to avoid:** The fallback is documented in a code comment in `beeatlas-stack.ts`. Use `fromOpenIdConnectProviderArn` if the provider exists.
**Warning signs:** `CREATE_FAILED` on `GitHubOidcProvider` resource.

### Pitfall 5: Forgetting `npm run build` Downloads Live Data
**What goes wrong:** GitHub Actions build job fails because ecdysis.org is unreachable.
**Why it happens:** `npm run build` calls `build-data.sh` which downloads data from ecdysis.org. This is a live HTTP request in CI.
**How to avoid:** This is known tech debt. For Phase 6 purposes, if ecdysis.org is up (which it normally is), the build will succeed. If needed, the workaround is to commit the current `ecdysis.parquet` to the repo (it already exists in `frontend/src/assets/`) so the build doesn't need to re-download.
**Note:** The parquet file is already committed (`frontend/src/assets/ecdysis.parquet`); `build-data.sh` overwrites it on every build. This means if ecdysis.org is down, the parquet in the repo is stale but the build will fail. The planner should flag this as a known issue but out of scope for Phase 6.

### Pitfall 6: `environment: production` Scoping of Variables
**What goes wrong:** Variables set at repository level are not visible if the deploy job uses `environment: production` and there are environment-level variable overrides.
**Why it happens:** GitHub Actions resolves `vars.*` with environment-scoped variables taking priority over repository-scoped variables. If no variables are set in the `production` environment, `vars.*` falls back to repository-level variables — this is the expected behavior.
**How to avoid:** Set variables at repository level (not under a specific environment). Do not create a `production` environment in GitHub unless needed for required reviewers or other gates.
**Warning signs:** `vars.*` evaluates to empty string even though repository-level variables are set.

---

## Code Examples

### Bootstrap Commands (with custom qualifier)

```bash
# Run from infra/ directory
# Both regions must be bootstrapped with the custom qualifier

npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1 \
  --qualifier beeatlas \
  --profile your-aws-profile

npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-west-2 \
  --qualifier beeatlas \
  --profile your-aws-profile
```

### Deploy Command

```bash
# Run from infra/ directory
npx cdk deploy --all --profile your-aws-profile

# Or deploy stacks individually (GlobalStack must come first):
npx cdk deploy GlobalStack --profile your-aws-profile
npx cdk deploy BeeAtlasStack --profile your-aws-profile
```

### Reading CDK Outputs

After deploy, outputs are printed to the terminal:
```
Outputs:
GlobalStack.NetNameServers = ns-XXXX.awsdns-XX.org, ns-XXXX.awsdns-XX.co.uk, ...
GlobalStack.ComNameServers = ns-XXXX.awsdns-XX.net, ns-XXXX.awsdns-XX.com, ...
BeeAtlasStack.BucketName = beeatlasstack-sitebucket-XXXXXXXXXXXX
BeeAtlasStack.DistributionId = EXXXXXXXXXXXX
BeeAtlasStack.DistributionDomain = dXXXXXXXXXXXXX.cloudfront.net
BeeAtlasStack.DeployerRoleArn = arn:aws:iam::ACCOUNT:role/beeatlas-github-deployer
```

### Setting GitHub Actions Variables (UI path)

> https://github.com/rainhead/beeatlas/settings/variables/actions

Click "New repository variable" for each:
- Name: `AWS_DEPLOYER_ROLE_ARN` / Value: from `BeeAtlasStack.DeployerRoleArn`
- Name: `S3_BUCKET_NAME` / Value: from `BeeAtlasStack.BucketName`
- Name: `CF_DISTRIBUTION_ID` / Value: from `BeeAtlasStack.DistributionId`

### Verifying OIDC Token Assumption (checking workflow logs)

After pushing to main, in the Actions tab → Build and Deploy workflow → deploy job, look for:
```
Assuming role arn:aws:iam::ACCOUNT:role/beeatlas-github-deployer
Successfully assumed role.
```

---

## State of the Art

| Old Approach | Current Approach | Impact on This Phase |
|--------------|------------------|---------------------|
| Single-region CDK stack | Cross-region CDK (GlobalStack us-east-1 + BeeAtlasStack us-west-2) | Bootstrap required in BOTH regions |
| Default CDK bootstrap qualifier | Custom qualifier `beeatlas` | All bootstrap commands need `--qualifier beeatlas` |
| GitHub Actions Secrets for AWS config | GitHub Actions Variables (`vars.*`) | Use Variables tab (not Secrets tab) in GitHub settings |
| Phase 2 SUMMARY documents Secrets | Actual workflow uses Variables | SUMMARY.md correction is a success criterion |

---

## Open Questions

1. **Is the GitHub OIDC provider already in the account?**
   - What we know: The CDK stack tries to create `new iam.OpenIdConnectProvider(...)`. If it already exists in the account, deploy fails.
   - What's unclear: We don't know the AWS account state.
   - Recommendation: Plan task should document the fallback and instruct the human to use `fromOpenIdConnectProviderArn` if they see the "already exists" error.

2. **Will ACM cert DNS validation block the deploy?**
   - What we know: GlobalStack creates Route 53 hosted zones and ACM certificates. ACM auto-validation requires Route 53 to be authoritative (registrar nameserver update).
   - What's unclear: Whether the domain registrar has already been updated to point to Route 53 nameservers.
   - Recommendation: Plan for the possibility of a timeout. The CloudFront URL (success criterion 4) does not require the custom domain. Document the workaround: if deploy hangs on ACM cert, wait for DNS propagation or continue with the CloudFront URL only.

3. **Will `npm run build` in CI reliably succeed (ecdysis.org dependency)?**
   - What we know: `build-data.sh` downloads live data from ecdysis.org. If the site is down, CI fails.
   - What's unclear: How reliable ecdysis.org is in practice.
   - Recommendation: The existing `frontend/src/assets/ecdysis.parquet` is committed to the repo. If ecdysis.org is down during verification, the workaround is to temporarily skip the data download or re-run the workflow.

4. **Does `environment: production` require explicit creation in GitHub settings?**
   - What we know: The deploy job declares `environment: production`. GitHub creates environments implicitly if referenced by a workflow.
   - What's unclear: Whether implicit creation affects variable resolution.
   - Recommendation: Set variables at the repository level to avoid environment-scoping complexity. The `vars.*` context will resolve repository-level variables when no environment-level variables exist.

---

## Plan Structure Recommendation

This phase needs **one plan** with **one task type**: a `checkpoint:human-verify` gate. All code is already written. The plan is a structured set of human-executable steps.

**Plan 06-01 task structure:**
1. Task (auto): Correct documentation error in `02-02-SUMMARY.md` — change "Secrets" to "Variables" (the only code-adjacent change)
2. Task (human checkpoint): Execute CDK bootstrap (both regions, `--qualifier beeatlas`) → `cdk deploy --all` → set 3 GitHub Variables → push to main → verify workflow passes → verify CloudFront URL serves site

The documentation correction (task 1) can be automated. The deployment execution (task 2) requires a human with AWS credentials.

---

## Sources

### Primary (HIGH confidence)

- `/Users/rainhead/dev/beeatlas/infra/bin/infra.ts` — Two-stack, two-region CDK app; us-east-1 for GlobalStack, us-west-2 for BeeAtlasStack
- `/Users/rainhead/dev/beeatlas/infra/cdk.json` — `bootstrapQualifier: "beeatlas"` in context block
- `/Users/rainhead/dev/beeatlas/infra/lib/beeatlas-stack.ts` — Full stack: S3, CloudFront OAC, OIDC provider, deployer role, four CfnOutputs
- `/Users/rainhead/dev/beeatlas/infra/lib/global-stack.ts` — Route 53 hosted zones + ACM certs for beeatlas.net and beeatlas.com
- `/Users/rainhead/dev/beeatlas/.github/workflows/deploy.yml` — Current workflow using `vars.*`, `environment: production`, `npm run build`
- `/Users/rainhead/dev/beeatlas/.planning/v1.0-MILESTONE-AUDIT.md` — Authoritative gap analysis: what is actually missing vs. claimed done
- `/Users/rainhead/dev/beeatlas/.planning/phases/02-infrastructure/02-02-SUMMARY.md` — Original Phase 2 checkpoint documentation (contains the "Secrets" error)
- `/Users/rainhead/dev/beeatlas/.planning/phases/02-infrastructure/02-02-PLAN.md` — Original plan that was only partially executed

### Secondary (MEDIUM confidence)

- GitHub Actions documentation on Variables vs Secrets — `vars.*` context is for Variables; `secrets.*` is for Secrets; both resolve differently
- AWS CDK documentation on cross-region references — `crossRegionReferences: true` enables CDK to pass construct attributes between stacks in different regions
- AWS CDK documentation on bootstrap qualifier — `--qualifier` flag controls the qualifier for all CDK bootstrap resources; must match `cdk.json` context

---

## Metadata

**Confidence breakdown:**
- Current code state: HIGH — direct codebase inspection confirms all code is written and synth output exists
- Bootstrap/deploy steps: HIGH — CDK commands are stable and well-documented; custom qualifier is the main gotcha
- GitHub Variables vs Secrets: HIGH — this is a concrete GitHub UI distinction with documented API differences
- ACM cert timing: MEDIUM — depends on registrar/DNS state which is unknown; fallback is well-understood

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (CDK/GitHub Actions infrastructure is stable; only time-sensitive item is DNS propagation state)
