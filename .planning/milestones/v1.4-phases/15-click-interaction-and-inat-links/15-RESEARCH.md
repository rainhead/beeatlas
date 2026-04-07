# Phase 15: Click Interaction and iNat Links - Research

**Researched:** 2026-03-13
**Domain:** Lit Web Components, OpenLayers singleclick, hyparquet data loading, TypeScript strict mode
**Confidence:** HIGH

## Summary

Phase 15 is a pure wiring phase with no new dependencies. All required patterns exist in the codebase already: the `SampleParquetSource` pattern in `parquet.ts` is the template for `LinksParquetSource`; the specimen singleclick handler at line 594–619 of `bee-map.ts` is the exact template for the sample dot click; and `_renderDetail` / `_renderRecentSampleEvents` in `bee-sidebar.ts` show the rendering patterns to extend.

The primary complexity is the two-interface extension: (1) `Specimen` gains an optional `inatObservationId` field that flows from `buildSamples()` which needs a `linksMap` lookup; (2) the sidebar needs a new render branch for a clicked sample dot — distinct from both `_renderDetail` (specimen cluster) and `_renderRecentSampleEvents` (list). The CONTEXT.md decisions are already highly specific: eager load, `Map<string, number>` keyed on occurrenceID UUID string, and `iNat: —` placeholder for no-match.

TypeScript `noUnusedLocals: true` is the key build constraint — private methods must be wired from `render()` before `tsc` passes, which has historically required committing Tasks 1+2 together.

**Primary recommendation:** Follow the established `SampleParquetSource` pattern for `LinksParquetSource`; extend `buildSamples()` to accept a `Map<string, number>`; add a `selectedSampleEvent: SampleEvent | null` state property to `bee-sidebar.ts` to drive the new sample dot detail view.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- iNat link appears **next to the ecdysis.org link** on each species row in specimen detail view
- Both links shown side by side: ecdysis.org link + iNat link
- When no iNat match: show a **greyed/muted placeholder** `iNat: —` (em dash, not hyphen) — muted text, not a link
- The ecdysis.org link is still present regardless of iNat match
- Load `links.parquet` **eagerly at startup**, alongside `ecdysis.parquet`
- Consistent with how all other Parquet assets load — no lazy/on-demand complexity
- Sample dot click sidebar returns to recent events list when "close"/"back" is triggered
- Uses existing `SampleEvent` interface fields — no new interface needed

### Claude's Discretion
- Exact `LinksParquetSource` implementation (follow `ParquetSource` pattern in parquet.ts)
- How `links` lookup map is built (Map<occurrenceID, inat_observation_id> keyed by UUID string)
- How `Specimen` interface is extended to carry iNat observation ID (or passed separately)
- Sample dot clicked sidebar layout — should feel consistent with the recent events row format

### Deferred Ideas (OUT OF SCOPE)
- URL encoding of selected sample marker (`inat=` param) — MAP-06, explicitly deferred in REQUIREMENTS.md
- Sample dot size-encoded by specimen count — MAP-08, deferred
- Combined specimens + samples view — MAP-07, deferred
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAP-05 | Clicking a sample dot shows observer, date, specimen count, and a link to the iNat observation in the sidebar | SampleEvent interface already has all required fields; `observation_id` field on sample features is the iNat observation ID; URL pattern is `https://www.inaturalist.org/observations/${observation_id}` |
| LINK-05 | Specimen sidebar shows a clickable iNat observation link when a linkage exists in links.parquet | `links.parquet` confirmed schema: `occurrenceID` (string) → `inat_observation_id` (Int64/nullable); `Specimen.occid` is the join key |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hyparquet | ^1.23.3 | Parquet file reading in browser | Already used for ecdysis.parquet and samples.parquet |
| lit | ^3.2.1 | Web component rendering | Already used throughout codebase |
| ol | ^10.7.0 | Map click event handling | Already used; singleclick handler pattern established |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript strict | 5.8.2 | Type safety | `noUnusedLocals: true` — must wire all private methods from render() |

**No new dependencies required for this phase.**

## Architecture Patterns

### Recommended Project Structure

