# Domain Pitfalls

**Domain:** Static biodiversity map with CI/CD deploy (S3+CloudFront, GitHub Actions OIDC, Python data pipeline, client-side Parquet)
**Researched:** 2026-02-18 (v1.0); 2026-02-25 (v1.1 iNat API integration addendum)
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

**What goes wrong:** The iNaturalist API v1 and v2 both enforce a hard cap: you can only retrieve up to 10,000 records per query using `page` + `per_page` pagination. This is a hard server-side limit — attempting to request page 51 with `per_page=200` (10,200 results) throws an error. For the Washington Bee Atlas project (project ID 166376), the observation count should remain below this limit for the near term, but the limit must be actively monitored.

pyinaturalist's `get_observations()` with `page='all'` handles pagination automatically but returns at most 10,000 records. It does not raise an error on truncation; it just returns the first 10,000 and stops.

**Why it happens:** iNaturalist documents this limit in its API Recommended Practices, but it's easy to miss when queries return complete-looking results.

**Consequences:** Silent data truncation. Pipeline produces a Parquet that appears valid but is missing records. Volunteers see a map that appears complete but has gaps.

**Prevention:**
1. Always check `total_results` in the first page's response and log a warning when it exceeds 10,000.
2. For observations within a specific project, the count is unlikely to exceed 10,000 for the Washington Bee Atlas in the near term (it was founded in 2021). Assert `total_results < 10_000` and fail the pipeline loudly if it exceeds the limit — do not silently truncate.
3. If the limit is ever exceeded, use the `id_above` pagination strategy: sort by `id` ascending and use `id_above=last_seen_id` to page through arbitrary result counts without hitting the hard limit. This is the iNaturalist-recommended approach for bulk downloads.

**Detection:** After fetching, assert `len(results) == response['total_results']` and log a warning when `total_results > 10_000`.

**Phase:** Data pipeline (iNaturalist integration — INAT-01)

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

## v1.1 iNat API Integration — Critical Pitfalls

These pitfalls are specific to adding iNaturalist API querying to the existing static pipeline.

---

### Pitfall 7: Observation Field Values Are Absent Unless Explicitly Requested

**What goes wrong:** The iNaturalist API v1 observation response does NOT include `observation_field_values` by default. Fetching `/v1/observations?project_id=166376` returns observations without any observation field data, even if the observer entered a specimen count field. The field simply does not appear in the JSON response.

Confirmed by the sample observation JSON in `data/inat/observation/300847934.json`: the response contains `uuid`, `id`, `geojson`, `user`, `taxon`, and `observation_photos` — but no `observation_field_values` key at all.

**Why it happens:** Observation field values are a separate data payload that the API must be instructed to include. Without the correct parameter, the server omits them to reduce response size.

**Consequences:** The pipeline receives valid-looking observations with no specimen count data. `specimen_count` column in `samples.parquet` is populated entirely with nulls/zeros. The sidebar shows "0 specimens" for every collection event.

**Prevention:**
- When using the iNaturalist API v1 `/observations` endpoint, include the `fields` parameter or use `extra=fields` to request observation field values. The exact parameter syntax is `fields=all` or selectively requesting `observation_field_values` as a field specification.
- Verify the response contains `observation_field_values` before extracting specimen count. Log a warning if the key is missing.
- Use pyinaturalist's `get_observations()` with `fields='all'` to include observation field values in the response.

**Detection:** Inspect a raw API response for a known observation (e.g., ID 300847934) that has a specimen count field. If `observation_field_values` is not in the JSON, the request is missing the fields parameter.

**Phase:** INAT-02 (specimen count extraction)

---

### Pitfall 8: Observation Field IDs Are Numeric, Not Name Strings

**What goes wrong:** Observation fields in iNaturalist are identified by numeric integer IDs (e.g., field ID 12345), not by their human-readable name ("Specimen Count" or similar). The web interface uses name-based URL search (`field:Specimen Count=yes`), which does not translate directly to the API.

When parsing `observation_field_values` from the API response, the field is identified in the response by `observation_field.id` (numeric) and `observation_field.name` (string). Filtering by field name string works when parsing the response, but:

1. Field names are case-sensitive and can change (a curator renames the field).
2. Multiple projects may have observation fields with identical names but different IDs.
3. The Washington Bee Atlas project has a specific specimen count field. Its numeric ID must be verified from a real API response or the iNaturalist observation fields page, not assumed.

