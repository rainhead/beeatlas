# Phase 28: Frontend Runtime Fetch - Research

**Researched:** 2026-03-29
**Domain:** Vite build config, Lit/Web Components, OpenLayers VectorSource, AWS CDK CloudFront CORS
**Confidence:** HIGH

## Summary

This phase removes all four bundled data files from the Vite build and replaces them with runtime fetches from CloudFront `/data/`. The work splits into three tracks: (1) frontend — remove asset imports, inject runtime URLs, add loading/error state to `bee-map.ts`; (2) CDK — add a `/data/*` cache behavior on the existing distribution with CORS headers correctly configured; (3) cleanup — delete the Vite `geojsonPlugin` and `geojson.d.ts`.

The code is well-prepared. `ParquetSource` and `SampleParquetSource` already accept `url` and fetch eagerly; only the URL value needs to change. GeoJSON sources require a slightly different migration — the current synchronous import-and-parse pattern becomes an OL `VectorSource` with `url` + `format`, which OL fetches asynchronously. The main structural change in `bee-map.ts` is deferring source construction into `connectedCallback` or `firstUpdated` so the loading state can be properly managed, since the current module-level instantiation of `specimenSource` / `sampleSource` / `countySource` / `ecoregionSource` happens before the DOM element exists and would race with a loading gate.

The CDK work requires two constructs: a custom `CachePolicy` (to include `Origin` in the cache key) and a `ResponseHeadersPolicy` (to add `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers: Range`, and `Access-Control-Expose-Headers: Content-Range, Content-Length`). Both are available in the installed `aws-cdk-lib@2.238.0`. The behavior is added with `distribution.addBehavior('/data/*', ...)` — an additive change that does not touch the default behavior.

**Primary recommendation:** Implement in two parallel sub-tasks — (A) CDK CORS behavior, (B) frontend import removal + loading state — then verify together.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use the absolute CloudFront URL directly: `https://beeatlas.net/data/` as the base for all data file fetches. No Vite proxy — dev environment fetches from production CloudFront just like production does, maximizing browser cache reuse.
- **D-02:** Provide an optional `VITE_DATA_BASE_URL` override (defaults to `https://beeatlas.net/data`) for pointing at a different origin if needed. Add `.env.example` documenting this var.
- **D-03:** Remove all 4 data files from `frontend/src/assets/` and all `?url` / module import references.
- **D-04:** Switch `countySource` and `ecoregionSource` (in `region-layer.ts`) from synchronous `import countiesJson from './assets/counties.geojson'` to OL `VectorSource` with `url` + `format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' })`. OL handles the async fetch internally.
- **D-05:** Remove the `geojsonPlugin` from `vite.config.ts` — it only existed to handle `.geojson` imports as ES modules.
- **D-06:** Remove `geojson.d.ts` type declaration file — no longer needed after removing static imports.
- **D-07:** `ParquetSource` and `SampleParquetSource` already accept a `url` parameter and fetch via `asyncBufferFromUrlEager`. Change the URL values from `import ecdysisDump from './assets/ecdysis.parquet?url'` to the runtime base URL. No changes to the fetch/parse logic.
- **D-08:** Show a minimal loading indicator while the parquet files are being fetched. Rough parity — a simple "Loading…" state is sufficient. The exact UX is deferred to the DuckDB WASM phase where loading behavior will be redesigned.
- **D-09:** The map should not be interactive (or shown) until the parquet data is available. GeoJSON loading (counties/ecoregions) can proceed in parallel without blocking map display.
- **D-10:** If any data file fetch fails, show a simple error message in place of the map: "Failed to load data. Please try refreshing." No partial state — don't render an empty map without explanation.
- **D-11:** Add a `/data/*` cache behavior to the CloudFront distribution in `infra/lib/beeatlas-stack.ts`. This behavior needs:
  - S3 origin: the `/data/` prefix of `siteBucket`
  - CORS: `Origin` header in the cache key (so per-origin caching works correctly)
  - Response headers policy exposing `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers` (including `Range`), and `Access-Control-Expose-Headers` (`Content-Range`, `Content-Length`)
  - This enables browser `fetch()` from any origin (localhost, beeatlas.net) without CORS errors, and hyparquet Range requests to work correctly.

### Claude's Discretion

- Exact Lit component structure for the loading/error state in `bee-map.ts`
- Whether to use `Promise.all` or sequential fetches for the two parquet files
- Whether loading state is a `@state()` property or a separate component