No new files needed beyond adding `LinksParquetSource` to the existing `parquet.ts`. The phase touches exactly 2 source files: `parquet.ts` and `bee-map.ts` for data wiring, and `bee-sidebar.ts` for rendering. (Or `parquet.ts` can export a plain async function instead of a class — discretion item.)

### Pattern 1: LinksParquetSource (follows SampleParquetSource)

**What:** A `VectorSource` subclass (or plain async function) that reads `links.parquet` columns `['occurrenceID', 'inat_observation_id']` and resolves to a `Map<string, number>`.

**When to use:** At module level in `bee-map.ts`, loaded once at startup.

**The simplest approach:** Export a plain async function from `parquet.ts` instead of a `VectorSource` subclass, since links don't need to be map features — they're a lookup table.

```typescript
// parquet.ts — plain async function (simpler than VectorSource subclass for non-spatial data)
const linkColumns = ['occurrenceID', 'inat_observation_id'];

export async function loadLinksMap(url: string): Promise<Map<string, number>> {
  const buffer = await asyncBufferFromUrl({ url });
  const objects = await parquetReadObjects({ columns: linkColumns, file: buffer });
  const map = new Map<string, number>();
  for (const obj of objects) {
    if (obj.occurrenceID != null && obj.inat_observation_id != null) {
      map.set(obj.occurrenceID as string, Number(obj.inat_observation_id));  // BigInt coercion
    }
  }
  return map;
}
```

**Note:** `inat_observation_id` is nullable in 2358 of 46090 rows (5.1% null rate) — null check before insertion is required.

**Note:** `Number()` coercion for BigInt is the established pattern (see STATE.md "v1.4 BigInt coercion").

### Pattern 2: Building `linksMap` at startup in bee-map.ts

**What:** Load links URL at module level like `sampleSource`; call `loadLinksMap()` and store result in `_linksMap`.

```typescript
// bee-map.ts — module-level import
import linksDump from './assets/links.parquet?url';

// Inside BeeMap class:
private _linksMap: Map<string, number> = new Map();

// In firstUpdated(), alongside sampleSource.once('change'):
loadLinksMap(linksDump).then(map => { this._linksMap = map; });
```

**Note:** `links.parquet` may not exist in frontend assets on first CI run — the build script has `|| echo` for this. If `asyncBufferFromUrl` fails (404), treat as empty map: wrap in `.catch(() => new Map<string, number>())`.

### Pattern 3: Extending Specimen interface

**What:** Add optional `inatObservationId?: number | null` to the `Specimen` interface in `bee-sidebar.ts`.

```typescript
// bee-sidebar.ts
export interface Specimen {
  name: string;
  occid: string;
  inatObservationId?: number | null;
}
```

**Note:** Optional field (not required) so `buildSamples()` callers that don't pass a map still compile cleanly.

### Pattern 4: Extending buildSamples() to inject iNat IDs

**What:** Accept an optional `linksMap` parameter; look up each specimen's `occid` against the map.

```typescript
// bee-map.ts
function buildSamples(features: Feature[], linksMap?: Map<string, number>): Sample[] {
  const map = new Map<string, Sample>();
  for (const f of features) {
    const key = `${f.get('year')}-${f.get('month')}-${f.get('recordedBy')}-${f.get('fieldNumber')}`;
    if (!map.has(key)) {
      map.set(key, { year: f.get('year'), month: f.get('month'),
                     recordedBy: f.get('recordedBy'), fieldNumber: f.get('fieldNumber'), species: [] });
    }
    const occid = (f.getId() as string).replace('ecdysis:', '');
    const inatId = linksMap ? (linksMap.get(f.get('occurrenceID') as string) ?? null) : null;
    map.get(key)!.species.push({ name: f.get('scientificName') as string, occid, inatObservationId: inatId });
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}
```

**Critical:** The lookup key is the `occurrenceID` property on the feature (UUID string), NOT the feature ID which is `ecdysis:${ecdysis_id}`. Feature ID and occurrenceID are different: `f.getId()` gives `"ecdysis:5594056"` but `f.get('occurrenceID')` gives the UUID string that matches links.parquet.

### Pattern 5: Sample dot click detail in bee-sidebar.ts

