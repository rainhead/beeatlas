# Architecture Research

**Domain:** Static frontend map app — OpenLayers + Lit + hyparquet, v1.4 Sample Layer extension
**Researched:** 2026-03-12
**Confidence:** HIGH — all claims derived from direct inspection of current source files

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                 bee-map.ts  (LitElement host)                        │
│                                                                      │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐  │
│  │  OL Map                      │  │  bee-sidebar.ts              │  │
│  │                              │  │                              │  │
│  │  TileLayer (base x2)         │  │  @property samples           │  │
│  │                              │  │  @property inatSamples  NEW  │  │
│  │  specimenLayer               │  │  @property layerMode    NEW  │  │
│  │    ClusterSource             │  │  @property summary           │  │
│  │      ParquetSource           │  │  @property filteredSummary   │  │
│  │        ecdysis.parquet       │  │  @property taxaOptions       │  │
│  │                              │  │  @property linksMap     NEW  │  │
│  │  sampleLayer  (NEW)          │  │  @property restored*         │  │
│  │    VectorSource              │  └──────────────────────────────┘  │
│  │      SampleSource  (NEW)     │                                    │
│  │        samples.parquet       │  @state _layerMode           NEW  │
│  └──────────────────────────────┘  @state _linksMap            NEW  │
│                                    @state _selectedInatSamples  NEW  │
│  filterState singleton (filter.ts) — unchanged                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `bee-map.ts` | Modified | OL map host; owns both layers and `_layerMode`; loads all three parquet files; routes click events by mode; pushes `_linksMap` and `inatSamples` to sidebar |
| `bee-sidebar.ts` | Modified | Renders filter controls + detail panel; mode-aware: shows specimen or iNat detail based on `layerMode`; shows iNat link on specimens when `linksMap` has a match |
| `parquet.ts` | Modified | Add `occurrenceID` column to `ParquetSource`; add `SampleSource` class for samples.parquet |
| `style.ts` | Modified | Add `sampleDotStyle` function — fixed-size dot for sample markers |
| `filter.ts` | Unchanged | FilterState singleton; `matchesFilter`, `isFilterActive` — specimen-only, not applied to sample layer |
| `links.parquet` | New asset | Join table: `occurrenceID` (string UUID) → `inat_observation_id` (Int64 nullable); loaded into a `Map` in memory, never an OL source |

---

## Data Schemas (confirmed from pipeline source)

### samples.parquet
```
observation_id   int64
observer         string        iNat login
date             string        "YYYY-MM-DD"
lat              float64
lon              float64
specimen_count   Int64         nullable
downloaded_at    string
```

### links.parquet
```
occurrenceID           string    UUID, e.g. "Symbiota:Occurrence:abc123"
inat_observation_id    Int64     nullable — null when Ecdysis page has no iNat link
```

### Key join note

The OL specimen feature ID is `ecdysis:{integer_ecdysis_id}`. The links.parquet join key is the UUID `occurrenceID`. `ecdysis.parquet` already has both columns. The `ParquetSource` must store `occurrenceID` as a feature property so the sidebar can perform the lookup. The integer `ecdysis_id` (extracted from the feature ID) is what the Ecdysis detail page URL uses (`?occid=<integer>`).

---

## Recommended File Changes

```
frontend/src/
├── bee-map.ts        MODIFIED — _layerMode state; sampleLayer; linksMap load;
│                                click handler branch; URL param lm/si; toggle handler
├── bee-sidebar.ts    MODIFIED — accept layerMode, inatSamples, linksMap props;
│                                render iNat detail panel; iNat link on specimen detail;
│                                hide filter controls in sample mode
├── parquet.ts        MODIFIED — add occurrenceID to ParquetSource columns;
│                                add SampleSource class
├── style.ts          MODIFIED — add sampleDotStyle (fixed dot, no text label)
├── filter.ts         UNCHANGED
└── assets/
    ├── ecdysis.parquet   UNCHANGED (already has occurrenceID column)
    ├── samples.parquet   UNCHANGED
    └── links.parquet     NEW — must be copied into assets/ by build-data.sh
```

---

## Architectural Patterns

### Pattern 1: Parallel Parquet Load

