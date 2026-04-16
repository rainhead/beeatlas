# Phase 57: Sidebar Display - Research

**Researched:** 2026-04-15
**Domain:** Lit web components — conditional rendering, TypeScript interface extension
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ELEV-05 | `bee-specimen-detail` shows elevation as "1219 m" when `elevation_m` non-null; row omitted when null | Requires `Sample` interface extension + conditional render in `bee-specimen-detail.ts` |
| ELEV-06 | `bee-sample-detail` shows elevation in same format with same null-omit behavior | Requires `SampleEvent` interface extension + conditional render in `bee-sample-detail.ts` |
</phase_requirements>

---

## Summary

Phase 57 is a small, self-contained display-only addition to two existing Lit components. Phase 56 (verified complete) has already added `elevation_m` as an INT16 nullable column to both `ecdysis.parquet` and `samples.parquet`. The task is to thread that value from the data layer through to the sidebar UI.

There are two data paths feeding the sidebar. For specimens (`bee-specimen-detail`), data flows: `EcdysisSource` (DuckDB query in `features.ts`) → OpenLayers feature properties → `buildSamples()` in `bee-map.ts` → `Sample[]` → `bee-specimen-detail`. For sample events (`bee-sample-detail`), data flows: `SampleSource` (DuckDB query in `features.ts`) → OpenLayers feature properties → `map-click-sample` event dispatch in `bee-map.ts` → `SampleEvent` → `bee-sample-detail`. Both paths must be extended to carry `elevation_m`.

The render change in each component is a single conditional block: `${elevation_m !== null ? html`...` : ''}`. The UI-SPEC (already approved) defines exact copy, markup patterns, CSS class names, and color tokens. No new dependencies are required.

**Primary recommendation:** Follow the UI-SPEC exactly. The only decisions left are sequencing the three touch points (interfaces → data queries → render) and writing Vitest tests using happy-dom + Lit `updateComplete`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Elevation value storage | Database / Storage | — | `elevation_m` lives in parquet, queried via DuckDB WASM |
| Elevation carriage to features | Frontend (features.ts) | — | `EcdysisSource` and `SampleSource` query DuckDB and set OL feature properties |
| Elevation carriage to Sample/SampleEvent | Frontend (bee-map.ts) | — | `buildSamples()` reads feature properties; `map-click-sample` emit reads feature properties |
| Elevation display | Frontend (bee-specimen-detail, bee-sample-detail) | — | Conditional Lit `html` template based on `elevation_m !== null` |
| State ownership | `bee-atlas` (pure pass-through) | — | Architecture invariant: bee-atlas owns all reactive state; detail components are pure presenters |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | ^3.2.1 | Web component base class, `html` tagged template | Project standard — all components use it [VERIFIED: package.json] |
| TypeScript | ^5.8.2 | Type checking for interface changes | Project standard [VERIFIED: package.json] |
| vitest | ^4.1.2 | Test runner | Project standard; used in all existing tests [VERIFIED: package.json] |
| happy-dom | ^20.8.9 | DOM environment for vitest | Project standard; configured in vite.config.ts [VERIFIED: vite.config.ts] |

### Supporting

No new libraries needed. This phase uses only existing project dependencies.

**Installation:** No new packages to install.

---

## Architecture Patterns

### System Architecture Diagram

```
ecdysis.parquet (elevation_m: INT16|null)
    │
    └─► EcdysisSource.loader() [features.ts]
            DuckDB query: SELECT ... elevation_m FROM ecdysis
            └─► Feature.setProperties({ elevation_m })
                    │
                    └─► buildSamples() [bee-map.ts]
                            Sample.elevation_m populated
                            │
                            └─► map-click-specimen event
                                    │
                                    └─► bee-atlas._selectedSamples
                                            │
                                            └─► <bee-specimen-detail .samples>
                                                    └─► conditional render: "1219 m"

samples.parquet (elevation_m: INT16|null)
    │
    └─► SampleSource.loader() [features.ts]
            DuckDB query: SELECT ... elevation_m FROM samples
            └─► Feature.setProperties({ elevation_m })
                    │
                    └─► map-click-sample emit [bee-map.ts]
                            SampleEvent.elevation_m populated
                            │
                            └─► bee-atlas._selectedSampleEvent
                                    │
                                    └─► <bee-sample-detail .sampleEvent>
                                            └─► conditional render: "1219 m"
```

