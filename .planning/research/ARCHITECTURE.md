# Architecture Patterns: iNat Sample Layer Integration

**Domain:** Static bee atlas — adding iNaturalist sample markers to existing specimen map
**Researched:** 2026-02-25
**Confidence:** HIGH (grounded in direct codebase inspection; OL multi-layer and hyparquet patterns verified against official documentation)

---

## Context

This document targets the v1.1 milestone. The v1.0 architecture is fully shipped:
- `ParquetSource` extends `VectorSource`, accepts a URL, reads ecdysis columns, emits OL Features
- `speicmenLayer` wraps `clusterSource` wraps `specimenSource`
- `BeeMap` owns filter state, `BeeSidebar` renders filters + specimen detail
- `bee-map.ts` click handler uses `speicmenLayer.getFeatures(pixel)` — layer-specific, not map-wide

The v1.1 question is: how do `samples.parquet` (iNat observations) and its layer fit alongside this existing structure?

---

## Recommended Architecture

The integration follows the same pattern as the existing ecdysis pipeline: Python produces a Parquet file, the build copies it into the frontend asset directory, Vite bundles it with a content-hash URL, and hyparquet reads it client-side via `asyncBufferFromUrl`. This keeps the static-hosting constraint intact, requires no new AWS infrastructure, and lets the same `ParquetSource` class serve both data types with minor extension.

```
Pipeline (data/)                       Frontend (frontend/src/)
──────────────────────────             ──────────────────────────────────────────────────
data/inat/download.py                  parquet.ts  (ParquetSource — modified to accept
  → data/samples.parquet                             columns + featureFromRow as args)
     ↑                                 assets/samples.parquet  (copied by build-data.sh)
scripts/build-data.sh                     ↓ imported as ?url
  uv run python inat/download.py       bee-map.ts
  cp data/samples.parquet                specimenSource  (unchanged)
     frontend/src/assets/               clusterSource   (unchanged)
                                        speicmenLayer   (unchanged)
                                        sampleSource    (NEW — ParquetSource for iNat)
                                        sampleLayer     (NEW — VectorLayer, no cluster)
                                        singleclick handler (MODIFIED)
                                      style.ts
                                        clusterStyle    (unchanged)
                                        sampleStyle     (NEW export)
                                      bee-sidebar.ts
                                        InatSample interface + property (NEW)
                                        _renderInatDetail() (NEW)
```

### Why bundle as an asset (not S3 runtime fetch)

`samples.parquet` must be placed in `frontend/src/assets/` and imported with `?url`, identical to `ecdysis.parquet`. The alternative — serving it from a separate S3 URL at runtime — is explicitly rejected:

1. **CORS-free**: Both files are served from the same CloudFront origin as `index.html`. Runtime fetch from a separate S3 URL requires S3 CORS configuration (AllowedOrigins) and CloudFront behavior changes to forward the `Origin` header. If CloudFront caches the first response before the Origin header is whitelisted, all subsequent requests get responses without CORS headers and fail silently.
2. **Zero infra change**: The existing CDK stack, GitHub Actions workflow, and `aws s3 sync` step already deploy everything in `frontend/dist/`. A second origin requires CDK changes.
3. **Consistent availability**: The committed fallback file pattern (matching ecdysis) prevents CI breakage when the iNat API is unavailable.
4. **hyparquet works identically**: `asyncBufferFromUrl` issues HTTP range requests against any public URL including content-hash Vite asset URLs.

The downside of bundling is adding to page weight. For the Washington Bee Atlas iNat project (hundreds of observations, not tens of thousands), `samples.parquet` at ~5–15 KB is negligible.

---

## Component Boundaries

