# Domain Pitfalls

**Domain:** Static biodiversity map with CI/CD deploy (S3+CloudFront, GitHub Actions OIDC, Python data pipeline, client-side Parquet)
**Researched:** 2026-02-18 (v1.0); 2026-02-25 (v1.1 iNat API integration addendum); 2026-03-10 (v1.2 iNat pipeline — pipeline-only scope)
**Confidence:** MEDIUM — CDK/GHA/OpenLayers from training data (August 2025 cutoff); iNaturalist limits from pyinaturalist docs + training; project-specific bugs from direct code audit (HIGH)

---

## Critical Pitfalls

Mistakes that cause rewrites, broken deploys, or silent data loss.

---

### Pitfall 1: CloudFront Serving Stale Files After S3 Deploy

**What goes wrong:** After `aws s3 sync` copies new files to S3, CloudFront continues serving the previous version from its edge cache. Users see old data or old JS bundles. With Vite's content-hashed assets (`main-Abc123.js`), JS/CSS files self-invalidate on filename change — but `index.html` is NOT content-hashed and will cache stale. Also any Parquet data files served at stable paths (e.g., `ecdysis.parquet`, `samples.parquet`) cache without invalidation.

**Why it happens:** CloudFront TTL defaults to 24 hours for objects that don't set `Cache-Control`. S3 sync puts the file; CloudFront doesn't know.

**Consequences:**
- Users load new `index.html` (correctly) but it references old hashed bundles that no longer exist on S3 → 404 on JS assets
- Or users load old `index.html` that references new hashed bundles → same 404
- Data files silently serve last run's Parquet until TTL expires

**Prevention:**
1. After every `aws s3 sync`, run `aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"` (or at minimum `/index.html` and `/assets/*.parquet`).
2. Set `Cache-Control: no-cache` on `index.html` in S3 metadata; set long TTL on hashed assets.
3. In GitHub Actions, store the CloudFront distribution ID in a secret or CDK output, not hardcoded.

**Warning signs:** After deploy, `curl -I https://your-domain/` and check `x-cache: Hit from cloudfront` on a known-changed file. If it says HIT, invalidation didn't run.

**Phase to address:** Infrastructure setup (CDK + GHA deploy workflow)

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

**Warning signs:** CloudFront returns 403. Check S3 bucket policy: does it have an `Allow` statement with `Principal: {"Service": "cloudfront.amazonaws.com"}` and `Condition: {"StringEquals": {"aws:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/DIST_ID"}}`? If not, CDK didn't apply it.

**Phase to address:** Infrastructure setup (CDK)

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

**Warning signs:** `aws sts get-caller-identity` in the Actions step will fail with the AssumeRole error. Print `github.ref` and `github.repository` in a debug step to verify the subject you're generating.

**Phase to address:** CI/CD setup (GitHub Actions workflow)

---

### Pitfall 4: Vite Inlines or Hashes Parquet Files Incorrectly

**What goes wrong:** Vite treats `?url` imports (like `import ecdysisDump from './assets/ecdysis.parquet?url'`) as static asset URLs. By default Vite copies assets under 4KB inline as base64 data URIs, and assets over the threshold get content-hashed filenames. For Parquet files, the size threshold is always exceeded, so they get hashed names. This is actually fine for a single Parquet file.

The problems arise when:

1. **Parquet file grows too large for the Vite build to handle in CI**: If `samples.parquet` adds further rows over successive pipeline runs, the Vite build copies it into `dist/assets/` on every build. This is slow and bloats the git-tracked build artifact if `dist/` is ever committed.

2. **Multiple Parquet files with different update cadences**: `ecdysis.parquet` (updated monthly) and `samples.parquet` (updated more frequently) are separate files, each needing its own cache-busting URL. Managing multiple large binary assets through Vite adds friction.

3. **hyparquet's `asyncBufferFromUrl` requires HTTP range requests**: The library uses HTTP `Range` headers to read Parquet row groups without fetching the full file. CloudFront supports range requests by default. If the Parquet file is served from a CDN or proxy that strips `Range` headers, hyparquet falls back to fetching the entire file — which works but defeats the purpose of columnar partial reads.

**Consequences:** Slow builds, large `dist/` directories, potential CI timeouts on large file copies. Range request stripping causes full-file fetches (not a correctness bug, but a performance regression).

**Prevention:**
1. Set `assetsInlineLimit: 0` in `vite.config.ts` to prevent any inlining of binary assets.
2. Keep Parquet files out of `dist/` by serving them from a separate S3 path, not bundled as Vite assets. The frontend fetches them by a stable URL. Vite only bundles JS/CSS/HTML.
3. For large data files: place them in S3 under a separate prefix (e.g., `data/ecdysis.parquet`), not in the CloudFront-served `dist/` prefix, and reference them by absolute URL or environment variable.
4. Verify CloudFront passes `Range` headers: check the cache policy — the default "CachingOptimized" policy allows range requests to pass through. If using a custom cache policy, explicitly allow range requests.

**Warning signs:** In the network panel, if the Parquet fetch is a single 200 response (not 206 Partial Content), range requests are not being used. For a 5 MB file this is acceptable; for 50 MB it is not.

**Phase to address:** Infrastructure setup + frontend feature work

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

**Warning signs:** After fetching, assert `len(results) == response['total_results']` and log a warning when `total_results > 10_000`.

**Phase to address:** INAT-01 (pipeline querying)

---

### Pitfall 6: OpenLayers VectorLayer Performance Degrades Non-Linearly Above ~10K Points

**What goes wrong:** OpenLayers' default `VectorLayer` renders features on a canvas, re-rendering the full layer on every map interaction (pan, zoom, resize). The current code loads all 45K Ecdysis specimens at once with `strategy: all`. With ~45K points this is borderline; adding future sample markers from `samples.parquet` could approach the limit.

The rendering bottleneck is not fetching (hyparquet partial reads help there) but canvas drawing: each feature is individually styled and painted.

**Consequences:** Map feels sluggish or unresponsive, especially on mobile. Zooming becomes janky. On low-end devices the browser may skip frames entirely.

**Prevention:**
1. Enable clustering using `ol/source/Cluster` wrapping the `VectorSource`. Clustering already exists in the codebase.
2. Use `WebGLPointsLayer` instead of `VectorLayer` for large point datasets. OpenLayers v10 supports this and handles 500K+ points. The tradeoff is that click interaction requires a `HitDetection` layer or manual coordinate math.
3. Separate concerns: use `WebGLPointsLayer` for rendering all points (fast), and a separate thin `VectorLayer` for selected/highlighted features (few features, full interaction support).