The project file `data/inat/projects.py` shows project ID 166376 for Washington, but does not document which observation field ID corresponds to "specimen count."

**Why it happens:** iNaturalist's observation field system is globally shared — any user can create a field with any name. The same concept (specimen count) may have dozens of different field IDs across different projects.

**Consequences:** Pipeline silently skips the specimen count field if it filters by wrong field name or ID. All observations report 0 specimens.

**Prevention:**
1. Identify the specific observation field ID used by the Washington Bee Atlas project for specimen count by fetching a known observation with a specimen count entered, and extracting the `observation_field.id` from `observation_field_values`.
2. Store the field ID as a named constant in the pipeline code, not as a string match on field name.
3. Log all distinct observation field names and IDs found in the fetched observations to aid debugging.
4. If matching by name is necessary as fallback, match case-insensitively and log when a match is found.

**Detection:** Fetch a single observation where you know a specimen count was entered (ask a WaBA volunteer for a specific observation URL). Inspect the `observation_field_values` array and record the `observation_field.id` for the specimen count field.

**Phase:** INAT-02 (specimen count extraction)

---

### Pitfall 9: Collection Project vs Traditional Project — Observation Field Implications

**What goes wrong:** The Washington Bee Atlas iNaturalist project (ID 166376) is almost certainly a collection project (iNaturalist's modern project type), not a traditional project. This distinction matters for observation field handling:

- **Collection projects** cannot *require* observation fields. Fields are voluntary add-ons by individual observers.
- **Traditional projects** can require observation fields as membership conditions.

For a collection project, many observations will simply not have a specimen count field value entered, even if the project coordinator instructs volunteers to do so. The API will return observations with an empty `observation_field_values` array.

Additionally, collection project access through the API does not grant access to private/obscured coordinates for project curators. Observations by volunteers who collect in sensitive areas may have obscured GPS coordinates (±0.2 degree bounding box instead of exact location), reducing map accuracy.

**Why it happens:** Collection projects are the newer iNaturalist project type designed for automatic aggregation. The trade-off is less control over required fields and no privileged coordinate access.

**Consequences:**
- `specimen_count` will be null for a significant fraction of observations (potentially >50% of early-stage project observations).
- Map markers may appear offset by up to ~20km for obscured observations.
- The sidebar must gracefully display "not entered" rather than "0" for missing specimen counts.

**Prevention:**
1. Design the pipeline and schema to treat `specimen_count` as nullable (allow null/None), not 0 as default.
2. In the frontend sidebar, distinguish between "0 specimens" (value explicitly entered as 0) and "not recorded" (field absent from observation).
3. Confirm the project type by visiting `api.inaturalist.org/v1/projects/166376` — the `project_type` field will be `"collection"` or `"traditional"`.
4. For obscured coordinates, use the center of the obscured bounding box as returned by the API (this is what the API provides as `geojson`). Document this known imprecision in the UI.

**Detection:** Fetch 10 observations from the project. Count how many have non-empty `observation_field_values`. If most are empty, the volunteer adoption of the specimen count field is low and the UI must handle null gracefully.

**Phase:** INAT-02, MAP-04 (sidebar display)

---

### Pitfall 10: project_id Filtering Returns Members-Only or Includes Non-Member Observations

**What goes wrong:** iNaturalist has two distinct ways to scope observations to a project:

1. `project_id=166376` — Returns observations associated with the project. For collection projects, this means observations matching the project's automatic filters (taxa, place, date, etc.). For traditional projects, this means observations manually added by members.
2. Place-based filtering (`place_id=14` for Washington state) — Returns all observations in a place regardless of project membership.

For a collection project, `project_id` filtering is the correct approach — it applies the project's configured filters automatically. However:

- If the project has a "project members only" setting enabled (a feature iNaturalist added for collection projects), `project_id` will only return observations from users who joined the project.
- If the project coordinator changes the project's filter criteria (e.g., adds a new taxon filter), the API results change retroactively without any notification.
- The API may return a `per_page` default of 30 even when `per_page=200` is requested in some edge cases (confirmed as a historical bug in the iNaturalist forum; workaround is to explicitly set `per_page`).

**Consequences:** If using place-based filtering instead of project-based filtering, the pipeline fetches all Washington bee observations (not just WaBA volunteers), producing a samples.parquet with tens of thousands of irrelevant observations and no specimen count data.

**Prevention:**
1. Use `project_id=166376` (not `place_id=14`) as the primary filter for the Washington Bee Atlas.
2. Explicitly set `per_page=200` and verify the response `per_page` matches what was requested.
3. Log the total observation count per run to detect unexpected spikes or drops caused by project configuration changes.

**Detection:** Fetch observations with `project_id=166376` and spot-check 5 observations: do the observer names match known WaBA participants? Are there observation field values for specimen counts? If results look wrong, compare with fetching `place_id=14&taxon_name=Anthophila` (all Washington bees) to see if you're getting project-specific vs. general data.

**Phase:** INAT-01 (pipeline querying)

---

### Pitfall 11: CI Build Fails When iNaturalist API Is Down (Compounding the Existing Ecdysis Problem)

**What goes wrong:** The existing `build-data.sh` already makes a live HTTP POST to ecdysis.org on every `npm run build`. The v1.1 milestone adds a second external HTTP dependency: the iNaturalist API. The current workflow has no fallback — if ecdysis.org is down, the build fails. Adding iNat API creates a second independent failure point.

The deploy workflow runs `npm run build` twice (once in the `build` job, once in the `deploy` job). Both calls run `build-data.sh`, meaning both jobs make HTTP requests to both ecdysis.org and api.inaturalist.org. If either external service is down during any of these four HTTP calls, the deploy fails.

iNaturalist does have scheduled maintenance windows (as confirmed by community forum announcements). A scheduled iNaturalist downtime during a CI run that happens to be pushing a code change will block deployment of unrelated frontend fixes.

**Why it happens:** The pipeline has no separation between "fetch external data" and "build from cached data." Every build triggers a fresh data fetch.

**Consequences:** Unrelated code changes (CSS fix, typo correction) fail CI because iNaturalist is temporarily down. Deployment is blocked. The team has no way to deploy without fixing the data pipeline.

**Prevention:**
1. Commit a fallback `samples.parquet` alongside the existing committed `ecdysis.parquet`. The build script uses the committed file if the API call fails.
2. Separate the data pipeline from the frontend build in CI: add a scheduled job (e.g., daily or weekly) that runs the data pipeline and commits updated Parquet files, separate from the push-triggered build job. The push-triggered job only runs the frontend build against the most recently committed Parquet.
3. Add timeout and retry logic to the iNat API fetch. The iNaturalist API Recommended Practices suggest keeping requests under 100/minute. A single project fetch at 200 observations/page should complete in under 10 seconds even for 5,000 observations.
4. If the iNat API returns a 5xx or times out, use the last committed `samples.parquet` and log a warning rather than failing the build.

**Detection:** A CI run fails with a connection error or HTTP 5xx pointing to api.inaturalist.org. If a committed fallback exists, the build should have used it instead of failing.

**Phase:** INAT-01, CI/CD (data pipeline separation)

---

### Pitfall 12: iNaturalist API Rate Limiting in CI Across Concurrent Runs

**What goes wrong:** The iNaturalist API enforces a limit of approximately 100 requests/minute for unauthenticated requests (iNaturalist's recommended target is 60/minute to be safe). GitHub Actions runs may execute concurrently on push events that occur close together (e.g., several commits pushed quickly, or a PR merge followed by a hotfix). Multiple CI runs making parallel API requests from the same IP can trigger throttling.

iNaturalist returns HTTP 429 when rate limited. The pipeline currently has no retry logic on 429 responses. pyinaturalist does handle rate limiting by default when used with its `ClientSession`, but bare `requests` calls do not.

**Why it happens:** GitHub Actions runners in the same region share a pool of outbound IP addresses. Multiple CI runs appear to come from the same IP to iNaturalist's rate limiter.

**Consequences:** Intermittent CI failures with HTTP 429. The `samples.parquet` is not produced. If there is no fallback, the build fails.

**Prevention:**
1. Use pyinaturalist rather than raw `requests` calls. pyinaturalist's built-in rate limiting respects iNaturalist's recommended practices by default.
2. Cache the iNaturalist Parquet output in GitHub Actions with a weekly cache key using `actions/cache`. Only re-fetch when the cache misses: `key: inat-samples-${{ steps.date.outputs.week }}`.
3. Set a custom `User-Agent` header identifying the application (e.g., `User-Agent: WashingtonBeeAtlas/1.1 (github.com/rainhead/beeatlas)`). iNaturalist's recommended practices call this out specifically — it allows them to contact you if there's a problem rather than silently blocking.
4. Add `time.sleep(1)` between pages (1 request/second = 60 requests/minute, safely below the limit).

**Detection:** CI logs show HTTP 429 from api.inaturalist.org. pyinaturalist with `ClientSession` will log rate limit backoff automatically.

**Phase:** INAT-01, CI/CD setup

---

### Pitfall 13: iNat API Response Coordinate Is Obscured Centroid, Not True Location

**What goes wrong:** iNaturalist automatically obscures coordinates for observations of at-risk species (taxon geoprivacy) or when the observer sets their observation to "obscured." For obscured observations, the `geojson` in the API response contains the center of a 0.2° × 0.2° bounding box (~22km × ~14km at Washington's latitude), not the true collection site.

Since Washington Bee Atlas volunteers collect physical specimens, the true GPS coordinates are important for mapping where sampling effort has occurred. An obscured marker placed in the center of a 0.2° box could be 10km away from the actual collection site.

For the Washington Bee Atlas project, bee taxa are generally not at-risk species so taxon-based auto-obscuration should be rare. However, individual observers may have personally set their observations to "obscured" for privacy reasons.

**Why it happens:** iNaturalist's coordinate obscuration protects sensitive species locations and observer privacy. The API returns the obscured centroid as the public-facing coordinate. Accessing true coordinates requires authenticated requests with specific trust grants from the observer.

**Consequences:** Sample markers appear in incorrect locations (potentially in water or wrong county). Volunteers trying to revisit a collection site cannot use the map to navigate there.

**Prevention:**
1. Accept that some observations will have obscured coordinates and map them as-is with the obscured centroid.
2. In the UI, add a visual indicator (e.g., a dashed circle or different marker style) for observations where `positional_accuracy` in the API response is unusually large (>10,000 meters indicates obscuration).
3. The API response includes `public_positional_accuracy` — values around 28,000–30,000 meters indicate the 0.2° obscured bounding box. Use this field to flag obscured observations.
4. Do not attempt to access true coordinates through the API without OAuth authentication and explicit observer permission grants — this would require storing secrets and adds significant complexity.

**Detection:** Check `public_positional_accuracy` in the sample observation JSON (`300847934.json` shows `"public_positional_accuracy": 42`, indicating that observation is not obscured). Observations with `public_positional_accuracy > 10000` are likely obscured.

**Phase:** INAT-03 (samples.parquet production), MAP-03 (marker rendering)

---

### Pitfall 14: Data Staleness — Static Build Means iNat Data Is Frozen at Build Time

**What goes wrong:** The static pipeline architecture means `samples.parquet` reflects the state of iNaturalist at the time of the last CI run that produced the file. New observations added after the build are invisible until the next build.

The current CI workflow triggers on every push to any branch. This means:
- A code-only change (frontend CSS fix) triggers a full data pipeline run, re-fetching iNat data unnecessarily.
- If the pipeline is later separated (code pushes don't re-fetch data), the Parquet could grow stale over weeks.

For a volunteer project, there's an expectation gap: a volunteer submits their iNaturalist observation today, then checks the Bee Atlas map tomorrow expecting to see it — but the map shows last week's data.

**Why it happens:** Static hosting with Parquet bundling is a deliberate architectural choice that trades real-time freshness for simplicity and zero server costs. The tradeoff is not free.

**Consequences:** Volunteer experience: "I submitted my collection but it's not on the map." This erodes trust in the tool even though the system is working correctly.

**Prevention:**
1. Display the data freshness date on the map UI (e.g., "Sample data as of 2026-02-25"). Store this as metadata in `samples.parquet` or as a separate file.
2. Schedule a daily or weekly CI run that runs the data pipeline regardless of code changes. GitHub Actions `schedule:` trigger with a cron expression handles this.
3. Set volunteer expectations in project documentation: "The map updates daily" or "updates weekly" depending on the schedule chosen.

**Detection:** Not a technical failure — a user experience issue. The map will always show some historical snapshot. The question is how old.

**Phase:** INAT-01 (CI scheduling), MAP-03/MAP-04 (UI freshness indicator)

---

## Moderate Pitfalls

---

### Pitfall 15: CDK Bootstrap Required Before First Deploy

**What goes wrong:** CDK requires a one-time `cdk bootstrap` to create the `CDKToolkit` stack in the target AWS account/region before any CDK deployment can run. The bootstrap stack creates an S3 bucket for staging assets and an ECR repository. Without it, `cdk deploy` fails with `This stack uses assets, so the toolkit stack must be deployed to the environment`.

In a fresh AWS account or new region, this step is not part of the normal CI pipeline and must be done manually once. If it's not documented, the next person to set up the account has no idea why deploys fail.

**Prevention:**
1. Document the one-time setup steps (bootstrap + OIDC identity provider creation) in the project README or `infra/README.md`.
2. The OIDC identity provider (`token.actions.githubusercontent.com`) also must be created once in the AWS account — it is not created by CDK by default unless you add it to the CDK stack.

**Detection:** `cdk deploy` exits with "bootstrap" error message; easy to identify once you know to look for it.

**Phase:** Infrastructure setup

---

### Pitfall 16: CDK Stack Name Collisions During Iteration

**What goes wrong:** If you iterate on the CDK stack during development (rename a construct, change a logical ID, or change a resource type), CDK may attempt to replace the resource, which requires deleting the old one first. For S3 buckets, deletion requires the bucket to be empty. CDK will fail with `BucketNotEmpty` unless `removalPolicy: RemovalPolicy.DESTROY` and `autoDeleteObjects: true` are set — but these are dangerous in production.

Renaming a CloudFront distribution's logical ID causes CloudFront to be destroyed and recreated, which takes 15–20 minutes and changes the distribution domain name (breaking DNS).

**Prevention:**
1. Use stable logical IDs from the start. Avoid auto-generated names — explicitly set `id` parameters on constructs you might rename.
2. For the S3 bucket, set `removalPolicy: RemovalPolicy.RETAIN` in production to prevent accidental deletion.
3. Don't rename CDK resources after the first deploy without checking the `cdk diff` output for "Replacement" indicators.

**Detection:** `cdk diff` output shows `[-] Delete` followed by `[+] Create` for the same resource type — this is a replacement, not an update.

**Phase:** Infrastructure setup

---

### Pitfall 17: Parquet Column Type Drift Between Pipeline Runs

**What goes wrong:** The project currently has duplicate dtype specifications (`ECDYSIS_DTYPES` in `download.py` and the dtype dict in `ecdysis/occurrences.py`; same for OSU Museum data). When one is updated but not the other, the same column has different types in different Parquet outputs. The frontend (`parquet.ts`) then receives unexpected types (e.g., a column that was `int64` is now `string`) causing silent NaN coordinates or JavaScript type errors.

This is a pre-existing issue that becomes a CI/CD pitfall: automated pipeline runs will succeed even with wrong types, producing a deployed site with broken or missing map points.

Adding `samples.parquet` introduces a third schema that must be kept consistent: `observation_id` (int64), `observer` (string), `date` (string ISO8601), `lat` (float64), `lon` (float64), `specimen_count` (nullable Int64).

**Prevention:**
1. Consolidate dtype specs into a single source of truth before wiring up CI.
2. Add a schema validation step in the pipeline: after writing Parquet, read back the schema with `pyarrow.parquet.read_schema()` and assert expected column names and types.
3. Add a frontend assertion: if `parquet.ts` receives a row where `latitude` or `longitude` is not a finite number, skip it (null guard) and report a warning to the console.

**Detection:** Deploy succeeds but fewer points appear on the map. Check browser console for NaN coordinate warnings. In CI, compare `pyarrow.parquet.read_schema(output).to_arrow_schema()` against a committed expected schema file.

**Phase:** Data pipeline fixes (pre-CI work)

---

### Pitfall 18: S3 Deploy Scope — Deleting Files Not in Current Build

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

### Pitfall 19: OpenLayers CSS Version Drift

**What goes wrong:** `bee-map.ts` loads OpenLayers CSS from jsDelivr CDN with a pinned version (`ol@v10.8.0`) that differs from the installed package version (`^10.7.0`). When `ol` is upgraded via `npm update`, the CDN link is not automatically updated. CSS changes between versions (rare but possible) cause visual regressions.

**Prevention:** Import the CSS through Vite's module system: `import 'ol/ol.css'` in the component or entry point. Vite bundles it with the correct version. Remove the CDN `<link>` tag.

**Phase:** Frontend cleanup (pre-feature work)

---

### Pitfall 20: pdb.set_trace() in Production Code Path

**What goes wrong:** `data/ecdysis/occurrences.py` line 95 has `import pdb; pdb.set_trace()` inside `to_parquet()`. A CI job running this function will hang indefinitely waiting for debugger input, consuming GitHub Actions minutes until the job timeout kills it.

**Prevention:** Remove before wiring up CI. This is documented in CONCERNS.md. It must be the first fix applied before any CI work.

**Detection:** CI job hangs with no output after the "Writing to parquet" log line, then times out after 6 hours (default GHA timeout).

**Phase:** Data pipeline fixes (blocking, must fix first)

---

### Pitfall 21: Python 3.14 Availability in GitHub Actions Runners

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

### Pitfall 22: Ecdysis POST Download Returns Empty or Error Silently

**What goes wrong:** The Ecdysis download uses a POST request to a Symbiota portal endpoint. Symbiota portals can return HTTP 200 with an error HTML page (not a zip file) if the query parameters are wrong or the server is overloaded. The current code checks `response.raise_for_status()` but does not validate that the response is actually a zip file before writing it to disk.

In CI, if the Ecdysis server is temporarily down or the POST parameters change (Symbiota version updates occasionally change the download handler), the pipeline writes an HTML error page as a `.zip` file, which then fails to open with `zipfile.ZipFile`. The error message is obscure: `BadZipFile: File is not a zip file`.

**Prevention:**
1. After the POST response, check `response.headers['Content-Type']` — it should be `application/zip` or `application/octet-stream`. If it's `text/html`, raise a descriptive error before writing.
2. Log the response size: an error HTML page is usually a few KB; a real data zip is several MB.

**Detection:** CI fails with `BadZipFile` on the Ecdysis processing step. Inspect the saved `.zip` file — if it's readable text (HTML), the POST failed silently.

**Phase:** Data pipeline (download reliability)

---

### Pitfall 23: iNaturalist API v1 vs v2 — Stability and Field Availability

**What goes wrong:** iNaturalist operates two API versions simultaneously: v1 (stable, widely used) and v2 (in development, eventual replacement). The v2 API uses JWT authentication (tokens expire in 24 hours) and has different endpoint structures. Some fields available in v1 responses may not yet be in v2, and vice versa.

For read-only project observation queries (the v1.1 use case), v1 is appropriate and stable. But if code is written against v2 endpoints during development (because v2 docs appear more current), it may use authentication flows that require a JWT refresh loop, adding complexity.

**Prevention:**
- Use the v1 API (`api.inaturalist.org/v1/observations`) for read-only project observation queries. The v1 API does not require authentication for public data.
- Do not use the v2 API unless a specific feature requires it (v2 has different field availability).
- Set a custom `User-Agent` header as recommended by iNaturalist's API Recommended Practices.

**Detection:** 401 Unauthorized responses indicate an authenticated endpoint was used for a public-data request, or a v2 endpoint without a valid JWT.

**Phase:** INAT-01 (pipeline querying)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| CDK S3+CloudFront setup | OAI vs OAC API confusion; bucket policy not auto-applied | Use `S3BucketOrigin.withOriginAccessControl()`; verify bucket policy after deploy |
| CDK first deploy | Bootstrap not run; OIDC identity provider missing | Document one-time setup in infra README |
| GitHub Actions OIDC | Subject claim mismatch; missing `aud` condition | Use `StringLike` with wildcard first; add `environment:` to workflow only if trust policy requires it |
| GitHub Actions deploy | CloudFront cache not invalidated | Always run `create-invalidation` after s3 sync |
| GitHub Actions deploy | `--delete` wipes Parquet data files | Use `--exclude "data/*"` or separate S3 paths |
| iNat INAT-01: project query | Using `place_id` instead of `project_id` fetches wrong observations | Use `project_id=166376`; verify result spot-checks against known WaBA observers |
| iNat INAT-01: project query | API v1 vs v2 endpoint confusion; JWT auth complexity | Use v1 for read-only; no auth needed |
| iNat INAT-01: CI integration | Second external HTTP dependency blocks deploys | Commit fallback `samples.parquet`; separate data pipeline from code builds |
| iNat INAT-01: CI integration | Rate limiting across concurrent runs | Use pyinaturalist with rate limiting; set custom User-Agent; cache weekly |
| iNat INAT-02: field extraction | `observation_field_values` absent from response | Request `fields=all` in API call; verify raw response before parsing |
| iNat INAT-02: field extraction | Observation field identified by numeric ID not name | Look up field ID from a real WaBA observation; store as constant |
| iNat INAT-02: specimen count | Many observations have no specimen count (voluntary field) | Treat as nullable; distinguish null from explicit 0 in UI |
| iNat INAT-03: coordinates | Obscured coordinates off by up to 20km | Use `public_positional_accuracy` to flag; accept imprecision |
| iNat INAT-03: data size | > 10,000 observations hits hard API cap | Check `total_results`; fail loudly; use `id_above` if limit exceeded |
| iNat MAP-03/MAP-04: freshness | Static build means data frozen at build time | Display freshness date in UI; schedule daily data pipeline run |
| Python data pipeline | `pdb.set_trace()` hangs CI | Remove before any CI wiring |
| Python data pipeline | Python 3.14 not pre-installed | Explicit `setup-python@v5` with `python-version: "3.14"` |
| Python data pipeline | Parquet schema drift across sources | Consolidate dtype specs; add schema assertion step; document `samples.parquet` schema |
| Python data pipeline | Ecdysis POST returns HTML as zip | Validate `Content-Type` before writing zip to disk |
| Vite build | Large Parquet files in build artifacts | Consider separate S3 path for data files; set `assetsInlineLimit: 0` |
| Frontend: filtering | Null coordinate crash | Guard `fromLonLat` calls with null check (pre-existing bug) |

---

## Sources

- Direct code audit of this repository, including `data/inat/projects.py`, `data/inat/observation/300847934.json`, `scripts/build-data.sh`, `.github/workflows/deploy.yml` (HIGH confidence for project-specific findings)
- [iNaturalist API Recommended Practices](https://www.inaturalist.org/pages/api+recommended+practices) — rate limits (100 req/min), User-Agent recommendation, pagination guidance, 10K hard cap (MEDIUM confidence — WebSearch-verified, consistent with pyinaturalist documentation)
- [iNaturalist API v1 Documentation](https://api.inaturalist.org/v1/docs/) — endpoint reference, authentication requirements (MEDIUM confidence)
- [pyinaturalist documentation](https://pyinaturalist.readthedocs.io/) — pagination, rate limiting behavior, `fields` parameter (MEDIUM confidence)
- [Understanding Projects on iNaturalist](https://help.inaturalist.org/en/support/solutions/articles/151000176472-understanding-projects-on-inaturalist) — collection vs traditional project differences, observation field requirements, coordinate access (MEDIUM confidence)
- [iNaturalist "project members only" collection project feature](https://www.inaturalist.org/blog/32525-new-feature-project-members-only-setting-on-collection-projects) — membership filtering behavior (MEDIUM confidence)
- [iNat forum: observation field values in API responses](https://forum.inaturalist.org/t/include-project-observation-fields-when-using-api/30506) — fields absent by default (MEDIUM confidence)
- [iNat forum: API pagination 10K limit](https://forum.inaturalist.org/t/impossible-to-search-old-pages-due-to-limit-of-10000/42240) — confirmed hard cap behavior (MEDIUM confidence)
- [iNat scheduled downtime announcements](https://forum.inaturalist.org/t/scheduled-downtime-february-11-12-for-1-hour/75529) — confirmed iNat has maintenance windows (MEDIUM confidence)
- Observation field ID vs name distinction: [iNat forum thread](https://forum.inaturalist.org/t/query-api-by-observation-field-or-observation-field-value/39719) — web URL uses names, JSON API uses numeric IDs (MEDIUM confidence)
- AWS CDK v2 documentation on `S3BucketOrigin.withOriginAccessControl()` (MEDIUM confidence — training data August 2025)
- GitHub Actions OIDC documentation (MEDIUM confidence — training data August 2025)
- OpenLayers v10 rendering performance: training data (MEDIUM confidence — verify with OL v10 release notes)