| Component | Status | Responsibility | Communicates With |
|-----------|--------|---------------|-------------------|
| `data/inat/download.py` | **NEW** | Query iNat API v1 `/observations?project_id=166376`, paginate via `id_above`, extract fields, write `samples.parquet` | iNat API, `data/` filesystem |
| `scripts/build-data.sh` | **MODIFIED** | Add iNat download step; copy `samples.parquet` to `frontend/src/assets/` | `data/inat/download.py`, `frontend/src/assets/` |
| `frontend/src/assets/samples.parquet` | **NEW** | Committed fallback; overwritten by pipeline build | Built artifact, read by frontend |
| `frontend/src/parquet.ts` (`ParquetSource`) | **MODIFIED (lightly)** | Extract `columns` and `featureFromRow` as constructor options so iNat variant can configure its own column set and feature mapping | `bee-map.ts`, hyparquet |
| `frontend/src/style.ts` | **MODIFIED** | Add `sampleStyle` export — fixed diamond marker for iNat points | `bee-map.ts` |
| `frontend/src/bee-map.ts` | **MODIFIED** | Import `samplesDump`, construct `sampleSource` + `sampleLayer`, add layer to OL Map, update singleclick handler to discriminate between layers, add `selectedInatSample` reactive state | `parquet.ts`, OL map, `bee-sidebar.ts`, `style.ts` |
| `frontend/src/bee-sidebar.ts` | **MODIFIED** | Add `InatSample` interface, `inatSample` property, `_renderInatDetail()` render branch | `bee-map.ts` |

No changes to `infra/` (CDK), `frontend/vite.config.ts`, or `frontend/package.json`.

---

## Data Flow

```
CI / local build:
  inat/download.py
    GET https://api.inaturalist.org/v1/observations
        ?project_id=166376&per_page=200&order_by=id&order=asc
    (paginate: while len(results) == 200: id_above=results[-1].id, fetch next page)
    → data/samples.parquet
        columns: observation_id (int64), observer (str), date_str (str),
                 lat (float64), lon (float64), specimen_count (int64)

  build-data.sh (modified)
    ... existing ecdysis steps ...
    uv run python inat/download.py --project_id 166376
    cp data/samples.parquet frontend/src/assets/samples.parquet

  Vite build
    import samplesDump from './assets/samples.parquet?url'
    → emits frontend/dist/assets/samples-[hash].parquet

  S3 sync
    → CloudFront serves samples-[hash].parquet alongside index.html

Browser runtime:
  ParquetSource({ url: samplesDump, columns: inatColumns, featureFromRow })
    asyncBufferFromUrl({ url })  → HTTP range requests to same CloudFront origin
    parquetReadObjects({ columns, file })
    featureFromRow(obj)  → OL Feature, id = `inat:{observation_id}`,
                            geometry = Point(fromLonLat([lon, lat])),
                            properties: { observer, date_str, specimen_count }

  singleclick handler (bee-map.ts)
    Check sampleLayer first (via forEachFeatureAtPixel with layerFilter)
    → if hit: set selectedInatSample, clear selectedSamples
    Check speicmenLayer second (existing getFeatures path)
    → if hit: existing buildSamples() logic, clear selectedInatSample
```

---

## Patterns to Follow

### Pattern 1: Extend ParquetSource with configurable columns and feature mapping

The current `ParquetSource` hardcodes the ecdysis column list at module scope in `parquet.ts`. Extract it as a constructor option so both specimen and sample sources can use the same class without duplication.

```typescript
// parquet.ts (modified)
export interface ParquetSourceOptions {
  url: string;
  columns: string[];
  featureFromRow: (obj: Record<string, unknown>) => Feature | null;
}

export class ParquetSource extends VectorSource {
  constructor({ url, columns, featureFromRow }: ParquetSourceOptions) {
    const load = (extent, resolution, projection, success, failure) => {
      asyncBufferFromUrl({ url })
        .then(buffer => parquetReadObjects({ columns, file: buffer }))
        .then(objects => {
          const features = objects
            .map(featureFromRow)
            .filter((f): f is Feature => f !== null);
          this.addFeatures(features);
          if (success) success(features);
        })
        .catch(failure);
    };
    super({ loader: load, strategy: all });
  }
}
```

The caller in `bee-map.ts` provides column lists and mapping functions for both sources, keeping the schema knowledge close to the usage site.

### Pattern 2: Layer-discriminated singleclick handler

The current handler calls `speicmenLayer.getFeatures(event.pixel)` — it is already layer-specific. With two layers, extend this to check `sampleLayer` first (iNat markers render on top in z-order), then fall through to the existing specimen cluster logic:

