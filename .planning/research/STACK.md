# Technology Stack

**Project:** Washington Bee Atlas
**Researched:** 2026-02-18
**Mode:** Brownfield — existing stack, adding CDK infra + OIDC + iNat data pipeline

---

## Existing Stack (Do Not Change)

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Lit web components | 3.2.1 |
| Map library | OpenLayers | 10.7.0 |
| Map style | ol-mapbox-style | 13.2.0 |
| Parquet reader | hyparquet | 1.23.3 |
| Build tool | Vite | 6.2.3 |
| Language | TypeScript | 5.8.2 |
| Python runtime | Python | 3.14 |
| Package manager | uv | (lockfile present) |
| DataFrame library | pandas | 3.0.0 |
| Geo library | geopandas | 1.1.2 |
| Parquet writer | pyarrow | 22.0.0 |
| iNat API client | pyinaturalist | 0.20.2 |
| iNat data conversion | pyinaturalist-convert | 0.7.4 |
| OLAP queries | duckdb | 1.4.4 |
| DarwinCore archives | pydwca | 0.5.1 |
| Data validation | pydantic | 2.12.5 |

---

## New Stack: AWS CDK Infrastructure

### CDK Version and Package

Use **AWS CDK v2** (aws-cdk-lib 2.x). CDK v1 reached end-of-support in June 2023. CDK v2 bundles all AWS constructs into a single `aws-cdk-lib` package.

**Confidence:** HIGH — CDK v2 has been the only supported major version since mid-2023.

```bash
# Install CDK CLI globally
npm install -g aws-cdk

# Initialize infra directory (TypeScript)
mkdir infra && cd infra
cdk init app --language typescript

# Core CDK dependency (gets installed by init)
npm install aws-cdk-lib constructs
```

Expected CDK CLI version: `2.178.x` or later (as of Feb 2026).

### Key CDK Constructs for S3 + CloudFront Static Hosting

**Pattern: S3 bucket + CloudFront distribution + Origin Access Control (OAC)**

OAC is the current best practice over the older Origin Access Identity (OAI). OAC was introduced in 2022 and is what AWS now recommends for all new deployments. OAI is legacy.

```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

export class BeeAtlasStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket — block all public access, CloudFront provides the CDN layer
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // keep data on stack deletion
      autoDeleteObjects: false,
    });

    // CloudFront distribution using S3BucketOrigin with OAC (not OAI)
    // S3BucketOrigin.withOriginAccessControl() is the current recommended construct
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // SPA fallback: serve index.html for unknown paths
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Deploy built frontend to S3 and invalidate CloudFront cache
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('../frontend/dist')],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Output the CloudFront domain
    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
    });
  }
}
```

**Key construct notes:**

| Construct | Module | Purpose |
|-----------|--------|---------|
| `s3.Bucket` | `aws-cdk-lib/aws-s3` | Site bucket, private, no public access |
| `cloudfront.Distribution` | `aws-cdk-lib/aws-cloudfront` | CDN distribution (L2 construct) |
| `origins.S3BucketOrigin.withOriginAccessControl()` | `aws-cdk-lib/aws-cloudfront-origins` | OAC-based origin — use this, not `S3Origin` (deprecated) |
| `s3deploy.BucketDeployment` | `aws-cdk-lib/aws-s3-deployment` | Upload dist/ to bucket + CloudFront cache invalidation |

**Note on S3Origin vs S3BucketOrigin:** `S3Origin` from `aws-cloudfront-origins` is deprecated as of CDK v2 in favor of `S3BucketOrigin`. The new construct auto-creates the OAC and the required bucket policy. Do not use `S3Origin` for new deployments.

**Note on Parquet data files:** The data Parquet files (downloaded and processed separately from the frontend build) should also live in this bucket, possibly in a `data/` prefix. The `BucketDeployment` construct can be used for these too, or you can sync via `aws s3 sync` in the pipeline. For large files that change infrequently, direct `aws s3 sync` in the GitHub Actions workflow is simpler than a second BucketDeployment.

### Separate Data Bucket vs. Same Bucket

For this project: **use one bucket** for both the static site and the Parquet data files. The site is public read via CloudFront. There is no server-side auth requirement. The frontend reads Parquet directly from CloudFront URLs, so everything lives behind the same distribution. Keep data files under `data/` prefix in the bucket.

Cache policy for data files should differ from the HTML/JS assets — Parquet files can have longer TTL once generated, while `index.html` should have `Cache-Control: no-cache` to ensure deployments propagate.

```typescript
// Separate cache behavior for data files
additionalBehaviors: {
  '/data/*': {
    origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, // long TTL fine for parquet
    compress: true,
  },
},
```

---

