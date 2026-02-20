# Domain Pitfalls

**Domain:** Static biodiversity map with CI/CD deploy (S3+CloudFront, GitHub Actions OIDC, Python data pipeline, client-side Parquet)
**Researched:** 2026-02-18
**Confidence:** MEDIUM — CDK/GHA/OpenLayers from training data (August 2025 cutoff); iNaturalist limits from pyinaturalist docs + training; project-specific bugs from direct code audit (HIGH)

---

## Critical Pitfalls

Mistakes that cause rewrites, broken deploys, or silent data loss.

---

### Pitfall 1: CloudFront Serving Stale Files After S3 Deploy

**What goes wrong:** After `aws s3 sync` copies new files to S3, CloudFront continues serving the previous version from its edge cache. Users see old data or old JS bundles. With Vite's content-hashed assets (`main-Abc123.js`), JS/CSS files self-invalidate on filename change — but `index.html` is NOT content-hashed and will cache stale. Also any Parquet data files served at stable paths (e.g., `ecdysis.parquet`) cache without invalidation.

**Why it happens:** CloudFront TTL defaults to 24 hours for objects that don't set `Cache-Control`. S3 sync puts the file; CloudFront doesn't know.

**Consequences:**
- Users load new `index.html` (correctly) but it references old hashed bundles that no longer exist on S3 → 404 on JS assets
- Or users load old `index.html` that references new hashed bundles → same 404
- Data files silently serve last run's Parquet until TTL expires

**Prevention:**
1. After every `aws s3 sync`, run `aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"` (or at minimum `/index.html` and `/assets/*.parquet`).
2. Set `Cache-Control: no-cache` on `index.html` in S3 metadata; set long TTL on hashed assets.
3. In GitHub Actions, store the CloudFront distribution ID in a secret or CDK output, not hardcoded.

**Detection:** After deploy, `curl -I https://your-domain/` and check `x-cache: Hit from cloudfront` on a known-changed file. If it says HIT, invalidation didn't run.

**Phase:** Infrastructure setup (CDK + GHA deploy workflow)

---

### Pitfall 2: CDK S3BucketOrigin — OAI vs OAC Confusion

**What goes wrong:** AWS deprecated Origin Access Identity (OAI) in favor of Origin Access Control (OAC) for S3 origins. The CDK API changed significantly: `S3Origin` (old, uses OAI) was replaced by `S3BucketOrigin.withOriginAccessControl()` (new, uses OAC). If you copy examples from blog posts pre-2023, you get OAI which still works but is the legacy path.

The deeper trap: with OAC, S3 bucket policy must explicitly allow `s3:GetObject` from CloudFront service principal using a condition on `aws:SourceArn` matching the distribution ARN. CDK's `S3BucketOrigin.withOriginAccessControl()` handles this automatically — but only if you let CDK manage the bucket policy. If the bucket has `blockPublicAccess: BlockPublicAccess.BLOCK_ALL` (which it should), and you manually manage bucket policies, the auto-grant may not apply correctly.

**Consequences:** CloudFront returns 403 or 404 for all asset requests, even though files are in S3. Hard to debug because the error comes from CloudFront, not S3.

**Prevention:**
- Use `S3BucketOrigin.withOriginAccessControl()` (not `S3Origin`) in CDK v2.
- Let CDK manage the bucket policy; do not separately define an `aws_s3.BucketPolicy` resource for the same bucket.
- After CDK deploy, verify bucket policy was created with the correct `aws:SourceArn` condition.
- Enable S3 server access logs or CloudFront access logs during initial setup to distinguish 403 (policy) from 404 (key not found).

**Detection:** CloudFront returns 403. Check S3 bucket policy: does it have an `Allow` statement with `Principal: {"Service": "cloudfront.amazonaws.com"}` and `Condition: {"StringEquals": {"aws:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/DIST_ID"}}`? If not, CDK didn't apply it.

**Phase:** Infrastructure setup (CDK)

---

### Pitfall 3: GitHub Actions OIDC Trust Policy — Subject Claim Mismatch