```typescript
this.map.on('singleclick', async (event: MapBrowserEvent) => {
  // Check iNat sample layer first (rendered on top)
  let inatHit = false;
  this.map!.forEachFeatureAtPixel(event.pixel, (feature) => {
    this.selectedInatSample = {
      observer:      feature.get('observer') as string,
      dateStr:       feature.get('date_str') as string,
      specimenCount: feature.get('specimen_count') as number,
      observationId: (feature.getId() as string).replace('inat:', ''),
    };
    this.selectedSamples = null;
    inatHit = true;
    return true; // stop iteration after first hit
  }, { layerFilter: (l) => l === sampleLayer });

  if (inatHit) return;

  // Fall through: existing specimen cluster logic
  const hits = await speicmenLayer.getFeatures(event.pixel);
  if (!hits.length) {
    this.selectedSamples = null;
    this.selectedInatSample = null;
    return;
  }
  // ... existing buildSamples() path ...
});
```

`map.forEachFeatureAtPixel` with `layerFilter` is the canonical OL approach for multi-layer hit discrimination (HIGH confidence — documented API). The `return true` from the callback terminates iteration after the first hit, preventing spurious double-fires on overlapping points.

### Pattern 3: Visually distinct sample marker style

Sample markers must be distinguishable from specimen cluster circles at a glance. Use a square/diamond `RegularShape` in iNat green. No count label (each iNat observation is one marker, not a cluster):

```typescript
// style.ts (new export)
import RegularShape from 'ol/style/RegularShape.js';

export const sampleStyle = new Style({
  image: new RegularShape({
    fill:   new Fill({ color: '#74ac00' }),    // iNaturalist brand green
    stroke: new Stroke({ color: '#ffffff', width: 1 }),
    points: 4,
    radius: 7,
    angle:  Math.PI / 4,  // rotate 45° → diamond orientation
  }),
});
```

A static `Style` object is safe here because sample markers carry no variable state (no filter, no count). Pass it directly as `sampleLayer`'s `style` option.

The `sampleLayer` does not use a `Cluster` source. iNat observations represent distinct collection events; clustering hides individual events and conflicts with the "who collected, when" sidebar detail. The layer expects hundreds of points, not tens of thousands — no render performance concern.

### Pattern 4: Three-state sidebar render

`BeeSidebar` currently renders either the summary panel or specimen detail. Add a third state: iNat observation detail. Introduce a new `@property` and branch in `render()`:

```typescript
// bee-sidebar.ts additions

export interface InatSample {
  observer:      string;
  dateStr:       string;      // ISO date string — formatted by _renderInatDetail()
  specimenCount: number;
  observationId: string;      // for iNat observation URL
}

// In BeeSidebar class:
@property({ attribute: false })
inatSample: InatSample | null = null;

render() {
  return html`
    ${this._renderFilterControls()}
    ${this.inatSample !== null
      ? this._renderInatDetail(this.inatSample)
      : this.samples !== null
        ? this._renderDetail(this.samples)
        : this._renderSummary()}
  `;
}

private _renderInatDetail(sample: InatSample) {
  const url = `https://www.inaturalist.org/observations/${sample.observationId}`;
  const date = new Date(sample.dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return html`
    <button class="back-btn" @click=${() => this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }))}>Back</button>
    <div class="panel-content">
      <h3>iNaturalist Collection</h3>
      <dl>
        <dt>Observer</dt><dd>${sample.observer}</dd>
        <dt>Date</dt><dd>${date}</dd>
        <dt>Specimens</dt><dd>${sample.specimenCount === 0 ? 'Not yet entered' : sample.specimenCount}</dd>
      </dl>
      <a href=${url} target="_blank" rel="noopener">View on iNaturalist</a>
    </div>
  `;
}
```

`BeeMap` clears `selectedInatSample` (sets to `null`) on filter change and on any specimen cluster click, mirroring the existing pattern for `selectedSamples`.

### Pattern 5: iNat API pagination via id_above

The iNat API v1 caps responses at 200 per page and limits offset-based pagination to the first 10,000 results. For larger result sets, use `id_above` with ascending `order_by=id`:

```python
# data/inat/download.py (pseudocode pattern)
import requests, pandas as pd

