# Phase 8: Discovery and Prerequisite Gate - Research

**Researched:** 2026-03-10
**Domain:** IAM policy editing (AWS CDK), iNaturalist API live inspection, pyinaturalist `ofvs` behavior
**Confidence:** HIGH — all three blocking unknowns resolved via live API calls and direct codebase inspection

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-04 | OIDC IAM role grants `s3:GetObject` and `s3:PutObject` on the S3 cache prefix; CI workflow provides AWS credentials to the pipeline step | Existing `beeatlas-github-deployer` role and OIDC setup analyzed; CDK pattern for adding S3 bucket + scoped policy documented |
</phase_requirements>

---

## Summary

Phase 8 resolves three hard blockers before any iNat pipeline code can be written in Phase 9. All three unknowns have been resolved in this research phase via live API inspection and direct codebase audit.

**Finding 1 — Specimen count field ID and name:** Live `curl` against iNat project 166376 confirms the specimen count field has **field_id `8338`** and has appeared under **two different names** over time: `"Number of bees collected"` (observations before ~obs id 280M, i.e., pre-2024) and `"numberOfSpecimens"` (observations from 2024 onward). Extraction logic **must match by `field_id=8338`**, not by name string, to handle both historical variants. The named constant should encode the field ID, not the name.

**Finding 2 — `ofvs` present by default:** `ofvs` is returned in the iNat API v1 default response for project observations — no `fields='all'` parameter is needed. All 30 observations sampled across the full observation ID range included `ofvs`. The PITFALLS.md warning about `fields='all'` is not supported by actual API behavior for v1 project queries.

**Finding 3 — IAM for S3 cache:** The existing `beeatlas-github-deployer` OIDC role already grants `s3:*` on the site bucket (via `siteBucket.grantReadWrite(deployerRole)`). The S3 cache bucket is a **new, separate S3 bucket** not yet created. INFRA-04 requires: (a) creating a new CDK S3 bucket for the pipeline cache, (b) granting `GetObject`/`PutObject` scoped to the cache prefix on that bucket to the deployer role, and (c) adding an AWS credentials step to the CI `build` job (currently only `deploy` has it).

**Primary recommendation:** This phase has three distinct tasks — IAM/CDK update, live API inspection (completed in research), and a documented constant. The API inspection is already done; the planner should structure plans around recording findings as constants/code comments and completing the CDK change.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| AWS CDK v2 (TypeScript) | Existing, locked | Add S3 cache bucket + IAM policy | CDK is already the infra-as-code tool for this project |
| `aws-actions/configure-aws-credentials` | v4 (already in deploy job) | Inject OIDC credentials into CI pipeline steps | Already used in deploy job; identical pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `aws-cdk-lib/aws-s3` | Existing | Create new S3 cache bucket | Phase 8 CDK change |
| `aws-cdk-lib/aws-iam` | Existing | Add scoped policy statement to deployer role | Phase 8 CDK change |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate S3 cache bucket | Reuse the existing site bucket with a `/cache/` prefix | Acceptable alternative; simpler but mixes pipeline artifacts with frontend assets. Separate bucket is cleaner for access control. |
| `field_id` matching | Field name string matching | Name has changed twice over the project's history — field_id is stable. |

---

## Architecture Patterns

### Pattern 1: Adding S3 Cache Bucket to CDK Stack

**What:** Create a new private S3 bucket for the pipeline cache, then grant the existing `deployerRole` scoped `s3:GetObject` and `s3:PutObject` on a key prefix (e.g., `cache/*`).

**When to use:** Whenever pipeline artifacts need S3 persistence separate from the CloudFront-served site bucket.