**What:** Load ecdysis.parquet (via `ParquetSource` OL loader), samples.parquet (via `SampleSource` OL loader), and links.parquet (direct hyparquet call) simultaneously. Each is independent; parallel load minimizes time-to-interactive.

**When to use:** All three files start loading in `firstUpdated()`.

**Trade-offs:** `linksMap` arrives asynchronously after the specimen `once('change')` callback fires. The iNat link on specimen detail must render when `_linksMap` is ready, not just on specimen data load. Store `_linksMap` as `@state` on BeeMap and pass it as a `@property` to `BeeSidebar` — Lit re-renders the sidebar when the map arrives.

```typescript
// In bee-map.ts firstUpdated():
asyncBufferFromUrl({ url: linksDump })
  .then(buf => parquetReadObjects({
    file: buf,
    columns: ['occurrenceID', 'inat_observation_id'],
  }))
  .then(rows => {
    const m = new Map<string, bigint>();
    for (const row of rows) {
      if (row.occurrenceID != null && row.inat_observation_id != null) {
        m.set(row.occurrenceID as string, row.inat_observation_id as bigint);
      }
    }
    this._linksMap = m;  // @state triggers sidebar re-render
  });
```

### Pattern 2: Layer Mode as @state on BeeMap

**What:** `_layerMode: 'specimens' | 'samples'` is a `@state` field on BeeMap. On toggle, call `setVisible()` on each layer and clear any active selection. Pass `_layerMode` as a `@property` to `BeeSidebar`.

**When to use:** Exclusive toggle between two layers. `setVisible()` is cheaper than adding/removing layers from the OL map and preserves layer state across toggles.

**Trade-offs:** The filter controls (taxon/year/month) are specimen-specific. In sample mode they are misleading. For v1.4 simplicity, hide them entirely when `layerMode === 'samples'`.

```typescript
@state() private _layerMode: 'specimens' | 'samples' = 'specimens';

private _toggleLayer() {
  this._layerMode = this._layerMode === 'specimens' ? 'samples' : 'specimens';
  specimenLayer.setVisible(this._layerMode === 'specimens');
  sampleLayer.setVisible(this._layerMode === 'samples');
  this.selectedSamples = null;
  this._selectedInatSamples = null;
  this._selectedOccIds = null;
  if (this.map) this._pushUrlState();
}
```

### Pattern 3: SampleSource — VectorSource for samples.parquet

**What:** A new class (or factory) in `parquet.ts` following the same VectorSource loader pattern as `ParquetSource`. Reads samples.parquet; creates one OL Feature per row with `Point` geometry and properties for observer, date, specimenCount, observationId.

**Feature ID convention:** Use `inat:${observation_id}` to namespace away from specimen feature IDs (`ecdysis:${ecdysis_id}`). This prevents OL internal ID collisions if both sources are ever queried simultaneously.

**Column list:**
```typescript
const sampleColumns = ['observation_id', 'observer', 'date', 'lat', 'lon', 'specimen_count'];
```

**Not filtered by filterState:** `sampleDotStyle` must not close over `filterState`. Sample features have no taxon properties; applying `matchesFilter` would silently hide all of them.

### Pattern 4: Separate Click Handlers Branched on Layer Mode

**What:** The existing `singleclick` handler calls `specimenLayer.getFeatures(event.pixel)`. In v1.4, branch on `_layerMode` before calling `getFeatures()`.

**When to use:** The toggle is exclusive — only one layer is visible at a time. Hit-testing an invisible layer always returns empty. Branching is cleaner than merging two empty-or-one results.

```typescript
this.map.on('singleclick', async (event: MapBrowserEvent) => {
  if (this._layerMode === 'specimens') {
    // existing logic → this.selectedSamples
  } else {
    const hits = await sampleLayer.getFeatures(event.pixel);
    if (!hits.length) {
      this._selectedInatSamples = null;
      this._selectedInatObsIds = null;
      return;
    }
    this._selectedInatSamples = buildInatSamples(hits);
    this._selectedInatObsIds = hits.map(f => f.getId() as string);
    this._pushUrlState();
  }
});
```

### Pattern 5: occurrenceID on OL Specimen Features