### Deferred Ideas (OUT OF SCOPE)

- **Loading UX redesign** — Spinner, progress bars, per-layer loading indicators, and interactive loading states all deferred to the DuckDB WASM frontend phase (WASM-01/02). Rough parity is the goal here.
- **Range request optimization** — `asyncBufferFromUrlEager` fetches the full file eagerly. Switching to streaming Range requests for hyparquet is deferred to the DuckDB WASM phase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FETCH-01 | Frontend fetches `ecdysis.parquet`, `samples.parquet`, `counties.geojson`, `ecoregions.geojson` from CloudFront `/data/` path at runtime; bundled asset imports removed from build | D-03, D-04, D-07: assets deleted; ParquetSource URL updated; OL VectorSource url+format for GeoJSON |
| FETCH-02 | CloudFront `/data/*` cache behavior configured with correct CORS headers (Origin in cache key) and S3 data prefix as origin; supports hyparquet Range requests | D-11: addBehavior with custom CachePolicy + ResponseHeadersPolicy |
| FETCH-03 | Frontend shows loading state while data files are being fetched | D-08, D-09, D-10: `@state() loading` / `error` in bee-map.ts; map hidden until parquet ready |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lit | 3.2.1 (installed) | Web component base class; `@state()` for reactive loading/error | Already in use throughout the frontend |
| OpenLayers | 10.7.0 (installed) | `VectorSource` with `url`+`format` for async GeoJSON fetch | Already the map library; this is the idiomatic OL async-load pattern |
| aws-cdk-lib | 2.238.0 (installed) | `ResponseHeadersPolicy`, `CachePolicy`, `distribution.addBehavior` | Already the CDK version in use |
| Vite | 6.2.3 (installed) | Build — `import.meta.env.VITE_DATA_BASE_URL` env var injection | Already the build tool |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hyparquet | 1.23.3 (installed) | Parquet parse — already wired; no changes needed | No changes to parquet parsing logic |

**Installation:** No new packages needed — all required libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure
No structural changes to directories. Deletions only:
```
frontend/src/assets/        # delete all 4 files (ecdysis.parquet, samples.parquet, counties.geojson, ecoregions.geojson)
frontend/src/geojson.d.ts   # delete — no longer needed
```
New files:
```
frontend/.env.example       # documents VITE_DATA_BASE_URL
```

### Pattern 1: Runtime URL from Vite env var

`VITE_DATA_BASE_URL` is read at build time and baked into the bundle. The default is `https://beeatlas.net/data`.

```typescript
// frontend/src/parquet.ts or bee-map.ts
const DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL ?? 'https://beeatlas.net/data';
const ECDYSIS_URL = `${DATA_BASE_URL}/ecdysis.parquet`;
const SAMPLES_URL = `${DATA_BASE_URL}/samples.parquet`;
```

Both `ParquetSource` and `SampleParquetSource` already accept `{url: string}` — no constructor changes needed.

### Pattern 2: OL VectorSource with url + format (GeoJSON async)

Replace synchronous import-and-parse with OL's built-in async fetch:

```typescript
// region-layer.ts — BEFORE (synchronous import)
import countiesJson from './assets/counties.geojson';
export const countySource = new VectorSource({
  features: fmt.readFeatures(countiesJson),
});

// region-layer.ts — AFTER (async OL url fetch)
const DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL ?? 'https://beeatlas.net/data';

export const countySource = new VectorSource({
  url: `${DATA_BASE_URL}/counties.geojson`,
  format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' }),
});

export const ecoregionSource = new VectorSource({
  url: `${DATA_BASE_URL}/ecoregions.geojson`,
  format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' }),
});
```

**Important side-effect:** When `VectorSource` is constructed with `url`, OL does not load immediately — it loads on the first `loadFeatures` call (triggered when the map renders). This means `countySource.getFeatures()` called at module evaluation time (as currently done in `bee-map.ts` for `countyOptions` and `ecoregionOptions`) will return an empty array. Those calls must move inside the source's `change` event handler or be populated after the map renders.

### Pattern 3: Loading/error state in bee-map.ts

The current module-level instantiation is:
```typescript
// Lines 196–215 in bee-map.ts — currently at module scope
const specimenSource = new ParquetSource({url: ecdysisDump});
const sampleSource = new SampleParquetSource({url: samplesDump});
const countyOptions = [...countySource.getFeatures()...];   // returns [] if async
const ecoregionOptions = [...ecoregionSource.getFeatures()...]; // returns [] if async
```