## New Stack: GitHub Actions OIDC to AWS

### Why OIDC

OIDC eliminates the need to store long-lived AWS access keys as GitHub secrets. GitHub Actions gets a short-lived JWT; AWS validates it against an IAM role trust policy. This is the AWS-recommended pattern for CI/CD as of 2022 and forward.

**Confidence:** HIGH — AWS and GitHub both document this as the recommended approach.

### Setup: Two Parts

**Part 1: CDK (one-time infra setup)**

Create the OIDC provider and IAM role in CDK. This is infrastructure-as-code alongside the bucket/distribution.

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';

// Add to BeeAtlasStack constructor:

// OIDC Provider for GitHub Actions (one per AWS account, not per repo)
// If it already exists in the account, import instead of creating:
const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOIDCProvider', {
  url: 'https://token.actions.githubusercontent.com',
  clientIds: ['sts.amazonaws.com'],
  // Thumbprint list — GitHub rotates these; CDK fetches current on synth
  // Leave thumbprints empty to let CDK auto-fetch, or hardcode known values
});

// IAM role that GitHub Actions can assume
const deployRole = new iam.Role(this, 'GitHubActionsDeployRole', {
  assumedBy: new iam.WebIdentityPrincipal(
    githubProvider.openIdConnectProviderArn,
    {
      StringEquals: {
        // Restrict to your specific repo and branch
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        'token.actions.githubusercontent.com:sub':
          'repo:rainhead/beeatlas:ref:refs/heads/main',
      },
    }
  ),
  description: 'Role assumed by GitHub Actions for beeatlas deployment',
});

// Grant permissions needed for deployment
siteBucket.grantReadWrite(deployRole);
distribution.grantCreateInvalidation(deployRole);