### Recommended Project Structure

No new files are needed. All changes are to existing files:

```
frontend/src/
├── bee-sidebar.ts          # Add elevation_m to Sample and SampleEvent interfaces
├── features.ts             # Add elevation_m to EcdysisSource and SampleSource DuckDB queries + setProperties
├── bee-map.ts              # Add elevation_m in buildSamples(); add elevation_m in map-click-sample emit
├── bee-specimen-detail.ts  # Add conditional elevation row render + .detail-label CSS
├── bee-sample-detail.ts    # Add conditional elevation row render + .event-elevation CSS
└── tests/
    └── bee-sidebar.test.ts # New ELEV-05 and ELEV-06 test describes
```

### Pattern 1: Conditional Row Rendering in Lit

**What:** Use a ternary returning `html`...`` or `''` to omit a row when data is null.
**When to use:** Any time a UI row should be entirely absent (not blank) based on a nullable value.
**Example:**

```typescript
// Source: existing bee-specimen-detail.ts pattern (host-label, sample-meta)
${sample.elevation_m !== null
  ? html`<div class="sample-meta">
      <span class="detail-label">Elevation</span>
      ${Math.round(sample.elevation_m)} m
    </div>`
  : ''}
```

Key rule from UI-SPEC: use `!== null` strict equality, not `!= null`, to avoid rendering when value is `undefined`.

### Pattern 2: Interface Extension in bee-sidebar.ts

**What:** Add `elevation_m: number | null` to the `Sample` and `SampleEvent` interfaces. Both interfaces are defined in `bee-sidebar.ts` and imported elsewhere.
**When to use:** When a new nullable column is added to parquet and must flow through the component tree.

```typescript
// bee-sidebar.ts
export interface Sample {
  year: number;
  month: number;
  recordedBy: string;
  fieldNumber: string;
  species: Specimen[];
  elevation_m: number | null;   // add this
}

export interface SampleEvent {
  observation_id: number;
  observer: string;
  date: string;
  specimen_count: number;
  sample_id: number | null;
  coordinate: number[];
  elevation_m: number | null;   // add this
}
```

### Pattern 3: DuckDB Feature Property Carriage

**What:** Add column to SELECT and to `setProperties()` in both `EcdysisSource` and `SampleSource`.
**When to use:** Any time a new parquet column must be visible to the frontend.

```typescript
// features.ts — EcdysisSource: add to SELECT and setProperties
const table = await conn.query(`
  SELECT ecdysis_id, longitude, latitude, year, month,
         scientificName, recordedBy, fieldNumber, genus, family,
         floralHost, county, ecoregion_l3, host_observation_id,
         inat_host, inat_quality_grade, specimen_observation_id,
         elevation_m   -- ADD THIS
  FROM ecdysis
`);
// ...
feature.setProperties({
  // ...existing properties...
  elevation_m: obj.elevation_m != null ? Number(obj.elevation_m) : null,
});
```

```typescript
// features.ts — SampleSource: add to SELECT and setProperties
const table = await conn.query(`
  SELECT observation_id, observer, date, lat, lon,
         specimen_count, sample_id, county, ecoregion_l3,
         elevation_m   -- ADD THIS
  FROM samples
`);
// ...
feature.setProperties({
  // ...existing properties...
  elevation_m: obj.elevation_m != null ? Number(obj.elevation_m) : null,
});
```

### Pattern 4: buildSamples() and map-click-sample Propagation

**What:** `buildSamples()` in `bee-map.ts` reads feature properties to build `Sample` objects. The `map-click-sample` emit constructs a literal `SampleEvent` object.

Both must be updated to carry `elevation_m`:

```typescript
// bee-map.ts — buildSamples: elevation is on the Sample, not Specimen
// Each Sample groups specimens from the same collection event.
// elevation_m belongs at the sample (event) level, not per-specimen.
// Strategy: use the first feature's elevation_m as the sample's elevation.
map.set(key, {
  year: f.get('year') as number,
  month: f.get('month') as number,
  recordedBy: f.get('recordedBy') as string,
  fieldNumber: f.get('fieldNumber') as string,
  species: [],
  elevation_m: f.get('elevation_m') != null ? Number(f.get('elevation_m')) : null,
});
```