**What:** Add `occurrenceID` to the columns list in `ParquetSource` and store it as a feature property. This is the join key for linking to links.parquet.

```typescript
// parquet.ts — updated columns list
const columns = [
  'ecdysis_id',
  'occurrenceID',    // ← add this
  'longitude', 'latitude',
  'year', 'month', 'scientificName',
  'recordedBy', 'fieldNumber', 'genus', 'family',
];

// In feature property setup:
feature.setProperties({
  // ... existing properties ...
  occurrenceID: obj.occurrenceID,
});
```

The `Specimen` interface exported from `bee-sidebar.ts` should gain an `occurrenceID?: string` field, populated from `f.get('occurrenceID')` in `buildSamples()`.

### Pattern 6: Toggle Button in Sidebar, State Owned by BeeMap

**What:** `BeeSidebar` renders the layer toggle button (it already owns the filter-controls section — natural home for a mode switch). It fires a `layer-toggle` CustomEvent. `BeeMap` handles the event, updates `_layerMode`, and pushes new `layerMode` back to sidebar via property.

**Trade-offs vs. toggle in BeeMap template:** Sidebar approach avoids adding absolute-positioned map overlay UI. BeeMap remains the source of truth for state; sidebar is purely presentational.

---

## Data Flow

### Initialization Flow

```
firstUpdated()
    ├── Parse URL params (existing + new: lm, si params)
    ├── Construct OL Map with layers:
    │     [tileLayer x2, specimenLayer (visible), sampleLayer (hidden)]
    ├── Parallel async:
    │     specimenSource loader starts (ParquetSource)
    │     sampleSource loader starts (SampleSource)        [independent]
    │     links.parquet load → _linksMap @state             [independent]
    └── Restore layerMode from URL lm= param
        (set initial layer visibility accordingly)

specimenSource.once('change', cb)
    └── Compute summary, taxaOptions, filteredSummary (existing)
        Restore selected specimens from URL o= (existing)
        _linksMap may or may not be ready — sidebar renders link lazily when it arrives
```

### Layer Toggle Flow

```
User clicks toggle button (inside bee-sidebar filter-controls)
    ↓
BeeSidebar fires CustomEvent 'layer-toggle'
    ↓
BeeMap._toggleLayer()
    ├── _layerMode flips ('specimens' ↔ 'samples')
    ├── specimenLayer.setVisible() / sampleLayer.setVisible()
    ├── selectedSamples = null, _selectedInatSamples = null
    └── _pushUrlState()  — encodes lm= in URL
    ↓
Lit re-renders: passes layerMode prop to <bee-sidebar>
    ├── 'specimens': show filter controls, summary/specimen detail
    └── 'samples': hide filter controls, show iNat sample count or detail
```

### Specimen iNat Link Flow

```
User clicks specimen cluster (specimenLayer visible)
    ↓
existing singleclick handler → buildSamples(features) → Sample[]
  Each Sample.species[] item now has .occurrenceID (new field)
    ↓
<bee-sidebar samples=[...] linksMap={_linksMap}>
    For each specimen in species list:
        if linksMap?.has(specimen.occurrenceID):
            render <a href="https://www.inaturalist.org/observations/{id}">iNat</a>
    (linksMap may be null briefly during load — link just doesn't show until ready)
```

### Sample Click + Detail Flow

```
User clicks sample dot (sampleLayer visible)
    ↓
map 'singleclick' → sampleLayer.getFeatures(pixel)
    ↓
buildInatSamples(hits) → InatSample[]
    ↓
_selectedInatSamples = [...] (@state → Lit re-render)
    ↓
<bee-sidebar inatSamples=[...] layerMode='samples'>
    Renders: observer, date, specimen_count (if non-null), iNat link
    iNat URL: https://www.inaturalist.org/observations/{observationId}
```

---

## Integration Points

### New vs. Modified — Explicit Inventory