**What goes wrong:** The OIDC trust policy on the AWS IAM role restricts `token.actions.githubusercontent.com:sub` to a specific pattern. If the pattern doesn't exactly match the GitHub Actions context (repo name, branch, environment), `AssumeRoleWithWebIdentity` silently returns `AccessDenied`. There is no helpful error message indicating which condition failed.

Common mismatches:
- `repo:org/repo:ref:refs/heads/main` — correct for main branch
- `repo:org/repo:*` — matches any branch/event (common for initial setup; overly broad but works)
- `repo:org/repo:environment:production` — requires the Actions workflow to declare `environment: production`; if the `environment:` key is omitted from the job definition, the subject is `repo:org/repo:ref:refs/heads/main` not `repo:org/repo:environment:production` → denied

**Consequences:** Deploy step fails with `Error: Not authorized to perform sts:AssumeRoleWithWebIdentity`. Misleading because the OIDC provider may be set up correctly; only the subject condition is wrong.

**Prevention:**
1. In the IAM trust policy, use `StringLike` (not `StringEquals`) with a wildcard during initial setup: `"token.actions.githubusercontent.com:sub": "repo:rainhead/beeatlas:*"`. Tighten after confirming it works.
2. Match the `environment:` key in the workflow job to what's in the trust policy, or remove environment-scoped conditions from the trust policy.
3. The trust policy must also include `"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"` — this is frequently omitted from copied examples.

