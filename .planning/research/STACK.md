# Stack Research

**Domain:** v1.4 Sample Layer — frontend additions to existing OpenLayers + Lit + hyparquet static app
**Researched:** 2026-03-12
**Confidence:** HIGH — all claims verified against actual source files in this repo

---

## Key Finding: Zero New npm Dependencies

All four v1.4 features are achievable with the current installed packages:
- `ol` 10.7.0 — `VectorLayer`, `VectorSource`, `layer.setVisible()`, `layer.getFeatures()`
- `hyparquet` 1.23.3 — `asyncBufferFromUrl` + `parquetReadObjects` (already reads two Parquet files)
- `lit` 3.2.1 — `@property`, `@state`, multi-mode `render()` pattern already established

The work is purely additive TypeScript inside `frontend/src/`.

---

## Recommended Stack

### Core Technologies (unchanged — context for integration)

| Technology | Version | Purpose | v1.4 Role |
|------------|---------|---------|-----------|
| `ol` | 10.7.0 installed | Map rendering | `VectorLayer` (plain, no Cluster) for sample dots; `layer.setVisible()` for exclusive toggle |
| `lit` | 3.2.1 installed | Web components | `BeeMap` hosts toggle state; `BeeSidebar` gets new `InatSample` render branch and `linksMap` property |
| `hyparquet` | 1.23.3 installed | Client-side Parquet reads | Loads `samples.parquet` and `links.parquet` using same `asyncBufferFromUrl` + `parquetReadObjects` pattern |
| TypeScript | 5.8.x | Type safety | `BigInt` coercion required for Int64 fields from hyparquet (see notes below) |

### OL Classes Used by New Features

| OL Class | Import Path | Feature | Notes |
|----------|-------------|---------|-------|
| `VectorLayer` | `ol/layer/Vector.js` | Sample dot layer | Already imported in `bee-map.ts`; no Cluster wrapper needed |
| `Vector` (VectorSource) | `ol/source/Vector.js` | Backing source for `SampleParquetSource` | Already used as `ParquetSource` base class |
| `Style`, `Circle`, `Fill`, `Stroke` | `ol/style/` | Sample dot appearance | Already imported in `style.ts`; add a `sampleDotStyle` export |

---

## Feature-by-Feature Integration

### 1. Unclustered Sample VectorLayer

**What:** A second `VectorLayer` backed by a new `SampleParquetSource` reading `samples.parquet`.
No `Cluster` source — each iNat observation renders as a single dot.

**samples.parquet schema** (from `data/inat/download.py` DTYPE_MAP):

| Column | Type | hyparquet JS type | Use |
|--------|------|------------------|-----|
| `observation_id` | int64 | `number` | Feature ID: `inat:${observation_id}` |
| `observer` | string | `string` | Sidebar display |
| `date` | string "YYYY-MM-DD" | `string` | Parse for display |
| `lat` | float64 | `number` | Coordinate |
| `lon` | float64 | `number` | Coordinate |
| `specimen_count` | Int64 nullable | `bigint \| null` | Coerce: `obj.specimen_count != null ? Number(obj.specimen_count) : null` |
| `downloaded_at` | string | `string` | Not needed — omit from `columns` list |

**Implementation pattern:** Add `SampleParquetSource` as a second export in `frontend/src/parquet.ts`.
Do not make `ParquetSource` generic — the column lists are stable and small; a concrete subclass
is simpler and keeps the loader function readable.

```typescript
// parquet.ts addition — new concrete class
const sampleColumns = ['observation_id', 'lat', 'lon', 'observer', 'date', 'specimen_count'];

export class SampleParquetSource extends VectorSource {
  constructor({url}: {url: string}) {
    const load = (extent, resolution, projection, success, failure) => {
      asyncBufferFromUrl({url})
        .then(buffer => parquetReadObjects({columns: sampleColumns, file: buffer}))
        .then(objects => {
          const features = objects.flatMap(obj => {
            if (obj.lat == null || obj.lon == null) return [];
            const f = new Feature();
            f.setGeometry(new Point(fromLonLat([obj.lon, obj.lat])));
            f.setId(`inat:${obj.observation_id}`);
            f.setProperties({
              observer: obj.observer,
              date: obj.date,
              // Int64 → number coercion: hyparquet returns BigInt for INT64 columns
              specimenCount: obj.specimen_count != null ? Number(obj.specimen_count) : null,
            });
            return f;
          });
          this.addFeatures(features);
          if (success) success(features);
        })
        .catch(failure);
    };
    super({loader: load, strategy: all});
  }
}
```

**Style:** Add `sampleDotStyle` to `style.ts` — a simple fixed-color `Style` (e.g. blue circle,
radius 5) with no recency tiers. iNat observation dots are a distinct data type and should
be visually differentiated from specimen clusters.