With async GeoJSON, `countyOptions` and `ecoregionOptions` must be populated after the sources have loaded. The simplest approach: keep `countyOptions` and `ecoregionOptions` as `@state()` properties on `BeeMap`, populated in the GeoJSON source `change` event handler (like `sampleDataLoaded` is today).

The loading/error state pattern using existing `@state()` convention:

```typescript
@state() private _dataLoading = true;
@state() private _dataError: string | null = null;
```

`render()` gates on these:
```typescript
public render() {
  if (this._dataError) {
    return html`<div class="load-error">Failed to load data. Please try refreshing.</div>`;
  }
  if (this._dataLoading) {
    return html`<div class="load-status">Loading…</div>`;
  }
  return html`...existing map template...`;
}
```

The parquet `failure` callback in `VectorSource` loader propagates to `_dataError`. The `specimenSource` `change` event clears `_dataLoading`.

### Pattern 4: CDK `/data/*` behavior

`distribution.addBehavior` is the additive API — it does not modify `defaultBehavior`:

```typescript
// In beeatlas-stack.ts, after distribution is created

// Cache policy: include Origin in cache key so CORS responses are cached per-origin
const dataCachePolicy = new cloudfront.CachePolicy(this, 'DataCachePolicy', {
  headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Origin'),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
  cookieBehavior: cloudfront.CacheCookieBehavior.none(),
  defaultTtl: cdk.Duration.days(1),
  maxTtl: cdk.Duration.days(365),
  minTtl: cdk.Duration.seconds(0),
});

// Response headers policy: expose CORS + Range headers
const dataCorsPolicy = new cloudfront.ResponseHeadersPolicy(this, 'DataCorsPolicy', {
  corsBehavior: {
    accessControlAllowCredentials: false,
    accessControlAllowHeaders: ['*'],
    accessControlAllowMethods: ['GET', 'HEAD'],
    accessControlAllowOrigins: ['*'],
    accessControlExposeHeaders: ['Content-Range', 'Content-Length', 'ETag'],
    originOverride: true,
  },
});

distribution.addBehavior('/data/*',
  origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
  {
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: dataCachePolicy,
    responseHeadersPolicy: dataCorsPolicy,
  }
);
```

### Anti-Patterns to Avoid

- **Calling `getFeatures()` on an async VectorSource at module-init time:** Returns `[]` before OL has fetched. Move `countyOptions` / `ecoregionOptions` population to inside the source `change` handler.
- **Using `CachePolicy.CACHING_OPTIMIZED` for the `/data/*` behavior:** The managed policy does not include `Origin` in the cache key, so CORS responses will be served without vary-by-origin and different origins will get the wrong (or absent) CORS headers.
- **Omitting `accessControlExposeHeaders` from the response headers policy:** `Content-Range` must be exposed for hyparquet Range request compatibility (even though the current fetch is eager, the CONTEXT.md notes this should work correctly).
- **Using a Vite proxy for dev:** Decided against (D-01) — dev fetches from production CloudFront directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async GeoJSON fetch | Custom fetch + readFeatures pipeline | OL `VectorSource` with `url` + `format` | OL handles loading strategy, error events, projection transform internally |
| CORS header injection | Lambda@Edge function | CDK `ResponseHeadersPolicy` | Managed CloudFront feature; no compute cost, no Lambda needed |
| Cache key with Origin | Manual Vary header | CDK `CachePolicy` with `headerBehavior: allowList('Origin')` | CloudFront cache key is separate from Vary; must use CachePolicy |
| Env-based URL switching | Runtime config endpoint | Vite `import.meta.env.VITE_DATA_BASE_URL` | Build-time substitution; zero runtime overhead |

---

## Common Pitfalls

### Pitfall 1: countyOptions / ecoregionOptions populated at module eval time

**What goes wrong:** After removing `import countiesJson from './assets/counties.geojson'`, the `countySource.getFeatures()` calls at lines 209–215 in `bee-map.ts` return `[]` because OL async VectorSource has not yet fetched. The sidebar county/ecoregion dropdowns will be empty.

**Why it happens:** The current pattern works because the synchronous `VectorSource({features: fmt.readFeatures(...)})` constructor populates features synchronously. Switching to `url` makes the source lazy.