```typescript
// bee-map.ts — map-click-sample emit
this._emit('map-click-sample', {
  observation_id: f.get('observation_id') as number,
  observer: f.get('observer') as string,
  date: f.get('date') as string,
  specimen_count: f.get('specimen_count') as number,
  sample_id: f.get('sample_id') as number | null,
  coordinate: (f.getGeometry() as Point).getCoordinates(),
  elevation_m: f.get('elevation_m') != null ? Number(f.get('elevation_m')) : null,
});
```

**Pitfall in buildSamples:** `elevation_m` is a property of the sample event (grouped key), not of an individual specimen. After the first specimen is added to a `Sample` object, subsequent specimens from the same key should not overwrite it. Since all specimens in a sample share the same coordinates, `elevation_m` is identical across the group — reading from the first feature and setting on `map.set(key, {...})` is correct.

### Anti-Patterns to Avoid

- **`!= null` instead of `!== null`:** Avoids rendering when value is `undefined`, which can occur if the feature property was never set. UI-SPEC mandates strict equality.
- **`toFixed(0)` for integer formatting:** Produces `"1219"` but `toFixed()` is semantically wrong for integers. UI-SPEC mandates `Math.round(elevation_m)` rendered as a plain integer. Use template literal: `` `${Math.round(sample.elevation_m)} m` ``.
- **Rendering elevation on the `Specimen` interface:** `elevation_m` is a sample-level attribute (one per collection event), not per specimen. Do not add `elevation_m` to the `Specimen` interface.
- **Adding `@state()` to detail components:** Architecture invariant — `bee-specimen-detail` and `bee-sample-detail` are pure presenters with no `@state()`. Existing tests assert this. Elevation must flow in as a property, not local state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Integer formatting | Custom formatter | `` `${Math.round(n)} m` `` | One-liner; no library needed |
| Conditional DOM removal | CSS `display:none` or `visibility:hidden` | Lit ternary returning `''` | The row must be absent from the DOM, not just hidden — screen readers and layout both require true absence |
| Null-safe number coercion | Custom null check | `obj.elevation_m != null ? Number(obj.elevation_m) : null` | Consistent with existing pattern in features.ts (see `host_observation_id` handling) |

**Key insight:** This is a display-only change. The hardest part is correctly threading the value through four files without breaking the architecture invariant that detail components are pure presenters.

---

## Common Pitfalls

### Pitfall 1: elevation_m on Specimen instead of Sample

**What goes wrong:** Developer adds `elevation_m` to the `Specimen` interface and reads it per-species in the list, rather than at the sample level.
**Why it happens:** The `buildSamples()` loop iterates over features (one per specimen). Adding to the inner `Specimen` object is the path of least resistance.
**How to avoid:** `elevation_m` belongs on `Sample` (the grouping of specimens from one collection event). The UI-SPEC shows it placed as a `.sample-meta` line, adjacent to date and collector — not inside `species-list`.
**Warning signs:** If the elevation renders once per species name, it's on the wrong interface.

### Pitfall 2: URL restore path (_restoreSelectionSamples) not updated

**What goes wrong:** When a user navigates back (URL-restored selection), `_restoreSelectionSamples` in `bee-atlas.ts` queries DuckDB directly and constructs `Sample` objects without `elevation_m`. The elevation row disappears on page reload even when data is available.
**Why it happens:** `_restoreSelectionSamples` has its own DuckDB query (line ~741 in bee-atlas.ts) separate from `buildSamples()`. It constructs `Sample` objects by hand.
**How to avoid:** Update the `_restoreSelectionSamples` SELECT to include `elevation_m` and populate it when constructing each `Sample`.
**Warning signs:** Elevation shows on first click but disappears after browser back/forward navigation.

### Pitfall 3: elevation_m missing from _buildRecentSampleEvents

**What goes wrong:** `bee-map.ts` has a `_buildRecentSampleEvents()` method that also constructs `SampleEvent` objects. If it's not updated, TypeScript may complain or the value will silently be `undefined`.
**Why it happens:** There are multiple construction sites for `SampleEvent` objects.
**How to avoid:** Search for all places that construct a `SampleEvent` literal or `Sample` literal and update them all. Use TypeScript compile errors as a guide — after adding `elevation_m: number | null` to the interface, tsc will flag every incomplete object literal.
**Warning signs:** TypeScript error `Property 'elevation_m' is missing in type '...' but required in type 'SampleEvent'` — treat these as a checklist.

### Pitfall 4: DuckDB INT16 returned as BigInt