def fetch_all(project_id: int) -> list[dict]:
    results = []
    id_above = 0
    while True:
        resp = requests.get(
            'https://api.inaturalist.org/v1/observations',
            params={
                'project_id': project_id,
                'per_page': 200,
                'order_by': 'id',
                'order': 'asc',
                'id_above': id_above,
                'fields': 'id,user.login,observed_on,geojson,ofvs',
            }
        )
        resp.raise_for_status()
        page = resp.json()['results']
        results.extend(page)
        if len(page) < 200:
            break
        id_above = page[-1]['id']
    return results
```

This pattern handles arbitrarily large project observation counts without hitting the 10,000-row offset cap (HIGH confidence per iNat API recommended practices).

---

## Integration Points: New vs Modified

| File | Status | Change Summary |
|------|--------|---------------|
| `data/inat/download.py` | **NEW** | iNat API fetch + pagination, extracts observer/date/coords/specimen_count, writes `samples.parquet` |
| `scripts/build-data.sh` | **MODIFIED** | Add `uv run python inat/download.py` step; add `cp data/samples.parquet frontend/src/assets/samples.parquet` |
| `frontend/src/assets/samples.parquet` | **NEW** | Committed stub/fallback (empty schema matching expected columns) |
| `frontend/src/parquet.ts` | **MODIFIED** | Extract `columns` + `featureFromRow` as constructor args; existing behavior preserved |
| `frontend/src/style.ts` | **MODIFIED** | Add `sampleStyle` export |
| `frontend/src/bee-map.ts` | **MODIFIED** | Import `samplesDump`, construct `sampleSource` + `sampleLayer`, add to OL Map, update singleclick, add `selectedInatSample` reactive state, pass `inatSample` to sidebar |
| `frontend/src/bee-sidebar.ts` | **MODIFIED** | Add `InatSample` interface, `inatSample` property, `_renderInatDetail()`, three-branch `render()` |

**No new files required** in `infra/`, no new npm packages, no CDK changes.

---

## Build Order (Dependency-Aware)

The dependency chain is strictly linear, with two parallel sub-paths in the middle:

```
Step 1  data/inat/download.py
          (iNat API → samples.parquet)
          Unblocks: step 2 for end-to-end verification

Step 2  scripts/build-data.sh
          (add iNat download step, add cp)
          Unblocks: end-to-end pipeline test

Step 3  frontend/src/parquet.ts refactor
          (constructor accepts columns + featureFromRow)
          Unblocks: steps 4 and 5 (parallel)

Step 4  frontend/src/style.ts — sampleStyle
          (new export, independent of step 5)
          Unblocks: step 5

Step 5  frontend/src/bee-map.ts
          (import samplesDump, sampleSource, sampleLayer,
           updated singleclick, selectedInatSample state)
          Depends on steps 3 and 4
          Unblocks: step 6

Step 6  frontend/src/bee-sidebar.ts
          (InatSample interface, inatSample property, _renderInatDetail)
          Depends on step 5 (InatSample type is defined in bee-map.ts or
          bee-sidebar.ts; if defined in sidebar it is imported by bee-map.ts)