**How to avoid:** Convert `countyOptions` and `ecoregionOptions` to `@state()` properties on `BeeMap`. Populate them inside the respective source `change` event handler (OL fires `change` when features are loaded). Since GeoJSON loading is not supposed to block map display (D-09), the sidebar dropdowns can populate slightly after initial render — a natural lazy init.

**Warning signs:** Empty county/ecoregion dropdowns in sidebar after migration.

### Pitfall 2: S3 CORS configuration vs CloudFront CORS

**What goes wrong:** CloudFront `ResponseHeadersPolicy` injects CORS headers into CloudFront responses, but S3 also evaluates CORS on the origin request. With OAC (Origin Access Control), CloudFront signs requests to S3 using SigV4 — these signed requests do not include an `Origin` header, so S3 CORS is not triggered. The `ResponseHeadersPolicy` approach is sufficient and correct for OAC setups.

**Why it happens:** Confusion between "S3 CORS config" (evaluated at S3 level for direct requests) and "CloudFront response headers policy" (injected by CloudFront before returning to viewer). For OAC distributions, only the CloudFront policy matters for viewer-facing CORS.

**How to avoid:** Use `ResponseHeadersPolicy` only — no S3 bucket CORS config needed. This is confirmed by the fact that the existing default behavior serves the HTML/JS bundle without S3 CORS, and it works fine.

### Pitfall 3: Origin header in cache key vs OriginRequestPolicy

**What goes wrong:** Including `Origin` in `OriginRequestPolicy` (which forwards headers to S3) instead of `CachePolicy` (which varies the cache key) causes CloudFront to forward Origin to S3, but does not vary the cached response per-origin. Two different origins could get each other's CORS responses.

**Why it happens:** `CachePolicy` and `OriginRequestPolicy` are separate. Cache variation requires the header to be in `CachePolicy.headerBehavior`.

**How to avoid:** Put `Origin` in `CachePolicy` header allowlist. The `ResponseHeadersPolicy` handles what goes back to the viewer; the `CachePolicy` handles cache key variation.

### Pitfall 4: parquet fetch error not surfacing to Lit state

**What goes wrong:** `ParquetSource` / `SampleParquetSource` pass `failure` to OL's `VectorSource` loader, but the `failure` callback calls `source.removeLoadedExtent()` internally — it does not propagate to `bee-map.ts` by default. The map will silently show an empty layer.

**Why it happens:** OL's `VectorSource` error handling is internal; the `failure` callback tells OL to retry, not to surface the error to the application layer.

**How to avoid:** In `bee-map.ts`, listen to `specimenSource` error events via `specimenSource.on('error', ...)`, or refactor `ParquetSource` to emit a custom error event, or wrap the fetch in `firstUpdated` with try/catch around a custom fetch. The cleanest approach: since `asyncBufferFromUrlEager` already returns a rejected promise on HTTP error, the `.catch(failure)` in `ParquetSource` could also emit a custom OL event or call a callback to set `_dataError` on `BeeMap`. The simplest: add an optional `onError` callback to `ParquetSource` constructor.

### Pitfall 5: dist/ build still contains asset files after deletion

**What goes wrong:** Running `npm run build` still copies old assets into `dist/assets/` if Vite's static asset handling caches them or if files remain in `public/`.

**Why it happens:** Vite copies everything from `public/` verbatim into `dist/`. The parquet/geojson files are in `src/assets/` (not `public/`), so they are included only because of explicit `import ... from './assets/...'` statements. Removing those imports removes them from the bundle.

**How to avoid:** Delete the 4 files from `src/assets/` AND remove all import/`?url` references. After `npm run build`, verify `dist/` has no `.parquet` or `.geojson` files. The success criterion requires this check.

---

## Code Examples

### URL constant (bee-map.ts)

```typescript
// Source: D-01, D-02 from CONTEXT.md
const DATA_BASE_URL = (import.meta.env.VITE_DATA_BASE_URL as string | undefined)
  ?? 'https://beeatlas.net/data';
```

Place this at the top of `bee-map.ts` (or in a shared `config.ts`). Replace the two `import ... from './assets/...?url'` lines with references to `DATA_BASE_URL`.

### ParquetSource construction (bee-map.ts)

```typescript
// Replace (lines 196-207 in bee-map.ts):
// import ecdysisDump from './assets/ecdysis.parquet?url';
// import samplesDump from './assets/samples.parquet?url';
// const specimenSource = new ParquetSource({url: ecdysisDump});
// const sampleSource = new SampleParquetSource({url: samplesDump});

// With:
const specimenSource = new ParquetSource({url: `${DATA_BASE_URL}/ecdysis.parquet`});
const sampleSource = new SampleParquetSource({url: `${DATA_BASE_URL}/samples.parquet`});
```