**What goes wrong:** DuckDB WASM sometimes returns small integers as `BigInt` type. Rendering `${BigInt(1219)} m` in Lit template literals produces `"1219 m"` correctly, but `BigInt(1219) !== null` is `true` and `Math.round(BigInt(1219))` throws a TypeError in some environments.
**Why it happens:** Arrow IPC format from DuckDB WASM can return SMALLINT as BigInt.
**How to avoid:** Coerce to `Number` at the feature property boundary: `obj.elevation_m != null ? Number(obj.elevation_m) : null`. This is already the established pattern for `host_observation_id` and `specimen_observation_id` in `features.ts` [VERIFIED: features.ts lines 42, 45].
**Warning signs:** `Math.round(elevation_m)` throws or produces `NaN`; `typeof elevation_m === 'bigint'` is true.

---

## Code Examples

### ELEV-05: bee-specimen-detail elevation row

```typescript
// Source: UI-SPEC 57-UI-SPEC.md — Component Inventory: bee-specimen-detail
// CSS class .detail-label already exists in bee-specimen-detail.ts (host-label pattern)
${sample.elevation_m !== null
  ? html`<div class="sample-meta">
      <span class="detail-label">Elevation</span>
      ${Math.round(sample.elevation_m)} m
    </div>`
  : ''}
```

CSS to add to `bee-specimen-detail` static styles:
```css
/* .detail-label already exists as .host-label pattern — verify exact class name in source */
/* UI-SPEC says .detail-label: color: var(--text-hint); font-size: 0.75rem */
.detail-label {
  color: var(--text-hint);
  font-size: 0.75rem;
}
```

Note: The existing component has `.host-label` with these styles. UI-SPEC calls for `.detail-label`. Either reuse `.host-label` (rename not needed, same style) or introduce `.detail-label` as a new class. The plan should pick one approach.

### ELEV-06: bee-sample-detail elevation row

```typescript
// Source: UI-SPEC 57-UI-SPEC.md — Component Inventory: bee-sample-detail
${event.elevation_m !== null
  ? html`<div class="event-elevation">${Math.round(event.elevation_m)} m</div>`
  : ''}
```

CSS to add to `bee-sample-detail` static styles:
```css
/* Matches .event-count and .event-observer weight and tone */
.event-elevation {
  font-size: 0.8rem;
  color: var(--text-muted);
}
```

### Vitest test pattern for elevation display