**What:** A new `selectedSampleEvent: SampleEvent | null` property on `bee-sidebar`; a new `_renderSampleDotDetail()` method; render logic updated to show detail when this is set.

**Key pattern from existing render():**
```typescript
// Current render() logic:
${this.samples !== null
  ? this._renderDetail(this.samples)
  : this.layerMode === 'samples'
    ? this._renderRecentSampleEvents()
    : this._renderSummary()}
```

**Extended render() logic:**
```typescript
${this.samples !== null
  ? this._renderDetail(this.samples)
  : this.layerMode === 'samples' && this.selectedSampleEvent !== null
    ? this._renderSampleDotDetail(this.selectedSampleEvent)
    : this.layerMode === 'samples'
      ? this._renderRecentSampleEvents()
      : this._renderSummary()}
```

**What `_renderSampleDotDetail()` must show (MAP-05):**
- Observer name
- Formatted date (reuse `_formatSampleDate()`)
- Specimen count or "not recorded" when null/NaN (same logic as `_renderRecentSampleEvents`)
- Clickable iNat observation URL: `https://www.inaturalist.org/observations/${event.observation_id}`
- Back/close button that clears `selectedSampleEvent` (dispatches same `close` event or a new `sample-detail-close` event; likely just set `selectedSampleEvent = null`)

### Pattern 6: Specimen iNat links in `_renderDetail`

**What:** Each species list item currently renders an ecdysis.org link. Extend to show iNat link alongside it, or `iNat: —` placeholder.

```typescript
// bee-sidebar.ts _renderDetail (current)
${sample.species.map(s => html`
  <li>
    <a href="https://ecdysis.org/collections/individual/index.php?occid=${s.occid}" target="_blank" rel="noopener">${s.name}</a>
  </li>
`)}

// Extended:
${sample.species.map(s => html`
  <li>
    <a href="https://ecdysis.org/..." target="_blank" rel="noopener">${s.name}</a>
    ${s.inatObservationId != null
      ? html` · <a href="https://www.inaturalist.org/observations/${s.inatObservationId}" target="_blank" rel="noopener">iNat</a>`
      : html` · <span class="inat-missing">iNat: —</span>`
    }
  </li>
`)}
```

**Note:** `inatObservationId` can be `undefined` (when links not loaded yet) or `null` (explicit no-match). Both should render the placeholder.

### Anti-Patterns to Avoid

- **Using feature ID as lookup key:** `f.getId()` returns `"ecdysis:5594056"` (integer ID), NOT the UUID. The links.parquet join key is `occurrenceID` (UUID string). Must use `f.get('occurrenceID')`.
- **Treating linksMap load as blocking:** Links load is async fire-and-forget. `buildSamples()` is called from the singleclick handler which fires before or after `_linksMap` is populated. The optional parameter handles the race gracefully.
- **Omitting `.catch()` on `loadLinksMap`:** If `links.parquet` is absent from frontend assets (first CI run), `asyncBufferFromUrl` will throw. Must catch and fall back to empty map.
- **Committing task 1 without task 2:** `noUnusedLocals: true` in tsconfig means any new private method that isn't yet called from `render()` will fail `tsc`. Tasks that add new methods must also wire them in the same commit (established pattern from Phase 14).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet reading | Custom binary parser | hyparquet (already installed) | Handles all column types, BigInt coercion |
| URL construction | Template string with manual encoding | Simple template literal | `observation_id` is an integer — no encoding needed |
| Date formatting | Custom formatter | `Intl.DateTimeFormat` (already used in `_formatSampleDate`) | Handles locale, already exists |

## Common Pitfalls

### Pitfall 1: Wrong lookup key for links join
**What goes wrong:** Using `f.getId()` (which is `"ecdysis:5594056"`) as the lookup key into `linksMap`, getting no matches.
**Why it happens:** There are two distinct identifiers: `ecdysis_id` (integer, used as OL feature ID) and `occurrenceID` (UUID string, the join key).
**How to avoid:** Always use `f.get('occurrenceID')` for the links lookup. The STATE.md explicitly documents "v1.4 join key: occurrenceID (UUID string) is the join key for links.parquet — NOT the integer ecdysis_id."
**Warning signs:** All specimens show `iNat: —` despite links.parquet containing data.