These can remain at module scope — the fetch happens lazily inside the OL `strategy: all` loader.

### OL async GeoJSON VectorSource (region-layer.ts)

```typescript
// Remove:
// import countiesJson from './assets/counties.geojson';
// import ecoregionsJson from './assets/ecoregions.geojson';
// export const countySource = new VectorSource({ features: fmt.readFeatures(countiesJson) });
// export const ecoregionSource = new VectorSource({ features: fmt.readFeatures(ecoregionsJson) });

// Replace with:
const DATA_BASE_URL = (import.meta.env.VITE_DATA_BASE_URL as string | undefined)
  ?? 'https://beeatlas.net/data';

export const countySource = new VectorSource({
  url: `${DATA_BASE_URL}/counties.geojson`,
  format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' }),
});

export const ecoregionSource = new VectorSource({
  url: `${DATA_BASE_URL}/ecoregions.geojson`,
  format: new GeoJSONFormat({ featureProjection: 'EPSG:3857' }),
});
```

OL triggers the fetch when the map calls `loadFeatures`, which happens on first render.

### Loading/error state in BeeMap render()

```typescript
// New @state properties to add to BeeMap class:
@state() private _dataLoading = true;
@state() private _dataError: string | null = null;

// In render():
public render() {
  if (this._dataError) {
    return html`<div style="padding: 2rem; font-size: 1.2rem; color: #c00;">
      Failed to load data. Please try refreshing.
    </div>`;
  }
  if (this._dataLoading) {
    return html`<div style="padding: 2rem;">Loading…</div>`;
  }
  return html`
    <link rel="stylesheet" .../>
    <div class="map-container">...</div>
    <bee-sidebar ...></bee-sidebar>
  `;
}
```

Clear `_dataLoading` inside the `specimenSource.once('change', ...)` callback (already present, line 726). Set `_dataError` via an error path in `ParquetSource` failure or by catching in `firstUpdated`.

### CDK behavior addition (beeatlas-stack.ts)

```typescript
// Add after the distribution is defined, before Route 53 records.
// Constructs: cloudfront.CachePolicy, cloudfront.ResponseHeadersPolicy
// Method: distribution.addBehavior('/data/*', origin, options)

const dataCachePolicy = new cloudfront.CachePolicy(this, 'DataCachePolicy', {
  headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Origin'),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
  cookieBehavior: cloudfront.CacheCookieBehavior.none(),
  defaultTtl: cdk.Duration.days(1),
  maxTtl: cdk.Duration.days(365),
  minTtl: cdk.Duration.seconds(0),
});

const dataCorsPolicy = new cloudfront.ResponseHeadersPolicy(this, 'DataCorsPolicy', {
  corsBehavior: {
    accessControlAllowCredentials: false,
    accessControlAllowHeaders: ['*'],
    accessControlAllowMethods: ['GET', 'HEAD'],
    accessControlAllowOrigins: ['*'],
    accessControlExposeHeaders: ['Content-Range', 'Content-Length', 'ETag'],
    originOverride: true,
  },
});

distribution.addBehavior('/data/*',
  origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
  {
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: dataCachePolicy,
    responseHeadersPolicy: dataCorsPolicy,
  }
);
```

**Confirmed available:** `ResponseHeadersPolicy`, `CacheHeaderBehavior`, `CachePolicy`, `distribution.addBehavior` are all exported from the installed `aws-cdk-lib@2.238.0`. No version upgrade needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Vite build, CDK synth | Yes | 24.12.0 | — |
| Vite | Frontend build | Yes | 6.2.3 | — |
| aws-cdk-lib | CDK infra | Yes | 2.238.0 | — |
| CloudFront distribution | FETCH-02 | Yes (already deployed) | — | — |
| `https://beeatlas.net/data/` | Dev fetch (D-01) | Yes (nightly.sh uploads) | — | VITE_DATA_BASE_URL override |