| File | New / Modified | Change Summary |
|------|----------------|----------------|
| `frontend/src/parquet.ts` | Modified | Add `occurrenceID` to columns array; add `SampleSource` class |
| `frontend/src/style.ts` | Modified | Add `sampleDotStyle(feature): Style` — simple circle, no text, fixed radius |
| `frontend/src/bee-map.ts` | Modified | `_layerMode` @state; `_linksMap` @state; `_selectedInatSamples` @state; sampleLayer construction; parallel links.parquet load; singleclick branch; toggle handler; URL params `lm` and `si`; pass new props to `<bee-sidebar>` |
| `frontend/src/bee-sidebar.ts` | Modified | New `@property` fields: `layerMode`, `inatSamples`, `linksMap`; new `InatSample` interface; `_renderInatDetail()` method; iNat link in `_renderDetail()` for specimens; hide filter in sample mode; toggle button |
| `frontend/src/assets/links.parquet` | New | Static asset bundled by Vite; copied by `build-data.sh` |
| `scripts/build-data.sh` | Modified | Add `cp data/links.parquet frontend/src/assets/links.parquet` |
| `filter.ts` | Unchanged | No changes |
| `infra/` (CDK) | Unchanged | No new AWS resources; `links.parquet` deploys via existing `aws s3 sync` |

### URL State Extension

Add two new params — both backward compatible (absent = default behavior):

| Param | Values | Meaning |
|-------|--------|---------|
| `lm` | `samples` | Layer mode is sample; absent means specimens |
| `si` | `inat:12345,inat:67890` | Selected iNat observation IDs (comma-separated) |

The existing `o=` param encodes specimen occurrence IDs (filtered by `startsWith('ecdysis:')`). Keep it as-is — do not repurpose for iNat IDs. Use separate `si=` for iNat selections.

### New TypeScript Interfaces

```typescript
// In bee-sidebar.ts (exported):
export interface InatSample {
  observationId: number;
  observer: string;
  date: string;           // "YYYY-MM-DD"
  specimenCount: number | null;
}

// Updated Specimen (add occurrenceID):
export interface Specimen {
  name: string;
  occid: string;          // integer ecdysis_id string (for Ecdysis URL)
  occurrenceID?: string;  // UUID (for links.parquet lookup)
}
```

---

## Build Order (Phase Dependencies)

The four requirements are MAP-03, MAP-04, MAP-05, LINK-05. Recommended implementation order:

1. **parquet.ts + style.ts + asset pipeline** (no Lit component changes)
   - Add `occurrenceID` to `ParquetSource` columns
   - Add `SampleSource` class
   - Add `sampleDotStyle`
   - Copy links.parquet into assets/ in `build-data.sh`
   - Self-contained; can be verified by checking OL feature properties in browser console

2. **sampleLayer visible + sample dots on map** (MAP-03 — partial)
   - Construct `sampleSource` and `sampleLayer` in `bee-map.ts`
   - Add both to OL Map layers (sampleLayer starts hidden)
   - Force `sampleLayer.setVisible(true)` temporarily to verify dots render

3. **Layer toggle** (MAP-04)
   - Add `_layerMode` @state to BeeMap
   - Add `_toggleLayer()` handler
   - Pass `layerMode` to `<bee-sidebar>`
   - Render toggle button in sidebar filter-controls section
   - Wire `layer-toggle` CustomEvent
   - URL `lm=` param encode/restore
   - Verify: toggle hides/shows each layer, clears selection, updates URL

4. **Sample click + detail sidebar** (MAP-05)
   - Branch singleclick handler on `_layerMode`
   - Add `buildInatSamples()` function
   - Add `_selectedInatSamples` @state; pass `inatSamples` prop to sidebar
   - Add `_renderInatDetail()` to sidebar
   - URL `si=` param encode/restore

5. **Specimen iNat link** (LINK-05)
   - Load links.parquet in `firstUpdated()`; store as `_linksMap` @state
   - Pass `linksMap` prop to sidebar
   - Update `buildSamples()` to include `occurrenceID` on each `Specimen`
   - Render iNat link in `_renderDetail()` when `linksMap?.has(specimen.occurrenceID)`

Steps 3 and 4 are somewhat independent (toggle can ship before click detail), but step 3 must precede step 4 because the click handler branch depends on `_layerMode`. Steps 1 and 5 are independent of each other and can be worked in parallel if needed.

---

## Anti-Patterns