**Detection:** `aws sts get-caller-identity` in the Actions step will fail with the AssumeRole error. Add `aws sts decode-authorization-message` if you have permissions; otherwise decode the subject by temporarily adding a debug step that prints `${{ github.token }}` decoded (do not print real tokens — use a separate step to print `github.ref` and `github.repository` to verify the subject you're generating).

**Phase:** CI/CD setup (GitHub Actions workflow)

---

### Pitfall 4: Vite Inlines or Hashes Parquet Files Incorrectly

**What goes wrong:** Vite treats `?url` imports (like `import ecdysisDump from './assets/ecdysis.parquet?url'`) as static asset URLs. By default Vite copies assets under 4KB inline as base64 data URIs, and assets over the threshold get content-hashed filenames. For Parquet files, the size threshold is always exceeded, so they get hashed names. This is actually fine for a single Parquet file.

The problems arise when:

1. **Parquet file grows too large for the Vite build to handle in CI**: If iNaturalist host plant observations are added (potentially hundreds of thousands of records for Washington), the Parquet file could reach 10–50 MB+. Vite will try to copy it into `dist/assets/` during every build. This is slow and bloats the git-tracked build artifact if `dist/` is ever committed.

2. **Multiple Parquet files with different update cadences**: If specimens (updated monthly) and host plants (updated weekly) are separate files, each needs its own cache-busting URL but they currently live in `frontend/src/assets/` as build-time assets. Managing multiple large binary assets through Vite adds friction.

3. **hyparquet's `asyncBufferFromUrl` requires HTTP range requests**: The library uses HTTP `Range` headers to read Parquet row groups without fetching the full file. CloudFront supports range requests by default, but S3 origin must also support them (it does). If the Parquet file is served from a CDN or proxy that strips `Range` headers, hyparquet falls back to fetching the entire file — which works but defeats the purpose of columnar partial reads.

**Consequences:** Slow builds, large `dist/` directories, potential CI timeouts on large file copies. Range request stripping causes full-file fetches (not a correctness bug, but a performance regression).

**Prevention:**
1. Set `assetsInlineLimit: 0` in `vite.config.ts` to prevent any inlining of binary assets.
2. Keep Parquet files out of `dist/` by serving them from a separate S3 path, not bundled as Vite assets. The frontend fetches them by a stable URL. Vite only bundles JS/CSS/HTML.
3. For large data files: place them in S3 under a separate prefix (e.g., `data/ecdysis.parquet`), not in the CloudFront-served `dist/` prefix, and reference them by absolute URL or environment variable. The CloudFront distribution can serve both origins.
4. Verify CloudFront passes `Range` headers: check the cache policy — the default "CachingOptimized" policy does not forward `Range` headers for caching keys, but it does allow the request to pass through. If using a custom cache policy, explicitly allow range requests.

**Detection:** In the network panel, if the Parquet fetch is a single 200 response (not 206 Partial Content), range requests are not being used. For a 5 MB file this is acceptable; for 50 MB it is not.

**Phase:** Infrastructure setup + frontend feature work

---

### Pitfall 5: iNaturalist API Pagination Hard Limit (10,000 Records)

**What goes wrong:** The iNaturalist API v1 and v2 both enforce a hard cap: you can only retrieve up to 10,000 records per query, regardless of how many pages you paginate through. For observations in Washington state (`place_id=14`), there may be millions of plant observations. The combination of `per_page=200` and `page=50` hits the limit (200 × 50 = 10,000).

pyinaturalist's `get_observations()` with `page_all=True` handles pagination automatically but will silently stop at this limit without raising an error — it just returns 10,000 records and stops.

**Why it happens:** iNaturalist documents this limit but it's easy to miss. The API returns `total_results` in the response, making it look like you're getting everything when you're only getting the first 10,000.

**Consequences:** Silent data truncation. Host plant data appears complete (you get 10,000 observations) but thousands of records are missing. Downstream Parquet files have no indication of truncation.

**Prevention:**
1. Always check `total_results` in the API response and log a warning when it exceeds 10,000.
2. Split queries by taxon, county, or year to keep each query under 10,000 results. For Washington host plants, query by plant family or by county.
3. Use `id_above` pagination strategy (query `id > last_seen_id`) instead of `page` — this is the iNaturalist-recommended approach for bulk downloads and bypasses the 10,000-record hard limit.
4. For bulk downloads of iNaturalist data, consider using GBIF's iNaturalist export or iNaturalist's bulk export feature instead of the API.

**Detection:** In the pipeline script, after fetching, assert `len(results) == total_results` or log a warning when `total_results > 10_000`.

**Phase:** Data pipeline (iNaturalist integration)

---

### Pitfall 6: OpenLayers VectorLayer Performance Degrades Non-Linearly Above ~10K Points

**What goes wrong:** OpenLayers' default `VectorLayer` renders features on a canvas, re-rendering the full layer on every map interaction (pan, zoom, resize). The current code loads all 45K Ecdysis specimens at once with `strategy: all`. With ~45K points this is borderline; adding iNaturalist host plant observations (potentially 100K+ records) will cause visible frame drops on pan/zoom.

The rendering bottleneck is not fetching (hyparquet partial reads help there) but canvas drawing: each feature is individually styled and painted. The existing `clusterStyle` in `style.ts` is defined but not wired up to the map — this is the correct solution but it's incomplete.

**Consequences:** Map feels sluggish or unresponsive, especially on mobile. Zooming becomes janky. On low-end devices the browser may skip frames entirely.

**Prevention:**
1. Enable clustering using `ol/source/Cluster` wrapping the `VectorSource`. The `clusterStyle` already exists in `style.ts` — wire it up.
2. Use `WebGLPointsLayer` instead of `VectorLayer` for large point datasets. OpenLayers v10 supports this. It uses GPU rendering and handles 500K+ points without degradation. The tradeoff is that click interaction requires a `HitDetection` layer or manual coordinate math.
3. Separate concerns: use `WebGLPointsLayer` for rendering all points (fast), and a separate thin `VectorLayer` for selected/highlighted features (few features, full interaction support).
4. If keeping `VectorLayer`, add a max-resolution threshold: only render points at zoom ≥ 8 (i.e., county level) and show a "zoom in to see specimens" message at lower zooms.

**Detection:** Open Chrome DevTools Performance tab, record while panning the map. If frame time during a pan exceeds 16ms (60 fps threshold), the render path is a bottleneck. Test on a mid-range mobile device, not just a developer machine.

**Phase:** Frontend feature work (host plant layer, filtering)

---

## Moderate Pitfalls

---

### Pitfall 7: CDK Bootstrap Required Before First Deploy

**What goes wrong:** CDK requires a one-time `cdk bootstrap` to create the `CDKToolkit` stack in the target AWS account/region before any CDK deployment can run. The bootstrap stack creates an S3 bucket for staging assets and an ECR repository. Without it, `cdk deploy` fails with `This stack uses assets, so the toolkit stack must be deployed to the environment`.

In a fresh AWS account or new region, this step is not part of the normal CI pipeline and must be done manually once. If it's not documented, the next person to set up the account has no idea why deploys fail.

**Prevention:**
1. Document the one-time setup steps (bootstrap + OIDC identity provider creation) in the project README or `infra/README.md`.
2. The OIDC identity provider (`token.actions.githubusercontent.com`) also must be created once in the AWS account — it is not created by CDK by default unless you add it to the CDK stack.

**Detection:** `cdk deploy` exits with "bootstrap" error message; easy to identify once you know to look for it.

**Phase:** Infrastructure setup

---

### Pitfall 8: CDK Stack Name Collisions During Iteration

**What goes wrong:** If you iterate on the CDK stack during development (rename a construct, change a logical ID, or change a resource type), CDK may attempt to replace the resource, which requires deleting the old one first. For S3 buckets, deletion requires the bucket to be empty. CDK will fail with `BucketNotEmpty` unless `removalPolicy: RemovalPolicy.DESTROY` and `autoDeleteObjects: true` are set — but these are dangerous in production.

Renaming a CloudFront distribution's logical ID causes CloudFront to be destroyed and recreated, which takes 15–20 minutes and changes the distribution domain name (breaking DNS).

**Prevention:**
1. Use stable logical IDs from the start. Avoid auto-generated names — explicitly set `id` parameters on constructs you might rename.
2. For the S3 bucket, set `removalPolicy: RemovalPolicy.RETAIN` in production to prevent accidental deletion.
3. Don't rename CDK resources after the first deploy without checking the `cdk diff` output for "Replacement" indicators.

**Detection:** `cdk diff` output shows `[-] Delete` followed by `[+] Create` for the same resource type — this is a replacement, not an update.

**Phase:** Infrastructure setup

---

### Pitfall 9: iNaturalist Rate Limiting in GitHub Actions

**What goes wrong:** The iNaturalist API has undocumented but enforced rate limits: approximately 100 requests/minute for unauthenticated requests. pyinaturalist's `get_observations()` with `per_page=200` requires one API call per 200 records. For 10,000 records that's 50 requests. For a full Washington host plant query split across taxa or counties, it could be hundreds of requests.

In CI, multiple runs can run close together (e.g., if main gets several pushes in quick succession). iNaturalist may return 429 or silently return fewer results. pyinaturalist does not retry on 429 by default.

**Prevention:**
1. Cache the iNaturalist Parquet output in GitHub Actions with a weekly cache key. Only re-fetch when the cache misses. Use `actions/cache` keyed on the current week: `key: inat-${{ steps.date.outputs.week }}`.
2. Add `time.sleep(0.6)` between paginated requests (100 req/min = 0.6s per request minimum).
3. Authenticate with iNaturalist (create a free API key) to get higher rate limits. pyinaturalist supports API key auth.
4. For bulk data, use GBIF's iNaturalist-sourced exports (updated monthly, no rate limits, full dataset).

**Detection:** Pipeline produces fewer records than expected; `total_results` in the response doesn't match records fetched. Look for HTTP 429 responses in pyinaturalist debug output.

**Phase:** Data pipeline (iNaturalist integration), CI/CD setup

---

### Pitfall 10: Parquet Column Type Drift Between Pipeline Runs

**What goes wrong:** The project currently has duplicate dtype specifications (`ECDYSIS_DTYPES` in `download.py` and the dtype dict in `ecdysis/occurrences.py`; same for OSU Museum data). When one is updated but not the other, the same column has different types in different Parquet outputs. The frontend (`parquet.ts`) then receives unexpected types (e.g., a column that was `int64` is now `string`) causing silent NaN coordinates or JavaScript type errors.

This is a pre-existing issue (documented in CONCERNS.md) that becomes a CI/CD pitfall: automated pipeline runs will succeed even with wrong types, producing a deployed site with broken or missing map points.

**Prevention:**
1. Consolidate dtype specs into a single source of truth before wiring up CI.
2. Add a schema validation step in the pipeline: after writing Parquet, read back the schema with `pyarrow.parquet.read_schema()` and assert expected column names and types.
3. Add a frontend assertion: if `parquet.ts` receives a row where `latitude` or `longitude` is not a finite number, skip it (null guard) and report a warning to the console.

**Detection:** Deploy succeeds but fewer points appear on the map. Check browser console for NaN coordinate warnings. In CI, compare `pyarrow.parquet.read_schema(output).to_arrow_schema()` against a committed expected schema file.

**Phase:** Data pipeline fixes (pre-CI work)

---

### Pitfall 11: S3 Deploy Scope — Deleting Files Not in Current Build

**What goes wrong:** `aws s3 sync` with `--delete` removes S3 files not present in the local `dist/` directory. This is usually correct for a single-origin static site. However, if Parquet data files are stored in S3 alongside the frontend build (e.g., at `s3://bucket/data/ecdysis.parquet`) but not inside `dist/`, the `--delete` flag will delete them on every deploy that doesn't re-generate data.

This is especially likely if the CI workflow has two separate jobs: one that builds the frontend and syncs `dist/`, and a separate data pipeline job that uploads Parquet files. If only the frontend job runs (e.g., on a non-main branch), `--delete` will wipe the data files.

**Prevention:**
1. Use `aws s3 sync dist/ s3://bucket/ --delete --exclude "data/*"` to protect the data prefix.
2. Or keep Parquet data files at a completely separate S3 path that the frontend job never syncs.
3. Alternatively, put Parquet files inside `dist/data/` so they are always part of the frontend build output — but only feasible if the data pipeline always runs with the frontend build.

**Detection:** Map loads with no points after a frontend-only deploy. CloudFront logs show 403/404 for Parquet file paths.

**Phase:** CI/CD setup (deploy workflow)

---

## Minor Pitfalls

---

### Pitfall 12: OpenLayers CSS Version Drift

**What goes wrong:** `bee-map.ts` loads OpenLayers CSS from jsDelivr CDN with a pinned version (`ol@v10.8.0`) that differs from the installed package version (`^10.7.0`). When `ol` is upgraded via `npm update`, the CDN link is not automatically updated. CSS changes between versions (rare but possible) cause visual regressions.

**Prevention:** Import the CSS through Vite's module system: `import 'ol/ol.css'` in the component or entry point. Vite bundles it with the correct version. Remove the CDN `<link>` tag.

**Phase:** Frontend cleanup (pre-feature work)

---

### Pitfall 13: pdb.set_trace() in Production Code Path

**What goes wrong:** `data/ecdysis/occurrences.py` line 95 has `import pdb; pdb.set_trace()` inside `to_parquet()`. A CI job running this function will hang indefinitely waiting for debugger input, consuming GitHub Actions minutes until the job timeout kills it.

**Prevention:** Remove before wiring up CI. This is documented in CONCERNS.md. It must be the first fix applied before any CI work.

**Detection:** CI job hangs with no output after the "Writing to parquet" log line, then times out after 6 hours (default GHA timeout).

**Phase:** Data pipeline fixes (blocking, must fix first)

---

### Pitfall 14: Python 3.14 Availability in GitHub Actions Runners

**What goes wrong:** `data/pyproject.toml` requires `python>=3.14`. Python 3.14 is a recent release (released October 2024). GitHub Actions `ubuntu-latest` runners may have Python 3.12 or 3.13 pre-installed. The `actions/setup-python` action supports 3.14 via `python-version: "3.14"` but it must be explicitly specified. Without it, `uv sync` will fail because the Python version constraint isn't met by the system Python.

**Prevention:** In the GitHub Actions workflow, use:
```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.14"
```
Or use `uv` directly: `uv run --python 3.14 python ...` — `uv` can download and manage Python versions independently of the system.

**Detection:** `uv sync` fails with "No interpreter found for python>=3.14" or similar.

**Phase:** CI/CD setup

---

### Pitfall 15: Ecdysis POST Download Returns Empty or Error Silently

**What goes wrong:** The Ecdysis download uses a POST request to a Symbiota portal endpoint. Symbiota portals can return HTTP 200 with an error HTML page (not a zip file) if the query parameters are wrong or the server is overloaded. The current code checks `response.raise_for_status()` but does not validate that the response is actually a zip file before writing it to disk.

In CI, if the Ecdysis server is temporarily down or the POST parameters change (Symbiota version updates occasionally change the download handler), the pipeline writes an HTML error page as a `.zip` file, which then fails to open with `zipfile.ZipFile`. The error message is obscure: `BadZipFile: File is not a zip file`.

**Prevention:**
1. After the POST response, check `response.headers['Content-Type']` — it should be `application/zip` or `application/octet-stream`. If it's `text/html`, raise a descriptive error before writing.
2. Log the response size: an error HTML page is usually a few KB; a real data zip is several MB.

**Detection:** CI fails with `BadZipFile` on the Ecdysis processing step. Inspect the saved `.zip` file — if it's readable text (HTML), the POST failed silently.

**Phase:** Data pipeline (download reliability)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| CDK S3+CloudFront setup | OAI vs OAC API confusion; bucket policy not auto-applied | Use `S3BucketOrigin.withOriginAccessControl()`; verify bucket policy after deploy |
| CDK first deploy | Bootstrap not run; OIDC identity provider missing | Document one-time setup in infra README |
| GitHub Actions OIDC | Subject claim mismatch; missing `aud` condition | Use `StringLike` with wildcard first; add `environment:` to workflow only if trust policy requires it |
| GitHub Actions deploy | CloudFront cache not invalidated | Always run `create-invalidation` after s3 sync |
| GitHub Actions deploy | `--delete` wipes Parquet data files | Use `--exclude "data/*"` or separate S3 paths |
| iNaturalist data fetch | 10K record hard cap; silent truncation | Use `id_above` pagination; validate `total_results` |
| iNaturalist data fetch | Rate limiting in CI | Cache weekly; add sleep between requests |
| Python data pipeline | `pdb.set_trace()` hangs CI | Remove before any CI wiring |
| Python data pipeline | Python 3.14 not pre-installed | Explicit `setup-python@v5` with `python-version: "3.14"` |
| Python data pipeline | Parquet schema drift | Consolidate dtype specs; add schema assertion step |
| Python data pipeline | Ecdysis POST returns HTML as zip | Validate `Content-Type` before writing zip to disk |
| Vite build | Large Parquet files in build artifacts | Consider separate S3 path for data files; set `assetsInlineLimit: 0` |
| Frontend: host plant layer | OpenLayers perf with 100K+ points | Use `WebGLPointsLayer` or enable clustering |
| Frontend: filtering | Null coordinate crash | Guard `fromLonLat` calls with null check (pre-existing bug) |

---

## Sources

- Direct code audit of this repository (HIGH confidence for project-specific bugs)
- AWS CDK v2 documentation on `S3BucketOrigin.withOriginAccessControl()` (MEDIUM confidence — from training data, August 2025 cutoff; verify against current CDK docs)
- GitHub Actions OIDC documentation: `docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services` (MEDIUM confidence)
- iNaturalist API v1/v2 pagination limits: documented 10K cap is well-established in the pyinaturalist community (MEDIUM confidence — verify with `api.inaturalist.org/v2/docs`)
- pyinaturalist library behavior: training data + library version 0.20.x in `pyproject.toml` (MEDIUM confidence)
- OpenLayers rendering performance characteristics with VectorLayer vs WebGLPointsLayer: training data (MEDIUM confidence — verify with OL v10 release notes)
- Reference project pattern: `github.com/salish-sea/salishsea-io` mentioned in PROJECT.md as the OIDC+S3 deploy model (not audited directly)