**Feature ID convention:** `inat:${observation_id}` parallels the existing `ecdysis:${ecdysis_id}`
convention. This lets the click handler identify which layer produced a feature without
inspecting layer membership.

### 2. Exclusive Layer Toggle

**What:** Clicking a UI toggle shows either the specimen layer or the sample layer, never both.

**State:** One `@state() private _activeLayer: 'specimens' | 'samples' = 'specimens'` on `BeeMap`.

**Mechanism:** `layer.setVisible(bool)` — standard OL API. OL stops rendering invisible layers
immediately; no re-fetch, no cleanup needed. Call `this.map?.render()` after both `setVisible()`
calls, matching the existing pattern in `_applyFilter`.

```typescript
private _setActiveLayer(layer: 'specimens' | 'samples') {
  this._activeLayer = layer;
  specimenLayer.setVisible(layer === 'specimens');
  sampleLayer.setVisible(layer === 'samples');
  this.map?.render();
  // Clear any open sidebar detail when switching layers
  this.selectedSamples = null;
  this._selectedInatSample = null;
}
```

**Click handler separation:** The existing `singleclick` handler calls
`specimenLayer.getFeatures(event.pixel)`. OL's `getFeatures` still detects invisible layers,
so gate on `_activeLayer` explicitly:

```typescript
this.map.on('singleclick', async (event) => {
  if (this._activeLayer === 'specimens') {
    const hits = await specimenLayer.getFeatures(event.pixel);
    // ... existing logic ...
  } else {
    const hits = await sampleLayer.getFeatures(event.pixel);
    // ... new iNat sample logic ...
  }
});
```

**Toggle UI:** A `<button>` or `<select>` in `BeeMap`'s template, styled consistently with
the existing sidebar buttons. No new component needed.

### 3. Sample Sidebar Content

**What:** Clicking an iNat sample dot shows observation details in the sidebar.

**Interface additions to `bee-sidebar.ts`:**

```typescript
export interface InatSample {
  observationId: number;    // coerced from BigInt by SampleParquetSource
  observer: string;
  date: string;             // "YYYY-MM-DD" — sidebar parses with Intl.DateTimeFormat
  specimenCount: number | null;
}
```

**Sidebar changes:** Add `@property({ attribute: false }) inatSample: InatSample | null = null`
to `BeeSidebar`. Extend `render()` with a third branch:

```typescript
render() {
  return html`
    ${this._renderFilterControls()}
    ${this.inatSample !== null
      ? this._renderInatSampleDetail(this.inatSample)
      : this.samples !== null
        ? this._renderDetail(this.samples)
        : this._renderSummary()}
  `;
}
```

**`_renderInatSampleDetail` content:**
- Formatted date ("Month YYYY" via `Intl.DateTimeFormat`)
- Observer username
- Specimen count (if not null)
- Link to iNat observation: `https://www.inaturalist.org/observations/${observationId}`
- Back button (dispatches `close` event, same as existing `_clearSelection`)

**No new component.** `BeeSidebar` already has a multi-mode render structure. A fourth
method is consistent with the established pattern.

### 4. links.parquet — iNat Observation Link in Specimen Sidebar

**What:** When a specimen has an iNat link, show a hyperlink in the specimen detail panel.

**links.parquet schema** (from `data/links/fetch.py`):

| Column | Type | hyparquet JS type | Notes |
|--------|------|------------------|-------|
| `occurrenceID` | string | `string` | Key — matches `s.occid` in `Specimen` interface |
| `inat_observation_id` | Int64 nullable | `bigint \| null` | Coerce to `number`; omit nulls from Map |

**Loading pattern:** Load `links.parquet` at startup in `firstUpdated()`, in parallel with
`specimenSource` (both fire immediately, no sequential dependency). Build a
`Map<string, number>` keyed by `occurrenceID`:

```typescript
// In bee-map.ts firstUpdated():
asyncBufferFromUrl({url: linksDump})
  .then(buf => parquetReadObjects({columns: ['occurrenceID', 'inat_observation_id'], file: buf}))
  .then(rows => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.inat_observation_id != null) {
        m.set(r.occurrenceID as string, Number(r.inat_observation_id));
      }
    }
    this._linksMap = m;
  });
```

**State on `BeeMap`:** `@state() private _linksMap: Map<string, number> = new Map()`.
When populated, Lit triggers a re-render — any open specimen sidebar panel automatically
refreshes to show the newly available links.

**Pass to sidebar:** `@property() linksMap: Map<string, number>` on `BeeSidebar`.
In `_renderDetail`, look up each specimen's `occid`:

```typescript
const inatId = this.linksMap.get(s.occid);
// if inatId: html`<a href="https://www.inaturalist.org/observations/${inatId}" ...>View on iNaturalist</a>`
```