// If using aws s3 sync directly (not BucketDeployment), also need:
deployRole.addToPolicy(new iam.PolicyStatement({
  actions: ['s3:ListBucket'],
  resources: [siteBucket.bucketArn],
}));
```

**Trust policy condition options:**

| Condition | Value | Meaning |
|-----------|-------|---------|
| `StringEquals sub` | `repo:owner/repo:ref:refs/heads/main` | Only main branch |
| `StringEquals sub` | `repo:owner/repo:environment:production` | Only production environment |
| `StringLike sub` | `repo:owner/repo:*` | Any branch/event in repo |

Use `StringEquals` with a specific branch or environment for production deployments. Do not use `StringLike` with `*` — that allows any branch to deploy.

**Part 2: GitHub Actions Workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write   # Required for OIDC JWT request
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/GitHubActionsDeployRole
          aws-region: us-west-2  # or your chosen region

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install and build frontend
        run: |
          npm ci
          npm run build --workspace=frontend

      - name: Deploy to S3 + invalidate CloudFront
        run: |
          aws s3 sync frontend/dist/ s3://${{ vars.S3_BUCKET_NAME }}/ \
            --delete \
            --cache-control "no-cache" \
            --exclude "data/*"
          aws cloudfront create-invalidation \
            --distribution-id ${{ vars.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

**Required GitHub repository variables (not secrets):**
- `AWS_ACCOUNT_ID` — your 12-digit AWS account number
- `S3_BUCKET_NAME` — from CDK stack output
- `CLOUDFRONT_DISTRIBUTION_ID` — from CDK stack output

No AWS keys stored as secrets. The `aws-actions/configure-aws-credentials@v4` action handles the OIDC exchange automatically when `role-to-assume` is provided.

**Action versions as of 2026:**
- `actions/checkout@v4` — current stable
- `actions/setup-node@v4` — current stable
- `aws-actions/configure-aws-credentials@v4` — current stable

### IAM Minimum Permissions

The deploy role needs only:

| Permission | Resource | Why |
|------------|----------|-----|
| `s3:PutObject`, `s3:DeleteObject` | bucket ARN + `/*` | Upload/sync site files |
| `s3:ListBucket` | bucket ARN | `aws s3 sync --delete` |
| `s3:GetObject` | bucket ARN + `/*` | Sync comparison |
| `cloudfront:CreateInvalidation` | distribution ARN | Cache bust after deploy |

Do not grant `s3:*` or `AdministratorAccess`. The CDK `grantReadWrite()` + `grantCreateInvalidation()` methods generate the minimum needed policies.

---

## New Stack: pyinaturalist Data Integration

### Version in Use

`pyinaturalist==0.20.2` and `pyinaturalist-convert==0.7.4` are already installed.

**Confidence:** HIGH — read directly from installed package source.

### What the Project Needs

The Washington Bee Atlas project needs iNaturalist observations of **host plants** for bees in Washington State. The existing code in `data/inat/projects.py` identifies Washington Bee Atlas project ID `166376`. The Makefile shows a V2 API field spec for individual observation fetches.

### Recommended Approach: Project-scoped Search via V1 API

For the bee atlas use case — all observations in the WA Bee Atlas project — use `get_observations` with `project_id` and `page='all'` for automatic ID-range pagination.

**Confidence:** HIGH — read directly from `observations.py` source; `page='all'` triggers `IDRangePaginator` which handles the iNat API's 10,000-result page limit via `id_above` parameter.

```python
import pyinaturalist as inat
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path

WA_ATLAS_PROJECT_ID = 166376  # from data/inat/projects.py
OUTPUT_PATH = Path("data/processed/inat_observations.parquet")

def download_wa_bee_atlas_observations() -> pd.DataFrame:
    """
    Download all observations from the WA Bee Atlas iNaturalist project.

    Uses page='all' which triggers IDRangePaginator internally — handles
    result sets larger than 10,000 via id_above pagination automatically.

    Rate limits: 60 requests/minute, 10,000 requests/day (from pyinaturalist constants).
    No auth needed for read-only public observations.
    """
    response = inat.get_observations(
        project_id=WA_ATLAS_PROJECT_ID,
        page='all',          # triggers IDRangePaginator, not standard page pagination
        per_page=200,        # max per page for v1 API
        order_by='id',       # required for id_above pagination
        order='asc',
    )
    return response['results']


def download_wa_plant_observations(taxon_id: int, place_id: int = 82) -> list:
    """
    Download observations of a taxon in Washington State.

    place_id=82 is Washington State in iNaturalist's place hierarchy.
    taxon_id: iNaturalist taxon ID for the plant genus/family.
    """
    response = inat.get_observations(
        taxon_id=taxon_id,
        place_id=place_id,   # 82 = Washington State
        page='all',
        per_page=200,
        quality_grade='research',  # research grade only for reliable plant IDs
        has=['geo'],               # must have coordinates
    )
    return response['results']
```

**Key API parameters for observation search:**

| Parameter | Type | Notes |
|-----------|------|-------|
| `project_id` | int | iNat project ID; WA Atlas = 166376 |
| `taxon_id` | int or list | iNat taxon ID(s) |
| `taxon_name` | str | scientific name, resolved server-side |
| `place_id` | int | iNat place ID; Washington = 82 |
| `quality_grade` | str | `'research'`, `'needs_id'`, or `'casual'` |
| `has` | list | `['geo']` for geolocated, `['photos']` for photos |
| `page` | `'all'` or int | `'all'` = automatic pagination via id_above |
| `per_page` | int | max 200 for v1 API |
| `d1`, `d2` | str | date range filter (YYYY-MM-DD) |

### iNat Place IDs (Washington-relevant)

| Place | ID |
|-------|----|
| Washington State | 82 |
| Oregon | 10 |
| Pacific Northwest (approx) | use `swlng`/`nelng`/`swlat`/`nelat` bbox instead |

**Note:** Place IDs are confirmed from the iNat API; Washington = 82 is a standard US state place. The WA Bee Atlas project ID 166376 comes from `data/inat/projects.py`.

### Pagination: IDRangePaginator Detail

The iNat V1 API has a hard cap: standard page+per_page pagination only works up to page 100 (20,000 results at per_page=200). For larger result sets, `id_above` pagination is required. In pyinaturalist, passing `page='all'` to `get_observations()` automatically routes to `paginate_all(..., method='id')` which uses `IDRangePaginator`. This paginator:

1. Fetches the first page ordered by ID ascending
2. Records the last ID in the result
3. Next request uses `id_above=<last_id>` instead of incrementing a page number
4. Stops when a page returns fewer results than `per_page`

This bypasses the 10,000-result limit and can retrieve arbitrarily large datasets.

### iNatClient (OOP) vs. Functional API

pyinaturalist 0.20.2 offers two interfaces:

**Functional (recommended for scripts):**
```python
import pyinaturalist as inat
results = inat.get_observations(project_id=166376, page='all')
```

**OOP client (experimental, not yet stable):**
```python
from pyinaturalist import iNatClient
client = iNatClient()
obs = client.observations.search(project_id=166376).all()
```

Use the **functional API** for data pipeline scripts. The `iNatClient` is marked "WIP/Experimental" in source (confirmed from `client.py` line 35). Stick with top-level `get_observations()` for reliability.

### pyinaturalist-convert: ODP Alternative

`pyinaturalist-convert` includes `load_odp_tables()` which downloads the iNaturalist Open Data snapshot from S3 (`inaturalist-open-data` public bucket). This is a monthly snapshot of all research-grade observations globally, as tab-separated CSVs.

For the bee atlas use case, the API (`get_observations`) is preferred over ODP because:
1. Project membership filtering (WA Bee Atlas project) is only available via API
2. ODP contains all research-grade globally — filtering to WA + downloading would require processing ~100M rows
3. API returns richer fields (photos, annotations, exact taxa)

Use ODP only if you need a historical full-Washington snapshot without project filtering.

### Converting Observations to Parquet

```python
import pyarrow as pa
import pyarrow.parquet as pq
import pandas as pd

def observations_to_parquet(results: list, output_path: Path) -> None:
    """Convert pyinaturalist observation results to Parquet."""
    # Flatten the nested JSON to a dataframe
    rows = []
    for obs in results:
        rows.append({
            'id': obs['id'],
            'uuid': obs.get('uuid'),
            'observed_on': obs.get('observed_on'),
            'quality_grade': obs.get('quality_grade'),
            'latitude': obs.get('location', [None, None])[0] if obs.get('location') else None,
            'longitude': obs.get('location', [None, None])[1] if obs.get('location') else None,
            'positional_accuracy': obs.get('positional_accuracy'),
            'taxon_id': obs.get('taxon', {}).get('id'),
            'taxon_name': obs.get('taxon', {}).get('name'),
            'user_id': obs.get('user', {}).get('id'),
            'user_login': obs.get('user', {}).get('login'),
            'uri': obs.get('uri'),
            'photo_url': (
                obs['photos'][0]['url'].replace('square', 'medium')
                if obs.get('photos') else None
            ),
        })

    df = pd.DataFrame(rows)
    df.to_parquet(output_path, index=False, compression='snappy', engine='pyarrow')
```

Alternatively, use `pyinaturalist-convert`'s `to_dataframe()` for richer conversion:
```python
from pyinaturalist_convert import to_dataframe
df = to_dataframe(results)
df.to_parquet(output_path, index=False)
```

### Rate Limits and Caching

From pyinaturalist `constants.py` (confirmed from source):
- 1 request/second burst
- 60 requests/minute sustained
- 10,000 requests/day

pyinaturalist includes built-in rate limiting via `requests-ratelimiter`. No manual `time.sleep()` needed.

For repeated pipeline runs: pyinaturalist supports SQLite-based HTTP caching via `ClientSession`. Enable with:
```python
from pyinaturalist import ClientSession
session = ClientSession(cache_control=True)
```
Cache is stored in `~/.local/share/pyinaturalist/`. Useful for development but disable for production pipeline runs where fresh data is needed.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CDK origin | `S3BucketOrigin.withOriginAccessControl()` | `S3Origin` (OAI) | Deprecated in CDK v2; OAI is legacy AWS concept |
| CDK distribution | `cloudfront.Distribution` | `CloudFrontWebDistribution` | Also deprecated; `Distribution` is the L2 replacement |
| CDK version | v2 (`aws-cdk-lib`) | v1 | End-of-support June 2023 |
| OIDC auth | `aws-actions/configure-aws-credentials@v4` | Stored AWS key secrets | Long-lived keys are a security anti-pattern |
| iNat pagination | `page='all'` (IDRangePaginator) | Manual page loop | Manual loop breaks at 10,000 results; IDRangePaginator handles arbitrary sizes |
| iNat client | Functional `get_observations()` | `iNatClient` OOP | OOP client marked experimental in source |
| iNat data source | V1 API | iNat Open Data Product (ODP) | ODP has no project filter; 100M+ rows for global slice |

---

## Installation

```bash
# CDK infrastructure (new infra/ directory)
mkdir infra && cd infra
cdk init app --language typescript
# aws-cdk-lib and constructs installed by init

# No new Python deps needed — pyinaturalist 0.20.2 already in pyproject.toml
# Verify installed version:
uv run python -c "import pyinaturalist; print(pyinaturalist.__version__)"
```

---

## Sources

- pyinaturalist installed source at `/Users/rainhead/dev/beeatlas/data/.venv/lib/python3.14/site-packages/pyinaturalist/` — HIGH confidence
- pyinaturalist-convert installed source at `/Users/rainhead/dev/beeatlas/data/.venv/lib/python3.14/site-packages/pyinaturalist_convert/` — HIGH confidence
- CDK v2 constructs: knowledge from training data (CDK v2 stable since 2021, OAC support confirmed added 2022-2023) — MEDIUM confidence; verify exact `S3BucketOrigin` API in CDK changelog if constructor signature changes
- GitHub Actions OIDC: knowledge from training data cross-checked with known stable patterns — MEDIUM confidence
- WA Bee Atlas project ID 166376: from `data/inat/projects.py` in repo — HIGH confidence
- Washington State place_id=82: from iNat API knowledge; confirm via `inat.get_places_by_id(82)` — MEDIUM confidence