### Pitfall 2: Race condition between links load and first click
**What goes wrong:** User clicks a specimen cluster before `loadLinksMap()` resolves — `_linksMap` is empty, all specimens show `iNat: —` placeholder even when they have links.
**Why it happens:** Links load is async; specimen source loads separately. Order is nondeterministic.
**How to avoid:** This is acceptable behavior per CONTEXT.md ("Links appear immediately on first specimen click, no loading state needed" — implies links load fast enough). However, if the race occurs, the placeholder is shown correctly. No special handling needed because `null` and `undefined` both render the placeholder; when data arrives later and user clicks again, correct links appear.

### Pitfall 3: noUnusedLocals breaks the build
**What goes wrong:** Adding `_renderSampleDotDetail()` to `bee-sidebar.ts` in one commit but wiring it in `render()` in a second commit fails `tsc` on the first commit.
**Why it happens:** `tsconfig.json` has `"noUnusedLocals": true`. Private methods that are never called are flagged.
**How to avoid:** Wire new private methods from `render()` in the same commit. (Established pattern documented in STATE.md for Phase 14.)

### Pitfall 4: `specimen_count` is nullable/NaN
**What goes wrong:** Rendering specimen count as a bare number shows `NaN` when `specimen_count` is null or missing.
**Why it happens:** `Number(null)` returns `0`, but `Number(undefined)` or invalid values return `NaN`. The sample feature stores `specimen_count: Number(obj.specimen_count)` which may be NaN.
**How to avoid:** Use the same guard already in `_renderRecentSampleEvents`: `event.specimen_count != null && !isNaN(event.specimen_count)`. Reuse `_formatSampleDate()` for date rendering.

### Pitfall 5: Closing sample dot detail doesn't clear selectedSampleEvent in bee-map.ts
**What goes wrong:** Back button in sample dot detail dispatches `close` event but `bee-map.ts` only sets `this.selectedSamples = null`, not `selectedSampleEvent` on the sidebar.
**Why it happens:** The existing `@close` handler clears `selectedSamples` (specimen mode). For sample mode, a separate state property drives the view.
**How to avoid:** Either: (a) handle in `bee-sidebar.ts` directly by setting `this.selectedSampleEvent = null` in a local handler (no round-trip to `bee-map`), or (b) dispatch a distinct event. Given that `selectedSampleEvent` is sidebar-internal state (not driven from bee-map), option (a) is simpler.

## Code Examples

### Loading links.parquet and building Map

```typescript
// Source: Follows SampleParquetSource pattern in parquet.ts (confirmed codebase)
const linkColumns = ['occurrenceID', 'inat_observation_id'];

export async function loadLinksMap(url: string): Promise<Map<string, number>> {
  const buffer = await asyncBufferFromUrl({ url });
  const objects = await parquetReadObjects({ columns: linkColumns, file: buffer });
  const map = new Map<string, number>();
  for (const obj of objects) {
    if (obj.occurrenceID != null && obj.inat_observation_id != null) {
      map.set(obj.occurrenceID as string, Number(obj.inat_observation_id));
    }
  }
  return map;
}
```

### Wiring in bee-map.ts firstUpdated()

```typescript
// Source: follows sampleSource.once('change') pattern in bee-map.ts line 580-585
loadLinksMap(linksDump).catch(() => new Map<string, number>()).then(map => {
  this._linksMap = map;
});
```

### Sample dot singleclick handler (replacing placeholder lines 608-616)

```typescript
// Source: mirrors specimen branch at bee-map.ts lines 595-607
} else {
  // sample mode
  const hits = await sampleLayer.getFeatures(event.pixel);
  if (!hits.length) {
    this._selectedSampleEvent = null;
    return;
  }
  const f = hits[0]!;
  this._selectedSampleEvent = {
    observation_id: f.get('observation_id') as number,
    observer: f.get('observer') as string,
    date: f.get('date') as string,
    specimen_count: f.get('specimen_count') as number,
    coordinate: (f.getGeometry() as Point).getCoordinates(),
  };
}
```