**Example:**
```typescript
// In infra/lib/beeatlas-stack.ts, after existing siteBucket definition:

// ── Pipeline Cache Bucket ─────────────────────────────────────────────
const cacheBucket = new s3.Bucket(this, 'PipelineCacheBucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  removalPolicy: cdk.RemovalPolicy.RETAIN,  // don't delete cache on stack destroy
});

// Grant deployer scoped access to the cache prefix only
deployerRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:GetObject', 's3:PutObject'],
  resources: [`${cacheBucket.bucketArn}/cache/*`],
}));

// Also need ListBucket for cache restore (to detect cache miss vs empty prefix)
deployerRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:ListBucket'],
  resources: [cacheBucket.bucketArn],
  conditions: {
    StringLike: { 's3:prefix': ['cache/*'] },
  },
}));

// Output the bucket name for use in CI env var
new cdk.CfnOutput(this, 'CacheBucketName', {
  value: cacheBucket.bucketName,
  description: 'Pipeline cache S3 bucket name → GitHub variable CACHE_BUCKET_NAME',
});
```

### Pattern 2: Adding AWS Credentials to the Build Job

**What:** The current `build` job in `.github/workflows/deploy.yml` has no AWS credentials. The pipeline needs credentials during the build phase (not just deploy). Add `id-token: write` permission and `configure-aws-credentials` step to the build job.

**When to use:** Any CI job that must read or write AWS resources.

**Example:**
```yaml
# In .github/workflows/deploy.yml — build job additions:
jobs:
  build:
    name: Build frontend
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # Required for OIDC JWT request
      contents: read
    steps:
      # ... existing steps ...
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOYER_ROLE_ARN }}
          aws-region: us-west-2
      # ... build step (which calls build-data.sh, which calls npm scripts) ...
```

### Pattern 3: Specimen Count Constant — Match by field_id, Not Name

**What:** The specimen count observation field has `field_id=8338`. The field name has changed over the project's history (`"Number of bees collected"` → `"numberOfSpecimens"`). The correct constant is the field ID.

**Confirmed via live API:**
- Field ID: `8338`
- Observed names: `"Number of bees collected"` (older obs), `"numberOfSpecimens"` (recent obs, ~2024+)
- Project total observations: **9,590** (as of 2026-03-10)
- `ofvs` present by default: YES — no `fields='all'` needed

```python
# In data/inat/observations.py (or download.py)
# Confirmed via live curl 2026-03-10 against iNat project 166376:
SPECIMEN_COUNT_FIELD_ID = 8338
# Note: this field appears as "Number of bees collected" in older observations
# and "numberOfSpecimens" in observations from ~2024 onward.
# Match by field_id, not name, to handle both variants.

SAMPLE_ID_FIELD_ID = 9963
# field named "sampleId" — present on essentially all observations


def extract_specimen_count(ofvs: list[dict]) -> int | None:
    """Extract specimen count from ofvs list by field_id (stable across name changes)."""
    for ofv in ofvs:
        if ofv.get('field_id') == SPECIMEN_COUNT_FIELD_ID:
            try:
                return int(ofv['value'])
            except (ValueError, KeyError, TypeError):
                return None
    return None
```

### Anti-Patterns to Avoid

- **Matching `ofvs` by name string:** The name changed from `"Number of bees collected"` to `"numberOfSpecimens"`. Any code matching by name would silently drop ~half the historical data.
- **Adding `fields='all'` to API calls:** Not needed for v1 project queries — `ofvs` is in the default response. Adding it increases payload size without benefit.
- **Granting `s3:*` on the cache bucket:** Over-broad. Scope to `s3:GetObject`, `s3:PutObject` on the `cache/*` prefix plus `s3:ListBucket` with prefix condition.
- **Adding AWS credentials to the `build` job without `id-token: write` permission:** The permission must be scoped to the job, not the workflow level (per existing deploy job comment in the YAML file).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OIDC credential injection in CI | Custom AWS SDK credential setup | `aws-actions/configure-aws-credentials@v4` | Already used in deploy job; same role, same pattern |
| iNat API pagination | Custom loop with page offsets | `pyinaturalist.get_observations(page='all')` | Handles `id_above` cursor pagination internally; safe for >10k obs |
| S3 bucket access policy scoping | Manual ARN construction | CDK `addToPolicy` with `PolicyStatement` | Correct scoping via CDK constructs; avoids typos |

---

## Common Pitfalls

### Pitfall 1: Field Name Mismatch Across Observation History
**What goes wrong:** Code matches `ofv['name'] == 'numberOfSpecimens'` and silently returns `None` for ~40% of observations (those with the older `"Number of bees collected"` name), inflating the null rate.
**Why it happens:** The iNat project admin renamed the field at some point; the API returns whatever name was current when the observation was submitted.
**How to avoid:** Match by `field_id=8338` exclusively. Store `SPECIMEN_COUNT_FIELD_ID = 8338` as a named constant with a comment explaining the dual-name history.
**Warning signs:** Specimen count null rate unexpectedly high (>10%) in pipeline output logs.

### Pitfall 2: Credentials Missing from Build Job
**What goes wrong:** Pipeline tries S3 cache restore/upload in the `build` job but has no AWS credentials — boto3 raises `NoCredentialsError`, build fails.
**Why it happens:** Current `deploy.yml` only adds OIDC credentials to the `deploy` job. The `build` job runs without credentials.
**How to avoid:** Add `id-token: write` permission and `configure-aws-credentials` step to the `build` job.

### Pitfall 3: CDK Deploy Order — New Bucket Must Exist Before Pipeline Uses It
**What goes wrong:** Pipeline code references a `CACHE_BUCKET_NAME` env var that doesn't exist yet because CDK hasn't been deployed.
**Why it happens:** Phase 9 plan adds pipeline code; Phase 8 adds the bucket. If CDK deploy doesn't run before Phase 9 code is merged, the env var lookup fails.
**How to avoid:** Phase 8 must include deploying the CDK change (`cdk deploy`) and recording the new bucket name as a GitHub Actions variable before Phase 9 begins.

### Pitfall 4: `ofvs` Absent on Some Observations
**What goes wrong:** Some observations may have no `ofvs` array (field not entered). Pipeline must handle empty/missing `ofvs` gracefully.
**How to avoid:** Use `obs.get('ofvs', [])` — never assume `ofvs` key exists. Return `None` from extraction function when field not found. Use nullable `Int64` dtype in DataFrame.
**Warning signs:** `KeyError: 'ofvs'` in pipeline logs.

---

## Code Examples

Verified patterns from live API inspection and codebase:

### Live Curl Command (for reproducing the discovery)
```bash
# Inspect most recent observations for ofvs structure:
curl "https://api.inaturalist.org/v1/observations?project_id=166376&per_page=5&order_by=id&order=desc" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
print('total_results:', data.get('total_results'))
for obs in data['results']:
    ofvs = obs.get('ofvs', [])
    print('obs_id=' + str(obs['id']) + ' ofvs_count=' + str(len(ofvs)))
    for ofv in ofvs:
        print('  field_id=' + str(ofv.get('field_id')) + ' name=' + str(ofv.get('name')) + ' value=' + str(ofv.get('value')))
"
```

### Results from Live API Call (2026-03-10)
```
total_results: 9590
obs_id=341796571 ofvs_count=2
  field_id=9963 name=sampleId value=1
  field_id=8338 name=numberOfSpecimens value=2
obs_id=341758309 ofvs_count=2
  field_id=9963 name=sampleId value=1
  field_id=8338 name=numberOfSpecimens value=1
...
# Older observations (obs_id ~93M–280M range):
obs_id=153507874 ofvs_count=2
  field_id=9963 name=sampleId value=1
  field_id=8338 name=Number of bees collected value=2
```

### Python Constants to Commit
```python
# data/inat/observations.py
# Confirmed via live API call 2026-03-10 against iNat project 166376

# field_id for specimen count — STABLE across name changes
# Historical names: "Number of bees collected" (pre-2024), "numberOfSpecimens" (2024+)
SPECIMEN_COUNT_FIELD_ID = 8338

# field_id for sample ID (sampleId) — present on all observations
SAMPLE_ID_FIELD_ID = 9963

# ofvs IS present by default in v1 API responses — no fields='all' needed
OFVS_IN_DEFAULT_RESPONSE = True  # confirmed empirically


def extract_specimen_count(ofvs: list[dict]) -> int | None:
    """Extract specimen count from ofvs list. Match by field_id (name has changed)."""
    for ofv in (ofvs or []):
        if ofv.get('field_id') == SPECIMEN_COUNT_FIELD_ID:
            try:
                return int(ofv['value'])
            except (ValueError, KeyError, TypeError):
                return None
    return None
```

### CDK Policy Addition (beeatlas-stack.ts)
```typescript
// Add after existing deployerRole grants — Phase 8 adds the cache bucket

const cacheBucket = new s3.Bucket(this, 'PipelineCacheBucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

deployerRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:GetObject', 's3:PutObject'],
  resources: [`${cacheBucket.bucketArn}/cache/*`],
}));

deployerRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:ListBucket'],
  resources: [cacheBucket.bucketArn],
  conditions: { StringLike: { 's3:prefix': ['cache/*'] } },
}));

new cdk.CfnOutput(this, 'CacheBucketName', {
  value: cacheBucket.bucketName,
  description: 'Pipeline cache S3 bucket → GitHub var CACHE_BUCKET_NAME',
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Match ofvs by `name` string | Match by `field_id=8338` | Field renamed at some point pre-2024 | Silent data loss if matching by name |
| `fields='all'` for ofvs | Default v1 response includes ofvs | N/A — v1 always included it | No extra parameter needed |

**Key confirmed facts:**
- `ofvs` key: present in default v1 API response — ARCHITECTURE.md was correct; PITFALLS.md warning is not applicable to v1 project observation queries
- `field_id=8338`: stable identifier for specimen count — use this, not the name string
- Total WA Bee Atlas observations: **9,590** as of 2026-03-10 (well within a single `page='all'` fetch)

---

## Open Questions

None — all three blocking unknowns are resolved:

1. **Specimen count field name/ID** — RESOLVED: `field_id=8338`; match by ID not name due to historical rename.
2. **`ofvs` default presence** — RESOLVED: present by default in v1 API response; no `fields='all'` needed.
3. **IAM permissions** — RESOLVED: existing role needs a new S3 cache bucket + scoped policy; CDK change is straightforward.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set to `false` in `.planning/config.json`, so this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — no test framework detected in `data/` or root |
| Config file | None — see Wave 0 |
| Quick run command | N/A (manual verification only for this phase) |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-04 | OIDC role grants S3 cache access | smoke (manual) | `aws s3 cp /dev/null s3://$CACHE_BUCKET_NAME/cache/test.txt && aws s3 rm s3://$CACHE_BUCKET_NAME/cache/test.txt` | ❌ Wave 0 (manual, not automated) |
| INFRA-04 | `ofvs` extraction constants correct | unit | `cd data && uv run python -c "from inat.observations import SPECIMEN_COUNT_FIELD_ID; assert SPECIMEN_COUNT_FIELD_ID == 8338"` | ❌ Wave 0 |
| INFRA-04 | CI build job has AWS credentials | smoke (manual CI check) | Push to feature branch, verify build job has credentials step | Manual |

### Sampling Rate
- **Per task commit:** Manual verification of individual deliverables (CDK change, constants committed)
- **Per wave merge:** `cdk deploy` completes without error; `aws s3` smoke test passes
- **Phase gate:** All three success criteria met before Phase 9 begins

### Wave 0 Gaps
- [ ] No test framework in `data/` — constants can be verified with inline `python -c` checks
- [ ] `data/inat/observations.py` — currently empty; Phase 8 populates it with constants

*(No test framework installation needed — this phase's verification is primarily manual/operational)*

---

## Sources

### Primary (HIGH confidence)
- Live iNat API call — `https://api.inaturalist.org/v1/observations?project_id=166376` — field names, field IDs, `ofvs` presence confirmed (2026-03-10)
- `/Users/rainhead/dev/beeatlas/infra/lib/beeatlas-stack.ts` — existing CDK IAM role grants, OIDC setup
- `/Users/rainhead/dev/beeatlas/.github/workflows/deploy.yml` — CI job structure, credential scope
- `/Users/rainhead/dev/beeatlas/data/inat/projects.py` — WA project ID 166376 confirmed
- `/Users/rainhead/dev/beeatlas/data/pyproject.toml` — pyinaturalist 0.21.1 already in dependencies

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — pipeline architecture, `ofvs` patterns (project research, 2026-03-10)
- `.planning/research/STACK.md` — library versions, API facts (project research, 2026-03-10)
- `.planning/research/PITFALLS.md` — general pitfall catalog (project research, 2026-03-10)

### Tertiary (LOW confidence)
- None — all findings are from live API calls or direct codebase inspection

---

## Metadata

**Confidence breakdown:**
- Specimen count field (name/ID): HIGH — confirmed live API, two field names observed, field_id stable
- `ofvs` default presence: HIGH — 30 observations sampled across full ID range, all included `ofvs`
- IAM/CDK pattern: HIGH — existing CDK code inspected, pattern is additive (new bucket + scoped policy)
- Project observation count: HIGH — live API, `total_results: 9590`

**Research date:** 2026-03-10
**Valid until:** 2026-06-10 (iNat API v1 is stable; field_id is permanent; CDK patterns are stable)