### Anti-Pattern 1: Applying filterState to sampleLayer

**What people do:** Pass sample features through `matchesFilter(f, filterState)` to filter by year/taxon.

**Why it's wrong:** samples.parquet has no `scientificName`, `genus`, or `family` columns. `matchesFilter` reads these properties from OL Feature objects — they will all be `undefined` on sample features. With any taxon filter active, `matchesFilter` returns false for every sample feature, silently hiding all sample dots. The display count in `clusterStyle` would show 0 for all clusters.

**Do this instead:** Keep sampleLayer completely outside the filter machinery. `sampleDotStyle` must not reference `filterState`.

### Anti-Pattern 2: Reusing the Sample interface for iNat observations

**What people do:** Extend the existing `Sample` interface (collector + field number + species list) to also represent iNat collection events.

**Why it's wrong:** The data shapes are fundamentally different. `Sample` groups multiple species under one field event — it is a grouping artifact built by `buildSamples()` from multiple features. An iNat sample is a single observation: one observer, one date, one optional count. Forcing iNat data into `Sample` requires fake `fieldNumber` and empty `species[]` arrays, breaking the type contract.

**Do this instead:** Add a new `InatSample` interface (see above). Pass `inatSamples: InatSample[] | null` as a separate `@property` alongside the existing `samples: Sample[] | null`.

### Anti-Pattern 3: Loading links.parquet via an OL VectorSource

**What people do:** Create a third OL VectorSource for links.parquet to keep the loading pattern consistent.

**Why it's wrong:** links.parquet is a join table with no geometry. OL VectorSource expects features with geometry. A geometry-less source adds complexity; OL may log warnings or fail internally when `addFeatures()` receives features without geometry.

**Do this instead:** Load links.parquet directly with `asyncBufferFromUrl` + `parquetReadObjects` into a plain `Map<string, bigint>`. No OL involvement.

### Anti-Pattern 4: Looking up iNat links by ecdysis integer ID instead of occurrenceID UUID

**What people do:** Use the integer `ecdysis_id` (stored as feature ID suffix) as the key to look up in links.parquet.

**Why it's wrong:** links.parquet uses `occurrenceID` (UUID string, e.g. `"Symbiota:Occurrence:abc123"`) as its join key — this is the canonical Ecdysis identifier. The integer `ecdysis_id` is an internal DB row ID. The pipeline writes links rows keyed by UUID. Using the integer would find no matches.

**Do this instead:** Store `occurrenceID` as a feature property in `ParquetSource` and use `feature.get('occurrenceID')` as the lookup key.

### Anti-Pattern 5: Single click handler hit-testing both layers

**What people do:** Call `getFeatures()` on both `specimenLayer` and `sampleLayer` in the same handler and merge results.

**Why it's wrong:** The toggle is exclusive — only one layer is visible at a time. `getFeatures()` on an invisible layer always returns empty. The merge just produces the same result as branching, but with an extra unnecessary async call.

**Do this instead:** Branch on `_layerMode` before calling `getFeatures()`.

---

## Scaling Considerations

| Concern | Current state | Notes |
|---------|---------------|-------|
| links.parquet size | ~45K rows × 2 cols | ~200–400KB compressed. Acceptable static asset. |
| samples.parquet size | ~9.5K rows × 7 cols | Already bundled and loading. |
| Client memory for _linksMap | 45K entries as a JS Map | ~5–10MB. Acceptable for a desktop mapping app. |
| Filter controls hidden in sample mode | No functional impact | Filters still apply to specimen layer when toggled back. |

---

## Sources

- Direct inspection of: `frontend/src/bee-map.ts`, `bee-sidebar.ts`, `parquet.ts`, `filter.ts`, `style.ts` (HIGH confidence)
- Pipeline schemas: `data/inat/download.py` (samples.parquet), `data/links/fetch.py` (links.parquet) (HIGH confidence)
- Project context: `.planning/PROJECT.md` (HIGH confidence)
- No external research required — all architectural decisions are internal to an existing well-defined codebase

---

*Architecture research for: Washington Bee Atlas v1.4 Sample Layer frontend extension*
*Researched: 2026-03-12*