**Note:** `_selectedSampleEvent` is a `@state()` property on `BeeMap` that is passed down to `bee-sidebar` as `.selectedSampleEvent`. Alternatively, it can be managed entirely in `bee-sidebar` if bee-map passes the full feature data via a custom event.

### iNat observation URL

```
https://www.inaturalist.org/observations/${observation_id}
```

`observation_id` is an integer (already coerced from BigInt via `Number()`), so no URL encoding needed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| — | N/A — no state changes in these libraries affect this phase | — | — |

This phase uses only existing project libraries with no version changes.

**links.parquet schema (confirmed 2026-03-13):**
- `occurrenceID`: string (UUID, `large_string` Parquet type)
- `inat_observation_id`: nullable Int64 (2358/46090 rows are null = 5.1%)
- 46,090 rows total

## Open Questions

1. **Where does `selectedSampleEvent` state live — `BeeMap` or `BeeSidebar`?**
   - What we know: `BeeMap` has the singleclick handler and knows which feature was clicked. `BeeSidebar` has the render logic. The existing pattern passes `Sample[]` via property from BeeMap to sidebar.
   - What's unclear: Whether it's cleaner to pass a `SampleEvent | null` property from BeeMap down (like `samples`), or let BeeMap dispatch a custom event that sidebar handles internally.
   - Recommendation: Pass as property from BeeMap (`.selectedSampleEvent`) — consistent with how `.samples` works. BeeMap clears it on layer switch and map close.

2. **Does `links.parquet` need to be in `frontend/src/assets/` at dev time?**
   - What we know: `ecdysis.parquet` and `samples.parquet` are in `frontend/src/assets/` but `links.parquet` is not yet there. The build script copies it but only if it exists.
   - What's unclear: Whether CI/dev environment has a `links.parquet` to work with.
   - Recommendation: The graceful miss pattern (`.catch(() => new Map())`) means absence is safe. Add a `cp data/links.parquet frontend/src/assets/links.parquet || true` step to dev setup docs or Makefile, but it's not blocking.

## Validation Architecture

No automated test framework exists in the frontend project. The project's correctness gate is TypeScript compilation (`tsc && vite build`). All phase validation is manual browser testing.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no vitest/jest in package.json) |
| Config file | none |
| Quick run command | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |
| Full suite command | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-05 | Clicking sample dot shows observer, date, count, iNat link | manual | `npm run build` (type check only) | N/A |
| LINK-05 | Specimen sidebar shows iNat link when match exists, `iNat: —` when no match | manual | `npm run build` (type check only) | N/A |

### Sampling Rate
- **Per task commit:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Per wave merge:** `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Phase gate:** Build passes + manual verification in browser before `/gsd:verify-work`

### Wave 0 Gaps
None — no test framework to install. TypeScript compilation is the only automated check and it is already configured.

## Sources

### Primary (HIGH confidence)
- `frontend/src/parquet.ts` (read directly) — `SampleParquetSource` pattern confirmed
- `frontend/src/bee-map.ts` (read directly) — singleclick placeholder at lines 608-616, `buildSamples()` at line 111, startup wiring patterns
- `frontend/src/bee-sidebar.ts` (read directly) — `Specimen` interface, `SampleEvent` interface, `_renderDetail()`, `_renderRecentSampleEvents()`
- `frontend/tsconfig.json` (read directly) — `noUnusedLocals: true` confirmed
- `data/links.parquet` (read via pandas) — schema: `occurrenceID` (string), `inat_observation_id` (nullable Int64), 46090 rows
- `.planning/STATE.md` (read directly) — BigInt coercion pattern, join key documentation
- `.planning/phases/15-click-interaction-and-inat-links/15-CONTEXT.md` (read directly) — all locked decisions

### Secondary (MEDIUM confidence)
- `scripts/build-data.sh` (read directly) — confirms `|| echo` graceful miss pattern for links.parquet

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are confirmed in place; no new dependencies
- Architecture: HIGH — patterns confirmed directly from reading codebase
- Pitfalls: HIGH — BigInt coercion, lookup key, noUnusedLocals all documented in STATE.md as lessons from prior phases
- Data schema: HIGH — confirmed by running pandas against actual links.parquet

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable libraries, 30-day horizon)