No missing dependencies that block execution.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — frontend has no test suite; CDK has no tests |
| Config file | none |
| Quick run command | `cd frontend && npm run build` (type-check + bundle) |
| Full suite command | `cd infra && npm run build && npx cdk synth` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FETCH-01 | dist/ contains no .parquet or .geojson files after build | smoke | `cd frontend && npm run build && ! ls dist/ -R \| grep -E '\.parquet\|\.geojson'` | ❌ Wave 0 (manual check) |
| FETCH-02 | CloudFront /data/* returns CORS headers from a cross-origin fetch | smoke/manual | `curl -H "Origin: http://localhost:5173" -I https://beeatlas.net/data/ecdysis.parquet` | ❌ Wave 0 (manual after deploy) |
| FETCH-03 | Loading indicator visible in browser; map renders after fetch | manual smoke | Load site in browser; observe loading state then map | ❌ Wave 0 (browser test) |

### Sampling Rate
- **Per task commit:** `cd frontend && npm run build` (TypeScript compile + bundle — catches import errors immediately)
- **Per wave merge:** `cd frontend && npm run build && cd ../infra && npm run build && npx cdk synth`
- **Phase gate:** Full suite green + browser smoke test before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Manual verification step: `ls dist/` for no parquet/geojson files after build
- [ ] Manual CORS curl check after `cdk deploy`
- [ ] Browser smoke test: loading state visible, map renders, no console CORS errors

*(No automated test framework exists for this frontend — all FETCH verification is build smoke + manual browser/curl checks. This is consistent with the project's current test posture for frontend code.)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synchronous GeoJSON import via Vite plugin | OL `VectorSource` url+format (async, OL-managed) | Phase 28 | `getFeatures()` at module init returns `[]`; countyOptions/ecoregionOptions must move to event handlers |
| Assets bundled in `src/assets/` and imported directly | Runtime fetch from CloudFront | Phase 28 | Build output shrinks by ~3.7MB; loading state required |
| No CORS config on CloudFront | Custom CachePolicy + ResponseHeadersPolicy on /data/* | Phase 28 | Enables browser fetch from any origin without CORS errors |

---

## Open Questions

1. **Error surfacing from ParquetSource to BeeMap**
   - What we know: `ParquetSource` calls the OL `failure` callback on fetch errors. OL marks the extent as failed and may retry. There is no current application-level error callback.
   - What's unclear: Whether listening to OL's `error` event on the source (`specimenSource.on('error', ...)`) reliably fires for all HTTP error cases, or if a custom `onError` callback in the constructor is more reliable.
   - Recommendation: Add an `onError?: (err: Error) => void` callback parameter to `ParquetSource` and `SampleParquetSource` constructors. Call it from the `.catch()` block. This is 2 lines per constructor and is the most direct path.

2. **countyOptions / ecoregionOptions timing for sidebar boundary mode**
   - What we know: These are used to populate the boundary region dropdown in `bee-sidebar.ts`. Currently populated synchronously at module init. After D-04, they'll be empty until OL fetches.
   - What's unclear: Whether the user can activate boundary mode before the GeoJSON has loaded (D-09 says GeoJSON loading doesn't block map display). If so, the dropdown would initially be empty.
   - Recommendation: Convert to `@state()` properties on `BeeMap`, default `[]`. Populate on `countySource.once('change', ...)` and `ecoregionSource.once('change', ...)`. The sidebar will re-render reactively when populated. Users activating boundary mode before GeoJSON loads will see an empty dropdown briefly.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `frontend/src/bee-map.ts`, `frontend/src/parquet.ts`, `frontend/src/region-layer.ts`, `frontend/vite.config.ts` — current implementation confirmed
- Codebase direct read: `infra/lib/beeatlas-stack.ts` — existing CDK distribution pattern confirmed
- `infra/node_modules/aws-cdk-lib/aws-cloudfront/index.js` — confirmed `ResponseHeadersPolicy`, `CachePolicy`, `CacheHeaderBehavior`, `addBehavior` all present in installed 2.238.0
- CONTEXT.md decisions D-01 through D-11 — all locked; no research needed for alternatives

### Secondary (MEDIUM confidence)
- OL `VectorSource` `url`+`format` pattern: standard OpenLayers API, confirmed by reading existing `region-layer.ts` which already uses `GeoJSONFormat` and `VectorSource` constructs from `ol/source.js`
- CloudFront CORS with OAC: standard AWS pattern (no S3 bucket CORS config needed when using `ResponseHeadersPolicy` at CloudFront level)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already installed; versions confirmed from package.json
- Architecture: HIGH — code read directly; OL VectorSource url pattern confirmed; CDK constructs confirmed present
- Pitfalls: HIGH — derived from direct code inspection (module-init getFeatures, error propagation gap, CORS cache-key issue)

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable libraries; CDK API stable)