```

Steps 1 and 3 can be developed in parallel. Steps 4 and 3 can be developed in parallel. Step 5 must wait for both 3 and 4. Step 6 must wait for step 5.

Frontend development (steps 3–6) can proceed against a hand-crafted stub `samples.parquet` before the pipeline (steps 1–2) is complete — the `?url` import pattern works with any valid Parquet file in `assets/`.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Merging specimens and iNat observations into one Parquet

**What goes wrong:** Combining ecdysis and iNat rows into a single `combined.parquet`.

**Why bad:** The schemas are incompatible (specimens have taxon columns; iNat observations have observer/specimen_count). Merging forces nullable columns everywhere, complicates the pipeline, and prevents independent update cadences — an ecdysis pipeline failure would also wipe the iNat data.

**Instead:** Keep two Parquet files. The additional fetch is negligible (same CloudFront origin, HTTP range requests).

### Anti-Pattern 2: Fetching samples.parquet at runtime from a separate S3 URL

**What goes wrong:** Skip bundling samples.parquet; fetch it from a raw S3 bucket URL at runtime.

**Why bad:** Requires S3 CORS configuration, CloudFront behavior changes to forward the `Origin` header, and is vulnerable to the CloudFront CORS caching edge case (a cached response without CORS headers blocks all future cross-origin requests until TTL expires). No fallback mechanism.

**Instead:** Bundle as a `?url` import. Same origin = no CORS. Zero infra changes.

### Anti-Pattern 3: Clustering iNat sample markers

**What goes wrong:** Wrapping `sampleSource` in an OL `Cluster` source.

**Why bad:** iNat observations are distinct collection events. Clustering hides individual events and breaks the sidebar "who collected, when" detail. With hundreds of points, render performance is not a concern.

**Instead:** Use `sampleSource` directly in `sampleLayer` with no cluster wrapper. Fixed-size diamond marker handles single-point rendering cleanly.

### Anti-Pattern 4: Running iNat download unconditionally in CI on every branch push

**What goes wrong:** Adding `inat/download.py` to `build-data.sh` causes it to run on every CI push (all branches), hitting the iNat API on every commit.

**Why bad:** iNat API has rate limits. CI currently runs on all branches per the GitHub Actions workflow (`on: push: branches: ['**']`). Repeated API calls for non-main branch pushes are wasteful and introduce a new external failure point.

**Instead:** Commit `samples.parquet` as a fallback (same pattern as `ecdysis.parquet`). The CI build uses the committed file unless the pipeline step is explicitly triggered. Alternatively gate the iNat download in `build-data.sh` behind `${GITHUB_REF:-} == refs/heads/main` or run it in the `deploy` job only.

### Anti-Pattern 5: Using map.getFeaturesAtPixel without layerFilter

**What goes wrong:** `map.getFeaturesAtPixel(pixel)` or `map.forEachFeatureAtPixel(pixel, cb)` without a `layerFilter` hits features from both `speicmenLayer` (cluster features, which have a `features` property) and `sampleLayer` (raw iNat features). Cluster features require `feature.get('features')` unwrapping; iNat features do not. Mixing both in the same callback requires type-checking that is fragile.

**Instead:** Call `forEachFeatureAtPixel` with `{ layerFilter: (l) => l === sampleLayer }` first, then the existing `speicmenLayer.getFeatures(pixel)` call. Each handler knows exactly what kind of feature it is dealing with.

---

## Scalability Considerations

| Concern | Current (hundreds of iNat obs) | At 5K+ iNat obs | Notes |
|---------|-------------------------------|-----------------|-------|
| samples.parquet size | ~10–20 KB (6 columns, 300 rows) | ~200 KB (5K rows) | Negligible at both scales |
| OL render (unclustered) | Fast — hundreds of points | Fast — VectorLayer handles thousands without cluster | No performance action needed |
| iNat API pagination | Single page (< 200 obs) | Multiple pages via id_above | download.py loop handles this |
| CI API calls | Risk even at small scale | Higher risk at large scale | Committed fallback mitigates |

---

## Sources

- **iNaturalist API v1 docs** (official): https://api.inaturalist.org/v1/docs/
- **iNat API recommended practices** (id_above pagination): https://www.inaturalist.org/pages/api+recommended+practices
- **OpenLayers VectorLayer API** (getFeatures, forEachFeatureAtPixel): https://openlayers.org/en/latest/apidoc/module-ol_layer_Vector-VectorLayer.html
- **OpenLayers hit-tolerance example**: https://openlayers.org/en/latest/examples/hit-tolerance.html
- **hyparquet asyncBufferFromUrl**: https://github.com/hyparam/hyparquet
- **Vite static asset handling** (?url imports): https://vite.dev/guide/assets
- **CloudFront + S3 CORS caching edge cases**: https://advancedweb.hu/how-cloudfront-solves-cors-problems/
- **Existing codebase** (direct inspection, HIGH confidence):
  - `frontend/src/bee-map.ts` — current map/click setup
  - `frontend/src/parquet.ts` — ParquetSource implementation
  - `frontend/src/bee-sidebar.ts` — current sidebar structure
  - `frontend/src/style.ts` — clusterStyle pattern
  - `frontend/src/filter.ts` — FilterState singleton pattern
  - `scripts/build-data.sh` — pipeline script
  - `data/ecdysis/occurrences.py` — Parquet output pattern
  - `.github/workflows/build-and-deploy.yml` — CI runs on all branches

*Research updated: 2026-02-25 for v1.1 milestone*