```typescript
// Source: existing render tests in bee-sidebar.test.ts (lines 186-270)
test('ELEV-05: shows elevation row when elevation_m is non-null', async () => {
  const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
  const el = new BeeSpecimenDetail();
  el.samples = [{
    year: 2023, month: 6,
    recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
    elevation_m: 1219,
    species: [{ name: 'Bombus occidentalis', occid: '12345', hostObservationId: null, floralHost: null }],
  }];
  document.body.appendChild(el);
  await el.updateComplete;
  expect(el.shadowRoot!.textContent).toContain('1219 m');
  document.body.removeChild(el);
});

test('ELEV-05: omits elevation row when elevation_m is null', async () => {
  const { BeeSpecimenDetail } = await import('../bee-specimen-detail.ts');
  const el = new BeeSpecimenDetail();
  el.samples = [{
    year: 2023, month: 6,
    recordedBy: 'J. Smith', fieldNumber: 'WA-2023-001',
    elevation_m: null,
    species: [{ name: 'Bombus occidentalis', occid: '12345', hostObservationId: null, floralHost: null }],
  }];
  document.body.appendChild(el);
  await el.updateComplete;
  const text = el.shadowRoot!.textContent ?? '';
  expect(text).not.toContain('Elevation');
  expect(text).not.toContain(' m');
  document.body.removeChild(el);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No elevation data | `elevation_m: INT16 | null` in both parquet files | Phase 56 (complete) | Phase 57 can read this column immediately |

**Phase 56 status:** VERIFIED complete. `elevation_m` column exists in both parquets with correct INT16 type and nodata sentinel filtered to NULL [VERIFIED: .planning/phases/56-export-integration/56-VERIFICATION.md].

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `_buildRecentSampleEvents()` in bee-map.ts constructs SampleEvent objects that also need updating | Pitfall 3 | TypeScript will catch this at compile time; low risk of runtime failure |
| A2 | `.host-label` CSS class in bee-specimen-detail provides the same visual as UI-SPEC's `.detail-label` | Code Examples | Minor visual inconsistency; plan should verify and decide which class name to use |

---

## Open Questions

1. **CSS class name: `.host-label` vs `.detail-label` in bee-specimen-detail**
   - What we know: Existing code has `.host-label { color: var(--text-hint); font-size: 0.75rem }`. UI-SPEC specifies `.detail-label`.
   - What's unclear: Should the elevation label reuse `.host-label` (avoids adding a CSS rule) or introduce `.detail-label` as the UI-SPEC names it?
   - Recommendation: Reuse `.host-label` in the template (same visual, no new CSS rule needed). This is a planner decision.

2. **_restoreSelectionSamples elevation_m**
   - What we know: This method in `bee-atlas.ts` constructs `Sample` objects via a direct DuckDB query. It currently does not include `elevation_m`.
   - What's unclear: After adding `elevation_m` to the `Sample` interface, TypeScript will flag this as a compile error — so it must be fixed. The plan must include this touch point explicitly.
   - Recommendation: Include as a required task, not optional.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this phase is TypeScript/Lit source edits and Vitest tests only).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 + happy-dom 20.8.9 |
| Config file | `frontend/vite.config.ts` (test.environment: 'happy-dom') |
| Quick run command | `cd frontend && npm test -- --run` |
| Full suite command | `cd frontend && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ELEV-05 | bee-specimen-detail shows "1219 m" when elevation_m=1219 | unit (DOM render) | `cd frontend && npm test -- --run` | ❌ Wave 0 |
| ELEV-05 | bee-specimen-detail omits row when elevation_m=null | unit (DOM render) | `cd frontend && npm test -- --run` | ❌ Wave 0 |
| ELEV-06 | bee-sample-detail shows "1219 m" when elevation_m=1219 | unit (DOM render) | `cd frontend && npm test -- --run` | ❌ Wave 0 |
| ELEV-06 | bee-sample-detail omits row when elevation_m=null | unit (DOM render) | `cd frontend && npm test -- --run` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd frontend && npm test -- --run`
- **Per wave merge:** `cd frontend && npm test -- --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/tests/bee-sidebar.test.ts` — add ELEV-05 and ELEV-06 describe blocks (file exists; new describes needed)
- [ ] No new test file needed — add to existing `bee-sidebar.test.ts`

*(No new test infrastructure needed — vitest + happy-dom already operational.)*

---

## Security Domain

This phase introduces no authentication, session management, access control, or cryptography. It is a display-only change to read-only parquet-sourced data. ASVS categories V2, V3, V4, V6 do not apply.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | Elevation value is read from parquet (server-side pipeline output), not from user input |
| V6 Cryptography | no | — |

No threat patterns applicable — data is read-only, no user-submitted values, no network calls.

---

## Sources

### Primary (HIGH confidence)

- `frontend/src/bee-sidebar.ts` — `Sample` and `SampleEvent` interface definitions [VERIFIED: read in session]
- `frontend/src/bee-specimen-detail.ts` — existing render patterns, CSS classes [VERIFIED: read in session]
- `frontend/src/bee-sample-detail.ts` — existing render patterns, CSS classes [VERIFIED: read in session]
- `frontend/src/features.ts` — DuckDB query patterns, `setProperties()` conventions [VERIFIED: read in session]
- `frontend/src/bee-map.ts` — `buildSamples()` and `map-click-sample` emit site [VERIFIED: read in session]
- `frontend/src/bee-atlas.ts` — `_restoreSelectionSamples()` direct DuckDB construction path [VERIFIED: read in session]
- `.planning/phases/57-sidebar-display/57-UI-SPEC.md` — markup patterns, CSS, copy, null behavior [VERIFIED: read in session]
- `.planning/phases/56-export-integration/56-VERIFICATION.md` — confirms elevation_m column exists in parquet [VERIFIED: read in session]
- `frontend/src/tests/bee-sidebar.test.ts` — existing test patterns for DOM render tests [VERIFIED: read in session]

### Secondary (MEDIUM confidence)

None needed — all required information is available from project source files.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from package.json
- Architecture: HIGH — all data paths traced through source code in this session
- Pitfalls: HIGH (P1/P2/P4) / MEDIUM (P3) — P1/P2/P4 verified from source; P3 (_buildRecentSampleEvents) identified from grep but method body not fully read

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable Lit/TypeScript stack, no moving parts)