**Warning signs:** Open Chrome DevTools Performance tab, record while panning. If frame time during a pan exceeds 16ms (60 fps threshold), the render path is a bottleneck.

**Phase to address:** Future frontend feature work (deferred from v1.2 — v1.2 is pipeline-only)

---

## v1.2 iNat Pipeline — Critical Pitfalls

These pitfalls are specific to adding the iNaturalist API pipeline (INAT-01, INAT-02, INAT-03) to the existing static pipeline project.

---

### Pitfall 7: Observation Field Values Are Absent Unless Explicitly Requested

**What goes wrong:** The iNaturalist API v1 observation response does NOT include `observation_field_values` by default. Fetching `/v1/observations?project_id=166376` returns observations without any observation field data, even if the observer entered a specimen count field. The field simply does not appear in the JSON response.

Confirmed by the sample observation JSON in `data/inat/observation/300847934.json`: the response contains `uuid`, `id`, `geojson`, `user`, `taxon`, and `observation_photos` — but no `observation_field_values` key at all. This is the v2 API format; the v1 endpoint uses `ofvs` as the key.

**Why it happens:** Observation field values are a separate data payload that the API must be instructed to include. Without the correct parameter, the server omits them to reduce response size.

**Consequences:** The pipeline receives valid-looking observations with no specimen count data. `specimen_count` column in `samples.parquet` is populated entirely with nulls/zeros.

**Prevention:**
- When using the iNaturalist API v1 `/observations` endpoint, include the `fields` parameter or use `extra=fields` to request observation field values. The exact parameter syntax is `fields=all` or selectively requesting `observation_field_values` as a field specification.
- Verify the response contains `ofvs` (v1) or `observation_field_values` (v2) before extracting specimen count. Log a warning if the key is missing.
- Use pyinaturalist's `get_observations()` with `fields='all'` to include observation field values in the response.

**Warning signs:** Inspect a raw API response for a known observation (e.g., ID 300847934) that has a specimen count field. If `ofvs` / `observation_field_values` is not in the JSON, the request is missing the fields parameter.

**Phase to address:** INAT-02 (specimen count extraction)

---

### Pitfall 8: Observation Field IDs Are Numeric, Not Name Strings

**What goes wrong:** Observation fields in iNaturalist are identified by numeric integer IDs (e.g., field ID 12345), not by their human-readable name ("Specimen Count" or similar). The web interface uses name-based URL search (`field:Specimen Count=yes`), which does not translate directly to the API.

When parsing `ofvs` from the API response, the field is identified by `observation_field_id` (numeric) and may include a `name` (string). Filtering by field name string works when parsing the response, but:

1. Field names are case-sensitive and can change (a curator renames the field).
2. Multiple projects may have observation fields with identical names but different IDs.
3. The Washington Bee Atlas project has a specific specimen count field. Its numeric ID must be verified from a real API response or the iNaturalist observation fields page, not assumed.

The project file `data/inat/projects.py` shows project ID 166376 for Washington, but does not document which observation field ID corresponds to "specimen count."

**Why it happens:** iNaturalist's observation field system is globally shared — any user can create a field with any name. The same concept (specimen count) may have dozens of different field IDs across different projects.

**Consequences:** Pipeline silently skips the specimen count field if it filters by wrong field name or ID. All observations report 0 specimens.

**Prevention:**
1. Identify the specific observation field ID used by the Washington Bee Atlas project for specimen count by fetching a known observation with a specimen count entered, and extracting the field ID from `ofvs`.
2. Store the field ID as a named constant in the pipeline code, not as a string match on field name.
3. Log all distinct observation field names and IDs found in the fetched observations to aid debugging.
4. If matching by name is necessary as fallback, match case-insensitively and log when a match is found.

**Warning signs:** Fetch a single observation where you know a specimen count was entered (ask a WaBA volunteer for a specific observation URL). Inspect the `ofvs` array and record the field ID for the specimen count field.

**Phase to address:** INAT-02 (specimen count extraction)

---

### Pitfall 9: Collection Project vs Traditional Project — Observation Field Implications