**File size:** links.parquet is one row per ecdysis specimen (~7,000 rows at current project
scale). A `Map` of 7k entries is negligible. The `all` loading strategy is correct.

---

## BigInt Handling (Cross-Cutting Concern)

hyparquet returns Parquet INT64 columns as JavaScript `BigInt`, not `number`. This affects:
- `samples.parquet` `specimen_count` (nullable Int64)
- `links.parquet` `inat_observation_id` (nullable Int64)

**Rule:** Coerce with `Number()` at the point of reading, before storing on OL features or
in the `_linksMap`. `BigInt` values in Lit templates produce no visible output and no error —
they silently fail. TypeScript catches this if column types are declared correctly as
`bigint | null`.

The existing `parquet.ts` has this same issue for `year` and `month` columns — it uses
`Number(obj.year)` already. Follow the same pattern.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| New state management library (Zustand, MobX, etc.) | `FilterState` singleton + `@state` already handles app state; two new booleans do not justify a framework | Extend existing singleton or add module-level variable |
| Generic `ParquetSource<T, Columns>` | TypeScript complexity for zero runtime benefit; column lists are stable | `SampleParquetSource` as second concrete class in `parquet.ts` |
| Separate `bee-sample-sidebar.ts` component | `BeeSidebar` already has multi-mode render; a fourth method is consistent, a new component is unnecessary indirection | `_renderInatSampleDetail` method on existing `BeeSidebar` |
| `ol/interaction/Select` for click handling | Already using `singleclick` map event with `layer.getFeatures(pixel)` | Keep `singleclick` handler; add `sampleLayer.getFeatures()` branch |
| Lazy loading links.parquet | File is small; parallel load at startup is simpler than on-demand async click path | Load in `firstUpdated()` alongside specimen source |
| Clustering for sample layer | iNat observations are collection events (one dot = one field trip); clustering obscures the data's meaning | Plain `VectorLayer`, no `Cluster` source |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `layer.setVisible()` for exclusive toggle | Remove/re-add layer from map layers array | Only if layers need different z-order on toggle; not needed here |
| `Map<string, number>` lookup for links | Embed iNat links into ecdysis features at load time | Would require a client-side join across two parquet files — adds complexity and couples load order |
| Load links.parquet in `firstUpdated()` (parallel) | Load only on first specimen click | Parallel load is simpler (no async click path); file is small |
| `SampleParquetSource` concrete class | Make `ParquetSource` accept columns as constructor param | Acceptable alternative if more parquet sources are expected; for two sources, concrete classes are simpler |

---

## Version Compatibility

| Package | Version | Notes |
|---------|---------|-------|
| `ol` | 10.7.0 | `layer.setVisible()`, `layer.getFeatures(pixel)`, `VectorLayer` — all stable OL APIs, used in existing code |
| `hyparquet` | 1.23.3 | INT64 → `BigInt` is documented behavior; `Number()` coercion required |
| `lit` | 3.2.1 | `@property`, `@state`, multi-mode `render()` — pattern already in production |
| TypeScript | 5.8.x | `bigint | null` union type works without flags |

---

## Installation

No changes to `package.json`. All required libraries are already installed.

```bash
# No new packages
```

Vite asset import for new parquet files (same pattern as existing `ecdysis.parquet`):

```typescript
// bee-map.ts additions
import samplesDump from './assets/samples.parquet?url';
import linksDump from './assets/links.parquet?url';
```

Both files must be present in `frontend/src/assets/` at build time. `links.parquet` is
produced by the v1.3 pipeline (`npm run fetch-links`). `samples.parquet` is produced by
the v1.2 pipeline (`npm run fetch-inat`).

---

## Sources

- `frontend/src/bee-map.ts` — VectorLayer / ClusterSource / singleclick / filterState singleton patterns (HIGH)
- `frontend/src/parquet.ts` — ParquetSource implementation, column loading, BigInt `Number()` coercion (HIGH)
- `frontend/src/bee-sidebar.ts` — Sample/DataSummary/FilteredSummary multi-mode render pattern (HIGH)
- `frontend/src/filter.ts` — FilterState singleton pattern (HIGH)
- `frontend/package.json` — installed versions ol 10.7.0, hyparquet 1.23.3, lit 3.2.1 (HIGH)
- `data/inat/download.py` DTYPE_MAP — samples.parquet schema (HIGH)
- `data/links/fetch.py` — links.parquet schema, occurrenceID key type, Int64 nullable (HIGH)
- OpenLayers `layer.setVisible()`, `VectorLayer`, `getFeatures(pixel)` — used in existing code (HIGH)
- hyparquet INT64/BigInt — consistent with JS BigInt spec; `Number()` coercion pattern already in `parquet.ts` (HIGH)

---
*Stack research for: v1.4 Sample Layer — Washington Bee Atlas frontend*
*Researched: 2026-03-12*