**What goes wrong:** The Washington Bee Atlas iNaturalist project (ID 166376) is almost certainly a collection project (iNaturalist's modern project type), not a traditional project. This distinction matters for observation field handling:

- **Collection projects** cannot *require* observation fields. Fields are voluntary add-ons by individual observers.
- **Traditional projects** can require observation fields as membership conditions.

For a collection project, many observations will simply not have a specimen count field value entered, even if the project coordinator instructs volunteers to do so. The API will return observations with an empty `ofvs` array.

Additionally, collection project access through the API does not grant access to private/obscured coordinates for project curators. Observations by volunteers who collect in sensitive areas may have obscured GPS coordinates (±0.2 degree bounding box instead of exact location), reducing map accuracy.

**Why it happens:** Collection projects are the newer iNaturalist project type designed for automatic aggregation. The trade-off is less control over required fields and no privileged coordinate access.

**Consequences:**
- `specimen_count` will be null for a significant fraction of observations (potentially >50% of early-stage project observations).
- Map markers may appear offset by up to ~20km for obscured observations (relevant when map display is added in v1.3+).
- The `samples.parquet` schema must treat `specimen_count` as nullable from the start.

**Prevention:**
1. Design the pipeline and schema to treat `specimen_count` as nullable (allow null/None), not 0 as default.
2. Confirm the project type by visiting `api.inaturalist.org/v1/projects/166376` — the `project_type` field will be `"collection"` or `"traditional"`.
3. For obscured coordinates, use the center of the obscured bounding box as returned by the API (this is what the API provides as `geojson`). Document this known imprecision.

**Warning signs:** Fetch 10 observations from the project. Count how many have non-empty `ofvs`. If most are empty, the volunteer adoption of the specimen count field is low and the schema must handle null gracefully.

**Phase to address:** INAT-02 (specimen count extraction), INAT-03 (schema design)

---

### Pitfall 10: project_id Filtering Returns Wrong Observations

**What goes wrong:** iNaturalist has two distinct ways to scope observations to a project:

1. `project_id=166376` — Returns observations associated with the project. For collection projects, this means observations matching the project's automatic filters (taxa, place, date, etc.). For traditional projects, this means observations manually added by members.
2. Place-based filtering (`place_id=14` for Washington state) — Returns all observations in a place regardless of project membership.

For a collection project, `project_id` filtering is the correct approach — it applies the project's configured filters automatically. However:

- If the project has a "project members only" setting enabled (a feature iNaturalist added for collection projects), `project_id` will only return observations from users who joined the project.
- If the project coordinator changes the project's filter criteria (e.g., adds a new taxon filter), the API results change retroactively without any notification.
- The API may return a `per_page` default of 30 even when `per_page=200` is requested in some edge cases (confirmed as a historical bug in the iNaturalist forum; workaround is to explicitly set `per_page`).

**Consequences:** If using place-based filtering instead of project-based filtering, the pipeline fetches all Washington bee observations (not just WaBA volunteers), producing a `samples.parquet` with tens of thousands of irrelevant observations and no specimen count data.

**Prevention:**
1. Use `project_id=166376` (not `place_id=14`) as the primary filter for the Washington Bee Atlas.
2. Explicitly set `per_page=200` and verify the response `per_page` matches what was requested.
3. Log the total observation count per run to detect unexpected spikes or drops caused by project configuration changes.

**Warning signs:** Fetch observations with `project_id=166376` and spot-check 5 observations: do the observer names match known WaBA participants? Are there `ofvs` entries for specimen counts? If results look wrong, compare with fetching `place_id=14&taxon_name=Anthophila` (all Washington bees) to see if you're getting project-specific vs. general data.

**Phase to address:** INAT-01 (pipeline querying)

---

### Pitfall 11: CI Build Fails When iNaturalist API Is Down (Compounding the Existing Ecdysis Problem)

**What goes wrong:** The existing `build-data.sh` already makes a live HTTP POST to ecdysis.org on every `npm run build`. The v1.2 milestone adds a second external HTTP dependency: the iNaturalist API. The current workflow has no fallback — if ecdysis.org is down, the build fails. Adding iNat API creates a second independent failure point.

The deploy workflow runs `npm run build` twice (once in the `build` job, once in the `deploy` job). Both calls run `build-data.sh`, meaning both jobs make HTTP requests to both ecdysis.org and api.inaturalist.org. If either external service is down during any of these four HTTP calls, the deploy fails.

iNaturalist does have scheduled maintenance windows (as confirmed by community forum announcements). A scheduled iNaturalist downtime during a CI run that happens to be pushing a code change will block deployment of unrelated frontend fixes.

**Why it happens:** The pipeline has no separation between "fetch external data" and "build from cached data." Every build triggers a fresh data fetch. This is the existing known tech debt for the Ecdysis pipeline, now doubled.

**Consequences:** Unrelated code changes (CSS fix, typo correction) fail CI because iNaturalist is temporarily down. Deployment is blocked. The team has no way to deploy without fixing the data pipeline.

**Prevention:**
1. Commit a fallback `samples.parquet` alongside the existing committed `ecdysis.parquet`. The build script uses the committed file if the API call fails.
2. Separate the data pipeline from the frontend build in CI: add a scheduled job (e.g., daily or weekly) that runs the data pipeline and commits updated Parquet files, separate from the push-triggered build job. The push-triggered job only runs the frontend build against the most recently committed Parquet.
3. Add timeout and retry logic to the iNat API fetch.
4. If the iNat API returns a 5xx or times out, use the last committed `samples.parquet` and log a warning rather than failing the build.

**Warning signs:** A CI run fails with a connection error or HTTP 5xx pointing to api.inaturalist.org. If a committed fallback exists, the build should have used it instead of failing.

**Phase to address:** INAT-01, CI/CD (data pipeline separation)

---

### Pitfall 12: iNaturalist API Rate Limiting in CI Across Concurrent Runs

**What goes wrong:** The iNaturalist API enforces a limit of approximately 100 requests/minute for unauthenticated requests (iNaturalist's recommended target is 60/minute to be safe). GitHub Actions runs may execute concurrently on push events that occur close together (e.g., several commits pushed quickly, or a PR merge followed by a hotfix). Multiple CI runs making parallel API requests from the same IP can trigger throttling.

iNaturalist returns HTTP 429 when rate limited. The pipeline currently has no retry logic on 429 responses. pyinaturalist does handle rate limiting by default when used with its `ClientSession`, but bare `requests` calls do not.

**Why it happens:** GitHub Actions runners in the same region share a pool of outbound IP addresses. Multiple CI runs appear to come from the same IP to iNaturalist's rate limiter.

**Consequences:** Intermittent CI failures with HTTP 429. The `samples.parquet` is not produced. If there is no fallback, the build fails.

**Prevention:**
1. Use pyinaturalist rather than raw `requests` calls. pyinaturalist's built-in rate limiting respects iNaturalist's recommended practices by default.
2. Cache the iNaturalist Parquet output in GitHub Actions with a weekly cache key using `actions/cache`. Only re-fetch when the cache misses: `key: inat-samples-${{ steps.date.outputs.week }}`.
3. Set a custom `User-Agent` header identifying the application (e.g., `User-Agent: WashingtonBeeAtlas/1.2 (github.com/rainhead/beeatlas)`). iNaturalist's recommended practices call this out specifically — it allows them to contact you if there's a problem rather than silently blocking.
4. Add `time.sleep(1)` between pages (1 request/second = 60 requests/minute, safely below the limit).

**Warning signs:** CI logs show HTTP 429 from api.inaturalist.org. pyinaturalist with `ClientSession` will log rate limit backoff automatically.

**Phase to address:** INAT-01, CI/CD setup

---

### Pitfall 13: iNat API Response Coordinate Is Obscured Centroid, Not True Location

**What goes wrong:** iNaturalist automatically obscures coordinates for observations of at-risk species (taxon geoprivacy) or when the observer sets their observation to "obscured." For obscured observations, the `geojson` in the API response contains the center of a 0.2° × 0.2° bounding box (~22km × ~14km at Washington's latitude), not the true collection site.

Since Washington Bee Atlas volunteers collect physical specimens, the true GPS coordinates are important for mapping where sampling effort has occurred. An obscured marker placed in the center of a 0.2° box could be 10km away from the actual collection site.

For the Washington Bee Atlas project, bee taxa are generally not at-risk species so taxon-based auto-obscuration should be rare. However, individual observers may have personally set their observations to "obscured" for privacy reasons.

**Why it happens:** iNaturalist's coordinate obscuration protects sensitive species locations and observer privacy. The API returns the obscured centroid as the public-facing coordinate.

**Consequences (for pipeline — v1.2 stores coordinates in samples.parquet):** Coordinates stored in `samples.parquet` may be offset by up to 10km for obscured observations. This is permanent once stored unless the pipeline re-fetches and updates. Map markers (v1.3+) may appear in incorrect locations.

**Prevention:**
1. Accept that some observations will have obscured coordinates and store them as-is with the obscured centroid.
2. Preserve `public_positional_accuracy` as a column in `samples.parquet` so future map display can flag obscured observations. Values around 28,000–30,000 meters indicate the 0.2° obscured bounding box.
3. Do not attempt to access true coordinates through the API without OAuth authentication and explicit observer permission grants.

**Warning signs:** Check `public_positional_accuracy` in API responses. The sample observation `300847934.json` shows `"public_positional_accuracy": 42`, indicating that observation is not obscured. Observations with `public_positional_accuracy > 10000` are likely obscured.

**Phase to address:** INAT-03 (samples.parquet schema — include positional_accuracy column for future use)

---

### Pitfall 14: Data Staleness — Static Build Means iNat Data Is Frozen at Build Time

**What goes wrong:** The static pipeline architecture means `samples.parquet` reflects the state of iNaturalist at the time of the last CI run that produced the file. New observations added after the build are invisible until the next build.

For a volunteer project, there's an expectation gap: a volunteer submits their iNaturalist observation today, then checks the Bee Atlas map tomorrow expecting to see it — but the map shows last week's data.

**Why it happens:** Static hosting with Parquet bundling is a deliberate architectural choice that trades real-time freshness for simplicity and zero server costs. The tradeoff is not free.

**Consequences:** Volunteer experience: "I submitted my collection but it's not on the map." This erodes trust in the tool even though the system is working correctly.

**Prevention:**
1. Display the data freshness date on the map UI (e.g., "Sample data as of 2026-03-10"). Store this as metadata in `samples.parquet` or as a separate file.
2. Schedule a daily or weekly CI run that runs the data pipeline regardless of code changes. GitHub Actions `schedule:` trigger with a cron expression handles this.
3. Set volunteer expectations in project documentation: "The map updates daily" or "updates weekly" depending on the schedule chosen.

**Warning signs:** Not a technical failure — a user experience issue. The question is how old the displayed data is.

**Phase to address:** INAT-01 (CI scheduling — schedule trigger for data pipeline)

---

### Pitfall 15: `build-data.sh` Integration — samples.parquet Not Copied to Frontend Assets

**What goes wrong:** The existing `build-data.sh` ends with `cp ecdysis.parquet "$REPO_ROOT/frontend/src/assets/ecdysis.parquet"`. When the iNat pipeline is added, it's easy to produce `samples.parquet` in `data/` but forget to also copy it to `frontend/src/assets/` (or the appropriate path for frontend consumption). The frontend build succeeds (it doesn't know about `samples.parquet` yet), but the pipeline's output is silently not deployed.

This is compounded by the fact that v1.2 deliberately defers map display — so there is no runtime test showing that the file is missing. The broken state won't manifest until v1.3+ tries to load `samples.parquet`.

**Why it happens:** The pipeline and frontend are loosely coupled through the `build-data.sh` script. Adding a new output requires explicitly updating the script's copy step, which is easy to overlook when the file isn't yet consumed.

**Consequences:** `samples.parquet` is produced locally but never deployed to S3. v1.3 integration work discovers the file is missing from the CDN.

**Prevention:**
1. Even in v1.2 (pipeline-only), verify the `build-data.sh` script copies `samples.parquet` to `frontend/src/assets/` (or wherever the frontend will import it from with `?url`).
2. Add an assertion to the pipeline script: after the copy step, verify the destination file exists and is non-zero bytes.
3. Verify the file appears in `frontend/dist/assets/` after `npm run build`.

**Warning signs:** After running `npm run build`, check whether `samples.parquet` appears in `frontend/dist/assets/`. If only `ecdysis.parquet` is there, the copy step was not added.

**Phase to address:** INAT-03 (samples.parquet production — must include CI copy step)

---

### Pitfall 16: pyinaturalist-convert Schema Mismatch with Pipeline's Column Expectations

**What goes wrong:** `pyinaturalist-convert` (version 0.7.4+ in `pyproject.toml`) is a separate library that converts pyinaturalist API response objects to various formats including DataFrames and Parquet. Its output column names and types follow its own conventions, which may differ from the `samples.parquet` schema the pipeline intends to produce (`observation_id`, `observer`, `date`, `lat`, `lon`, `specimen_count`).

For example, `pyinaturalist-convert` may produce a column named `user_login` where the pipeline expects `observer`, or it may produce a DateTime column where the pipeline expects ISO8601 string dates, or it may produce a float for `specimen_count` where the pipeline expects nullable Int64.

If the pipeline uses `pyinaturalist-convert` to shortcut the Parquet conversion without verifying the output schema, the resulting file has unexpected column names or types. The `hyparquet` frontend reads columns by name — if `observer` doesn't exist (because the column is named `user_login`), the UI silently receives `undefined` for every row.

**Why it happens:** `pyinaturalist-convert` is a convenience library that makes assumptions about output schema based on what pyinaturalist returns. These assumptions were not designed to match the beeatlas project's specific column naming conventions.

**Consequences:** Silent data absence in the frontend when trying to display observer names or other fields. Schema drift that's invisible until frontend integration in v1.3+.

**Prevention:**
1. After producing `samples.parquet`, read back the schema with `pyarrow.parquet.read_schema('samples.parquet')` and assert expected column names and types explicitly.
2. Define the expected `samples.parquet` schema as a constant (`SAMPLES_SCHEMA`) and validate against it before the copy step.
3. If using `pyinaturalist-convert`, verify its output columns with a small integration test before relying on it.

**Warning signs:** `pyarrow.parquet.read_schema('samples.parquet').names` doesn't include all of `['observation_id', 'observer', 'date', 'lat', 'lon', 'specimen_count']`.

**Phase to address:** INAT-03 (samples.parquet production — schema validation)

---

### Pitfall 17: uv Lockfile Drift When Adding Python Dependencies

**What goes wrong:** The project uses `uv` for Python dependency management. The `data/uv.lock` file is committed. When a new dependency is added to `data/pyproject.toml` (e.g., adding a new import or upgrading a transitive dependency), the lockfile must be regenerated with `uv lock`. If the developer adds the dependency but forgets to run `uv lock` and commit the updated lockfile, CI will fail with a lock file out of date error when `uv sync --frozen` (or equivalent) is used in the workflow.

For v1.2, the `pyinaturalist` and `pyinaturalist-convert` packages are already in `pyproject.toml`. However, any new dependencies added during pipeline development (e.g., `pydantic` validation models, additional parsing utilities) must be added to `pyproject.toml` and the lockfile regenerated.

**Why it happens:** uv generates a reproducible lockfile from `pyproject.toml`. If the lockfile is not committed after a dependency change, local development works (uv resolves fresh) but CI fails (uv expects the committed lock).

**Consequences:** CI fails with a clear error message, but the developer must re-run `uv lock`, re-commit, and re-push — an extra round trip. Confusing if the developer hasn't seen uv lockfile errors before.

**Prevention:**
1. Always run `uv lock` after modifying `data/pyproject.toml` and commit both files together.
2. In CI, use `uv sync` (which validates the lockfile) rather than `uv pip install`.
3. The `astral-sh/setup-uv@v5` action in the existing workflow already handles uv setup; ensure the CI step runs `cd data && uv sync` before any Python script invocation.

**Warning signs:** CI error: "lock file is outdated" or similar uv message. Local developer has no error because they ran `uv lock` but didn't commit.

**Phase to address:** INAT-01 (initial pipeline setup — first commit that adds iNat script)

---

### Pitfall 18: iNaturalist API v1 vs v2 — Stability and Field Availability

**What goes wrong:** iNaturalist operates two API versions simultaneously: v1 (stable, widely used) and v2 (in development, eventual replacement). The v2 API uses JWT authentication (tokens expire in 24 hours) and has different endpoint structures. The sample observation JSON in `data/inat/observation/300847934.json` was fetched from the v2 API (`api.inaturalist.org/v2/observations`) based on the `fieldspec` variable in the Makefile. Some fields available in v1 responses may not be in v2, and vice versa.

For read-only project observation queries, v1 is appropriate and stable. However, if the existing Makefile's v2 approach is extended for the main pipeline, the JWT authentication requirement adds complexity: JWTs expire in 24 hours, requiring a refresh mechanism in long-running or scheduled CI jobs.

**Why it happens:** v2 appears more "current" in documentation but is not production-stable for all use cases. The v2 API returns `ofvs` under a different structure than v1.

**Consequences:**
- Using v2 for bulk unauthenticated reads fails with 401 if a JWT is required
- `ofvs` field structure differs between v1 and v2 responses, causing parsing errors if switching between versions mid-development

**Prevention:**
- Use the v1 API (`api.inaturalist.org/v1/observations`) for read-only project observation queries. The v1 API does not require authentication for public data.
- Set a custom `User-Agent` header as recommended by iNaturalist's API Recommended Practices.
- Do not mix v1 and v2 response parsing logic in the same script.

**Warning signs:** 401 Unauthorized responses indicate an authenticated endpoint was used for a public-data request, or a v2 endpoint without a valid JWT.

**Phase to address:** INAT-01 (pipeline querying)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Committing `samples.parquet` as fallback build artifact | CI resilience when iNat API is down | Binary file grows over time; git history bloats; merges conflict on binary | Always — use `.gitattributes` to mark as binary; use shallow commits |
| String-matching observation field names instead of numeric IDs | Readable code | Silent failures if curator renames the field | Never — always store field ID as constant alongside the name for documentation |
| `page='all'` without total_results check | Simpler pagination code | Silent truncation at 10K records | Only if assert on total_results is added immediately after |
| Running full data pipeline on every push | Always-fresh data | Two external HTTP dependencies block every deploy | Never — separate data refresh from code deploy |
| Not validating `samples.parquet` schema after write | Simpler pipeline | Type drift catches silently; frontend gets wrong types | Never — add schema assertion; it's three lines of pyarrow |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| iNaturalist v1 API | Using `/v2/observations` for bulk read (JWT required) | Use `/v1/observations` with no auth for public project data |
| iNaturalist v1 API | Not requesting `ofvs` in observation payload | Add `fields='all'` or equivalent parameter to include observation field values |
| iNaturalist API | Using `place_id` instead of `project_id` for WaBA observations | Use `project_id=166376`; verify results against known WaBA observers |
| iNaturalist API | Relying on field name strings to find specimen count | Look up numeric field ID from a real WaBA observation; store as constant |
| iNaturalist API | Using per_page default (30) | Explicitly set `per_page=200`; verify response per_page matches |
| pyinaturalist-convert | Assuming output column names match target schema | Read back schema with pyarrow after conversion; assert against expected column list |
| build-data.sh | Adding pipeline output without adding cp step | Verify `samples.parquet` appears in `frontend/dist/assets/` after full build |
| uv | Modifying pyproject.toml without updating lockfile | Run `uv lock` and commit both files together |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Standard page/per_page pagination to 10K+ records | Silent truncation with no error | Check total_results; use id_above for >10K | When WaBA exceeds ~10K project observations |
| Full data pipeline re-fetch on every push | External API down = deploy blocked | Separate scheduled data job from push-triggered build | Day 1 if iNat has a maintenance window during a push |
| No User-Agent header on API requests | IP silently throttled or blocked | Set descriptive User-Agent per iNat recommended practices | When CI runs frequently from shared GitHub runner IP pool |
| Fetching all observation details without per_page=200 | 3-7x more API requests than necessary | Always request per_page=200 | Immediately — any project with >30 observations |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Hardcoding iNaturalist API credentials (if auth ever needed) | Credential exposure in git history | Use GitHub Actions secrets; never commit tokens |
| Over-broad OIDC trust policy (repo:*) left in production | Any workflow in the repo can assume the deploy role | Tighten trust policy after initial deploy confirmation |
| `aws s3 sync --delete` without exclusions | Data Parquet files deleted on frontend-only deploys | Use `--exclude "data/*"` or separate S3 paths for data vs frontend assets |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **iNat pipeline (INAT-01):** Script fetches observations, but `samples.parquet` is not copied to `frontend/src/assets/` — verify copy step in `build-data.sh`
- [ ] **iNat pipeline (INAT-01):** Script works locally, but CI has no uv setup step for `data/` directory — verify workflow runs `cd data && uv sync` before Python scripts
- [ ] **iNat pipeline (INAT-02):** Specimen count column exists in parquet, but is all-null — verify `ofvs` parameter is included in API request and field ID constant matches actual WaBA field
- [ ] **iNat pipeline (INAT-03):** `samples.parquet` file produced, but schema doesn't match expected — verify with `pyarrow.parquet.read_schema()` assertion
- [ ] **iNat pipeline (INAT-03):** Pipeline succeeds in CI, but `samples.parquet` is not deployed to S3 — verify it appears in `dist/assets/` and that `aws s3 sync` doesn't exclude it
- [ ] **10K limit guard:** Pipeline fetches successfully, but no assertion on `total_results` — verify explicit assert before returning results
- [ ] **Fallback parquet:** CI passes, but there's no committed `samples.parquet` fallback — verify fallback exists so iNat downtime doesn't block deploys

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| samples.parquet all-null specimen counts | LOW | Add `ofvs` parameter to API call; re-run pipeline; verify field ID constant |
| Wrong field ID constant | LOW | Fetch one known WaBA observation; inspect ofvs; update constant; re-run |
| 10K limit silently hit | MEDIUM | Switch to `id_above` pagination strategy; re-run full fetch |
| CI blocked by iNat downtime | LOW | Use committed fallback `samples.parquet`; bypass data pipeline step |
| uv lockfile drift | LOW | `cd data && uv lock`; commit and push |
| samples.parquet not deployed | LOW | Add cp step to `build-data.sh`; redeploy |
| pyinaturalist-convert schema mismatch | MEDIUM | Add explicit column rename/select step after conversion; add schema assertion |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Observation field values absent from response | INAT-02: specimen count extraction | Fetch one WaBA observation with known specimen count; assert `ofvs` present |
| Observation field ID numeric vs name | INAT-02: specimen count extraction | Log all field names+IDs found; verify constant matches actual ID |
| Collection project — many null specimen counts | INAT-02/INAT-03: schema design | Assert `specimen_count` column is nullable Int64; verify null fraction makes sense |
| project_id vs place_id filtering | INAT-01: pipeline querying | Spot-check 5 observations against known WaBA observer list |
| 10K pagination hard limit | INAT-01: pipeline querying | Assert `total_results < 10_000` with loud failure |
| API v1 vs v2 confusion | INAT-01: pipeline querying | Verify endpoint URL is `/v1/observations`; no JWT logic |
| CI blocked by iNat downtime | INAT-01: CI integration | Committed `samples.parquet` fallback exists before wiring CI |
| Rate limiting across concurrent CI runs | INAT-01: CI integration | Use pyinaturalist with ClientSession; set User-Agent |
| samples.parquet not copied to frontend assets | INAT-03: pipeline output | After full `npm run build`, verify `frontend/dist/assets/samples.parquet` exists |
| pyinaturalist-convert schema mismatch | INAT-03: schema validation | `pyarrow.parquet.read_schema('samples.parquet').names` matches expected list |
| uv lockfile drift | INAT-01: initial script setup | CI `uv sync` step validates lockfile; commit pyproject.toml + uv.lock together |
| Obscured coordinates stored permanently | INAT-03: schema design | Include `public_positional_accuracy` column for future map display flagging |
| Data staleness from static build | INAT-01: CI scheduling | Schedule trigger added to workflow; freshness date stored in parquet or metadata |
| CloudFront stale cache after deploy | Deploy workflow | Verify `aws cloudfront create-invalidation` runs after every sync |
| S3 sync --delete wipes data files | Deploy workflow | Verify --exclude or separate S3 prefix for data files |
| pdb.set_trace() hangs CI | Blocking — fix before any CI | Confirmed removed from `ecdysis/occurrences.py` before CI wiring |
| Python 3.14 not pre-installed | CI setup | Explicit `setup-python@v5` with `python-version: "3.14"` in workflow |

---

## Sources

- Direct code audit of this repository, including `data/inat/projects.py`, `data/inat/observation/300847934.json`, `scripts/build-data.sh`, `.github/workflows/deploy.yml`, `data/pyproject.toml` (HIGH confidence for project-specific findings)
- [iNaturalist API Recommended Practices](https://www.inaturalist.org/pages/api+recommended+practices) — rate limits (~100 req/min), User-Agent recommendation, pagination guidance, 10K hard cap, `id_above` workaround (MEDIUM confidence — WebSearch-verified, consistent with pyinaturalist documentation)
- [iNaturalist API v1 Documentation](https://api.inaturalist.org/v1/docs/) — endpoint reference, authentication requirements (MEDIUM confidence)
- [pyinaturalist documentation](https://pyinaturalist.readthedocs.io/) — pagination, rate limiting behavior, `fields` parameter, `page='all'` behavior (MEDIUM confidence)
- [iNaturalist community forum: Include project observation fields when using API](https://forum.inaturalist.org/t/include-project-observation-fields-when-using-api/30506) — fields absent by default (MEDIUM confidence)
- [iNaturalist community forum: API pagination 10K limit](https://forum.inaturalist.org/t/impossible-to-search-old-pages-due-to-limit-of-10000/42240) — confirmed hard cap behavior (MEDIUM confidence)
- [iNaturalist community forum: API docs & params explained](https://forum.inaturalist.org/t/api-docs-params-explained/42673) — `id_above` pagination strategy (MEDIUM confidence)
- [iNat scheduled downtime announcements](https://forum.inaturalist.org/t/scheduled-downtime-february-11-12-for-1-hour/75529) — confirmed iNat has maintenance windows (MEDIUM confidence)
- Observation field ID vs name distinction from search findings: web URL uses names, JSON API uses numeric IDs (MEDIUM confidence)
- AWS CDK v2 documentation on `S3BucketOrigin.withOriginAccessControl()` (MEDIUM confidence — training data August 2025)
- GitHub Actions OIDC documentation (MEDIUM confidence — training data August 2025)
- uv documentation: lockfile behavior, `uv sync` vs `uv lock` (MEDIUM confidence — training data August 2025)

---
*Pitfalls research for: Washington Bee Atlas — iNat pipeline integration (v1.2)*
*Researched: 2026-03-10*

---

## v1.4 Addendum: Second Layer, Exclusive Toggle, Data-Dependent Sidebar

**Scope:** Pitfalls specific to adding a second OL VectorLayer (sample dots), exclusive layer toggle, loading links.parquet alongside ecdysis.parquet, and sidebar content that adapts to the active layer.
**Researched:** 2026-03-12
**Confidence:** HIGH — based on direct code inspection of `bee-map.ts`, `bee-sidebar.ts`, `parquet.ts`, `filter.ts`

---

### Pitfall v1.4-A: singleclick handler queries both layers simultaneously

**What goes wrong:**
The current `singleclick` handler calls `specimenLayer.getFeatures(event.pixel)` and shows specimens in the sidebar. When `sampleLayer` is added, developers often write a parallel `sampleLayer.getFeatures(event.pixel)` call and use whichever result is non-empty. But both calls are async — the second `await` can resolve after the first has already set `selectedSamples`, causing the wrong sidebar view to flash or the second result to overwrite the first.

**Why it happens:**
`singleclick` is registered on `this.map`, not on a specific layer. Nothing in OL prevents both `getFeatures()` calls from racing.

**How to avoid:**
Check `this._activeLayer` (or equivalent toggle state) before deciding which layer to query. Only call `specimenLayer.getFeatures(event.pixel)` when the specimen layer is active; only call `sampleLayer.getFeatures(event.pixel)` when the sample layer is active. The toggle state drives the call, not the result.

**Warning signs:**
- Clicking near a specimen cluster while samples layer is active opens the specimen sidebar
- A sample click shows specimen sidebar briefly then switches (async race)

**Phase to address:**
MAP-04 (exclusive toggle) — toggle state must be established before the click handler is wired.

---

### Pitfall v1.4-B: Layer visibility toggle does not clear selected sidebar state

**What goes wrong:**
User opens a specimen cluster in the sidebar, then toggles to the samples layer. `selectedSamples` is not cleared on toggle, so the sidebar still shows specimen detail (collector, field number, species list) while the map shows sample dots. The mismatch persists until the user manually closes the detail panel.

**Why it happens:**
`specimenLayer.setVisible(false)` changes layer visibility but has no effect on `this.selectedSamples` or `this._selectedOccIds`. These are independent component state fields.

**How to avoid:**
In the toggle handler, immediately set `this.selectedSamples = null` and `this._selectedOccIds = null`. Also update the URL — if `o=` params are in the URL when the layer switches, drop them (IDs are layer-namespace-specific).

**Warning signs:**
- Toggling layers leaves stale specimen detail visible in the sidebar
- `o=` param survives a layer toggle in the URL bar

**Phase to address:**
MAP-04 (exclusive toggle).

---

### Pitfall v1.4-C: links.parquet loaded as VectorSource pollutes OL layer hit-testing

**What goes wrong:**
`links.parquet` is a lookup table with no geometry (occurrenceID → inat_observation_id). If a developer reuses `ParquetSource` (a VectorSource subclass) to load it, OL will add null-geometry features to the map. This does not crash, but null-geometry features interfere with `getFeatures(pixel)` in unpredictable ways and bloat the source for no benefit. Additionally, `specimenSource.once('change', ...)` fires when the specimen source loads — if `linksParquetSource.once('change', ...)` is added in parallel and its load resolves first, the initialization callback runs before `specimenSource.getFeatures()` returns any features, producing zero counts and a broken occurrence restore.

**Why it happens:**
It's tempting to reuse `ParquetSource` for all Parquet files. But `links.parquet` has no coordinates — it is not a geospatial data source.

**How to avoid:**
Load `links.parquet` with a plain `fetch` + `parquetReadObjects` call (not as a VectorSource). Store the result as a `Map<string, number>` component field (occurrenceID → inat_observation_id). Initiate this fetch in `firstUpdated`; handle it independently with its own promise chain. Do not add it to the OL map at all.

**Warning signs:**
- Sidebar shows "0 specimens / 0 species" at startup then corrects after a delay
- Selected occurrence restore from URL silently fails
- `specimenLayer.getFeatures(pixel)` returns unexpected results near sample locations

**Phase to address:**
LINK-05 — when links.parquet load is introduced.

---

### Pitfall v1.4-D: filterState singleton breaks sample feature clicks

**What goes wrong:**
`matchesFilter` in `filter.ts` tests `family`, `genus`, `scientificName`, `year`, and `month` — all specimen fields. Sample features from `samples.parquet` have different fields (`observer`, `date`, `specimen_count`). If `isFilterActive(filterState)` returns true and the click handler runs `inner.filter(f => matchesFilter(f, filterState))` on sample features, every sample fails all checks — `toShow` is empty, click does nothing, no sidebar opens, no error.

**Why it happens:**
The filter UI stays visible when the samples layer is active (it's in `_renderFilterControls()` which always renders). User applies a species filter to find specimens, then switches to samples layer — the active filter remains, silently blocking all sample clicks.

**How to avoid:**
Either (1) hide the filter controls entirely when samples layer is active — the filter has no meaning for iNat data — or (2) skip `matchesFilter` when sample layer is active. Option 1 is cleaner UX and prevents the confusion entirely.

**Warning signs:**
- Click on sample markers does nothing when a specimen filter is active
- No console errors — `toShow.length === 0` is silent
- `filteredSummary` stats show in sidebar while viewing samples (stale state from previous specimen filter)

**Phase to address:**
MAP-04 (exclusive toggle) — filter visibility must be conditioned on active layer.

---

### Pitfall v1.4-E: hyparquet reads inat_observation_id as BigInt; equality checks fail silently

**What goes wrong:**
`links.parquet` schema has `inat_observation_id` as Int64 (nullable). hyparquet represents Int64 as JavaScript `BigInt`. Template literals coerce BigInt correctly (`\`${BigInt(12345)}\`` → `"12345"`), so URL construction works. But any Map key comparison or equality test using a regular Number fails silently: `BigInt(12345) !== 12345` evaluates to `true` in JavaScript.

**Why it happens:**
The existing `parquet.ts` already handles this with explicit `Number(obj.year)` and `Number(obj.month)` casts — but this pattern must be deliberately repeated for links data. TypeScript does not error on BigInt/Number comparison in all contexts.

**How to avoid:**
When building the links lookup map from `parquetReadObjects` output, explicitly cast: `Number(obj.inat_observation_id)` (iNat IDs are ~9 digits, well within safe integer range). Document this alongside the existing `Number(obj.year)` pattern in `parquet.ts`.

**Warning signs:**
- iNat links never appear in the sidebar despite `links.parquet` containing data
- `linksMap.has(occId)` returns true but the value is undefined downstream
- No TypeScript error at the comparison site

**Phase to address:**
LINK-05 (specimen sidebar iNat link).

---

### Pitfall v1.4-F: links.parquet occurrenceID join key may not match feature ID format

**What goes wrong:**
`parquet.ts` sets feature IDs as `ecdysis:${obj.ecdysis_id}` where `ecdysis_id` is the integer DB primary key. `links.parquet` (per LINK-04 schema) uses `occurrenceID` (string) — which in Ecdysis DarwinCore exports is a UUID-style identifier, not the integer `ecdysis_id`. If the join attempts `linksMap.get(feature.getId())` where feature ID is `ecdysis:12345` (integer), but `links.parquet` stores `occurrenceID` as a UUID string, every lookup misses silently.

**Why it happens:**
The Ecdysis data has two ID fields: the integer `ecdysis_id` (used as the OL feature ID prefix) and the UUID `occurrenceID` (DarwinCore standard). PROJECT.md key decisions confirm that the `occid` URL parameter uses the integer — but `links.parquet` uses `occurrenceID` (UUID). These are different formats.

**How to avoid:**
Before writing any sidebar link rendering code, inspect the actual values in `links.parquet`: what does the `occurrenceID` column contain? If it's the UUID, the join key must come from `ecdysis.parquet`'s `occurrenceID` column (added in v1.3). Add `occurrenceID` to the `columns` list in `parquet.ts` and store it as a feature property; build the links map keyed by UUID; look up by feature property rather than feature ID.

**Warning signs:**
- `linksMap.size > 0` but `linksMap.get(feature.getId())` always returns undefined
- iNat links never appear even for specimens known to have iNat observation IDs
- `console.log` shows rows loaded from `links.parquet` but no lookup hits

**Phase to address:**
LINK-05 — first step should be a console inspection of actual key formats before any UI code.

---

### Pitfall v1.4-G: `o=` URL parameter encodes specimen IDs only; sample selection silently dropped on restore

**What goes wrong:**
`buildSearchParams` writes `o=ecdysis:12345,...` to the URL. The `parseUrlParams` filter at line 87 of `bee-map.ts` explicitly requires `s.startsWith('ecdysis:')` — sample IDs using a different prefix (e.g., `inat:999999`) would be silently dropped on restore. If sample clicks are added to URL state without a corresponding namespace update, the restore path ignores the IDs with no error.

**Why it happens:**
The `ecdysis:` prefix guard was added as a correct safety check for the specimen-only v1.1 URL state. It becomes a silent footgun when sample IDs need URL persistence.

**How to avoid:**
For v1.4, the simplest safe choice is to not encode sample selection in the URL at all (sample clicks do not push to `o=`). If URL persistence for sample selection is desired, use a separate URL parameter (e.g., `s=inat:999999`) and add a parallel restore path. Never reuse `o=` for a different ID namespace.

**Warning signs:**
- Sample selection in URL bar silently vanishes on page reload
- `parseUrlParams` returns an empty `occurrenceIds` array even when `o=inat:...` is in the URL

**Phase to address:**
MAP-05 (sample click + sidebar) — decide before writing the click handler whether sample selection is URL-persisted.

---

### Pitfall v1.4-H: links.parquet asset absent at dev time; 404 silently produces no iNat links

**What goes wrong:**
`ecdysis.parquet` is committed as a static asset fallback. `samples.parquet` is present in `frontend/src/assets/`. `links.parquet` has no committed asset path yet — it is pipeline-generated. If `links.parquet` is imported via `?url` in a new module but the file is absent, Vite either errors at build time or the `fetch` 404s at runtime. iNat links never appear but no other feature breaks — the failure is invisible unless the error is handled explicitly.

**Why it happens:**
The pattern of committing Parquet files to the assets directory was established for `ecdysis.parquet`. New pipeline outputs need to be explicitly added to the committed assets or the developer must run the pipeline locally first.

**How to avoid:**
Before writing any LINK-05 UI code, run `npm run fetch-links` (or the equivalent pipeline step) to produce `links.parquet` locally, copy it to `frontend/src/assets/`, and verify it loads via `?url` import. Handle the fetch failure gracefully: if `links.parquet` fails to load, set `linksMap` to an empty Map and render the sidebar without iNat links (no broken state, just missing feature).

**Warning signs:**
- Network tab shows 404 for `links.parquet`
- `parquetReadObjects` promise rejects (check the `.catch` path in the fetch chain)
- Sidebar never shows iNat links even after pipeline produces the file locally

**Phase to address:**
LINK-05 — verify asset availability as the first step, before any rendering code.

---

## v1.4 Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OL `singleclick` + two layers | Calling `getFeatures()` on both layers and using whichever returns results | Gate each `getFeatures()` call on the active layer toggle state |
| hyparquet Int64 → BigInt | Using `inat_observation_id` in a Map or comparison without explicit `Number()` cast | `Number(obj.inat_observation_id)` on load; consistent with existing `Number(obj.year)` pattern in `parquet.ts` |
| links.parquet join key | Joining on OL feature ID (`ecdysis:12345`) when `links.parquet` uses UUID `occurrenceID` | Inspect actual column values first; may need to add `occurrenceID` to `parquet.ts` column list and store as feature property |
| iNaturalist observation URL | Constructing URL with raw `BigInt` or wrong ID type | `https://www.inaturalist.org/observations/${Number(id)}`; add `target="_blank" rel="noopener"` consistent with existing Ecdysis links |
| Lit `updated()` restore pattern | Adding new restore `@property` fields to `BeeSidebar` without adding them to `restoredKeys` in `updated()` | Extend the `restoredKeys` array in `bee-sidebar.ts` for every new restore prop |

## v1.4 "Looks Done But Isn't" Checklist

- [ ] **Sample layer toggle:** `specimenLayer.setVisible(false)` called — verify `sampleLayer.setVisible(true)` AND `selectedSamples = null` AND URL `o=` param cleared in the same handler
- [ ] **Sample click handler:** Verify `sampleLayer.getFeatures(event.pixel)` is only called when sample layer is active (not falling through to specimen handler)
- [ ] **iNat link in specimen sidebar:** Verify the join key matches — `links.parquet` `occurrenceID` column value format must match the key used to look up in `linksMap`
- [ ] **links.parquet asset path:** Verify Vite resolves the `?url` import and the file does not 404 in both dev and production (CloudFront)
- [ ] **BigInt conversion:** Verify `inat_observation_id` from hyparquet is converted to `Number` before use in map lookup or URL construction
- [ ] **Filter controls hidden in sample mode:** Confirm filter controls do not appear (and `filteredSummary` is not stale) when sample layer is active
- [ ] **`updated()` restore keys:** If any new `@property` restore fields are added to `BeeSidebar`, confirm they are in the `restoredKeys` array
- [ ] **`_isRestoringFromHistory` guard:** Confirm sample layer toggle does not interact with the popstate guard (toggle should not push history)

## v1.4 Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| singleclick queries both layers | MAP-04 (exclusive toggle) | Click a sample dot while specimen filter is active; confirm specimen sidebar does not open |
| Toggle does not clear selected state | MAP-04 (exclusive toggle) | Open specimen cluster, toggle to samples; confirm sidebar returns to summary |
| links.parquet modeled as VectorSource | LINK-05 | Confirm links load uses plain `fetch` + `parquetReadObjects`, no OL source |
| filterState applied to sample features | MAP-04 (exclusive toggle) | Apply taxon filter, toggle to samples, click dot; confirm sidebar opens |
| hyparquet BigInt for inat_observation_id | LINK-05 | Console-log raw value from parquetReadObjects; confirm `Number()` converts correctly |
| links.parquet join key mismatch | LINK-05 — step 1 | Console-log a linksMap entry vs a specimenSource feature ID; confirm key formats match |
| `o=` URL encoding with sample IDs | MAP-05 (sample click + sidebar) | Confirm no `o=` param written for sample clicks |
| links.parquet asset absent at dev time | LINK-05 — step 0 | Run pipeline locally; confirm `fetch` resolves before writing any rendering code |

---
*v1.4 pitfalls addendum for: second OL layer, exclusive toggle, data-dependent sidebar (Sample Layer milestone)*
*Researched: 2026-03-12*
