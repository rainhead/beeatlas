# Phase 119: Map Display, Source Filter & Detail View — Research

**Researched:** 2026-05-25
**Domain:** Mapbox GL JS layer system, Lit web components, URL state, occurrence detail rendering
**Confidence:** HIGH — entire codebase is readable; all patterns are established by prior phases

## Summary

Phase 119 is a pure frontend phase. The data foundation (Phase 118 OCC-01) is already committed in `data/dbt/target/sandbox/occurrences.parquet` (36 columns including `source`, `image_url`, `obs_url`, `user_login`, `license`), but `public/data/occurrences.parquet` still carries the pre-Phase-118 31-column schema (it is regenerated only when the nightly pipeline runs). The frontend changes in Phase 119 will land against the old parquet during development and must degrade gracefully — columns that don't yet exist in the production parquet resolve to `null` in wa-sqlite, and Mapbox GL JS `match`/`filter` expressions handle `null` source values by falling through to their default case. No crash risk: the existing `OccurrenceRow` interface already models nullable columns; we only need to add new nullable fields.

Four changes touch four separate files in a nearly-independent fan-out pattern:
1. **`filter.ts`** — extend `OccurrenceRow` and `OCCURRENCE_COLUMNS` with `source`, `image_url`, `obs_url`, `user_login`, `license`.
2. **`url-state.ts`** — add `src` param to `UiState`, `buildParams`, and `parseParams`; `hiddenSources` is `Set<'ecdysis'|'waba_sample'|'inat_obs'>`.
3. **`bee-pane.ts`** — add a "Sources" filter row (three `<input type="checkbox">`) that dispatches a `source-filter-changed` event; receive `hiddenSources` as a `@property`.
4. **`bee-map.ts`** — apply a Mapbox `setFilter` on the `unclustered-point` layer (and `clusters`) to exclude features whose `source` property is in `hiddenSources`; receive `hiddenSources` as a `@property`.
5. **`bee-atlas.ts`** — own `_hiddenSources: Set<string>` `@state`; wire `source-filter-changed` event; pass `hiddenSources` to `bee-pane` and `bee-map`; include `src` in URL build/parse/restore/popstate.
6. **`bee-occurrence-detail.ts`** — add `_renderInatObs(row)` method; extend `render()` dispatch to route `source === 'inat_obs'` rows there before the existing `isProvisional`/`isSampleOnly` fallback.

The changes are strictly additive — no existing behavior changes except the addition of the source filter applied via Mapbox `setFilter` (synchronous, no async query needed).

**Primary recommendation:** Follow the `checklist-layer-changed` event pattern verbatim for the source filter toggle event. Use Mapbox `setFilter` (not `setData`) for source visibility — it is synchronous and requires no re-aggregation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| iNat obs amber point color on map | Browser / Mapbox GL | — | Paint property in unclustered-point layer, conditional on feature `source` property |
| Source toggle controls | Frontend UI (`bee-pane`) | — | Filter panel owns all filter inputs; dispatches events upward |
| Source filter state ownership | `bee-atlas` (coordinator) | — | All reactive state owned by bee-atlas per CLAUDE.md invariant |
| URL `src` param encode/decode | `url-state.ts` (pure functions) | `bee-atlas` (wires) | Matches existing pattern: pure functions in url-state, wired in bee-atlas |
| iNat obs detail rendering | `bee-occurrence-detail` | — | Occurrence detail renderer; receives `OccurrenceRow[]`, dispatches by `source` |
| Source filter → Mapbox filter | `bee-map` (property) | — | bee-map is a pure presenter; receives hiddenSources, applies setFilter |
| Data columns `source`, `image_url` etc. | `filter.ts` (OccurrenceRow) | `features.ts` (GeoJSON props) | OccurrenceRow is the canonical column list; features.ts spreads `...obj` so new columns propagate automatically |

## Standard Stack

No new packages. All tooling is the existing Lit + Mapbox GL JS + TypeScript stack.

### Core (existing, unchanged)
| Component | Purpose |
|-----------|---------|
| Lit 3.x (`lit`, `lit/decorators.js`) | `@customElement`, `@property`, `@state`, `html`, `css` |
| Mapbox GL JS (mapboxgl) | Map rendering, `setFilter`, `addLayer`, paint expressions |
| TypeScript | Type safety on all new interfaces |
| Vitest (happy-dom) | Unit tests |

## Package Legitimacy Audit

No new packages to install. Section not applicable.

## Architecture Patterns

### System Architecture Diagram

```
User toggles source checkbox in bee-pane
         |
         | source-filter-changed { hiddenSources: Set<string> }
         v
bee-atlas._onSourceFilterChanged()
  - updates _hiddenSources @state
  - calls _replaceUrlState()
         |
         +----> bee-map.hiddenSources property changes
         |        |
         |        | bee-map.updated() detects hiddenSources change
         |        v
         |      _applySourceFilter()
         |        - map.setFilter('unclustered-point', [...])
         |        - map.setFilter('clusters', [...])   (if desired)
         |        (synchronous, same frame)
         |
         +----> bee-pane.hiddenSources property changes
                  - checkbox .checked state reflects hiddenSources
```

```
User clicks iNat obs point
         |
         | map-click-occurrence { occurrences, occIds }
         v
bee-atlas._onOccurrenceClick() — existing path, unchanged
         |
         v
bee-pane renders bee-occurrence-detail .occurrences=${listRows}
         |
         v
bee-occurrence-detail.render()
  specimenBacked rows → _renderDateGroup (existing)
  inat_obs rows (source === 'inat_obs') → _renderInatObs [NEW]
  isProvisional rows → _renderProvisional (existing)
  isSampleOnly rows → _renderSampleOnly (existing)
```

### Recommended Project Structure

No structural changes. All edits are in-place modifications to existing files:
```
src/
├── filter.ts              # OccurrenceRow + OCCURRENCE_COLUMNS extend
├── url-state.ts           # UiState.hiddenSources, buildParams, parseParams
├── bee-atlas.ts           # _hiddenSources @state, event wiring, URL round-trip
├── bee-pane.ts            # "Sources" filter row + source-filter-changed dispatch
├── bee-map.ts             # hiddenSources @property, _applySourceFilter()
└── bee-occurrence-detail.ts  # _renderInatObs(), render() dispatch update
```

### Pattern 1: Extending OccurrenceRow and OCCURRENCE_COLUMNS

**What:** Add new nullable columns to the `OccurrenceRow` interface and the `OCCURRENCE_COLUMNS` const array in `filter.ts`. The const array drives all SQLite `SELECT` projections and the GeoJSON feature property spread.

**Critical constraint:** `OCCURRENCE_COLUMNS` drives `filter.ts` query functions AND `features.ts` (`featureToOccurrenceRow`). Adding columns there surfaces them in GeoJSON feature properties automatically — no change needed to `features.ts`.

The existing `OccurrenceRow` does NOT yet have `source`, `image_url`, `obs_url`, `user_login`, or `license`. These must be added:

```typescript
// In filter.ts — extend OccurrenceRow interface:
export interface OccurrenceRow {
  // ... existing fields ...
  source: 'ecdysis' | 'waba_sample' | 'inat_obs' | null;  // null in old parquet rows
  image_url: string | null;
  obs_url: string | null;
  user_login: string | null;
  license: string | null;
}

// In filter.ts — extend OCCURRENCE_COLUMNS:
export const OCCURRENCE_COLUMNS = [
  // ... existing 31 columns ...
  'source', 'image_url', 'obs_url', 'user_login', 'license',
] as const;
```

**Why `source` is nullable:** The current `public/data/occurrences.parquet` lacks the `source` column. wa-sqlite will return `null` for any column not present in the parquet — this is the graceful degradation path. Mapbox GL JS `match` expressions treat `null` as a miss and fall through to the default case, so existing ecdysis/waba points render gray by default.

### Pattern 2: URL State Extension (following existing `cl` / `checklistVisible` precedent)

**What:** `UiState` gains `hiddenSources?: Set<'ecdysis' | 'waba_sample' | 'inat_obs'>`. The `src` URL param encodes the set of **hidden** sources as comma-separated values. Absence = all sources visible.

```typescript
// url-state.ts — UiState extension:
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'list' | 'table' | 'collapsed';
  checklistVisible?: boolean;
  hiddenSources?: Set<'ecdysis' | 'waba_sample' | 'inat_obs'>;  // NEW
}

// buildParams — serialize:
if (ui.hiddenSources && ui.hiddenSources.size > 0) {
  params.set('src', [...ui.hiddenSources].sort().join(','));
}

// parseParams — deserialize:
const VALID_SOURCES = new Set(['ecdysis', 'waba_sample', 'inat_obs']);
const srcRaw = p.get('src') ?? '';
const hiddenSources = srcRaw
  ? new Set(srcRaw.split(',')
      .filter(s => VALID_SOURCES.has(s)) as Array<'ecdysis'|'waba_sample'|'inat_obs'>)
  : undefined;
```

**`hasFilter`/`result.ui` condition:** The `hiddenSources` value modifies when `result.ui` is emitted. The existing condition is `boundaryMode !== 'off' || paneState !== 'collapsed' || checklistVisible`. Extend it: `|| (hiddenSources && hiddenSources.size > 0)`.

### Pattern 3: Source Toggle in bee-pane (following `_renderShow` / checklist-layer-changed precedent)

**What:** A new private `_renderSources()` method added to `BeePane` following the exact `_renderShow()` pattern. A `hiddenSources` `@property` receives the current state from `bee-atlas`. Three checkboxes dispatch `source-filter-changed` event.

```typescript
// bee-pane.ts — new @property:
@property({ attribute: false }) hiddenSources: Set<string> = new Set();

// bee-pane.ts — new @state for local checkbox tracking:
@state() private _hiddenSources: Set<string> = new Set();

// bee-pane.ts — in updated():
if (changed.has('hiddenSources')) {
  this._hiddenSources = new Set(this.hiddenSources);
}

// bee-pane.ts — _renderSources():
private _renderSources() {
  const sources: Array<{ value: string; label: string }> = [
    { value: 'ecdysis', label: 'Ecdysis specimens' },
    { value: 'waba_sample', label: 'WABA samples' },
    { value: 'inat_obs', label: 'iNat expert obs' },
  ];
  return html`
    <div class="filter-row">
      <!-- layers SVG icon -->
      <div class="year-row">
        ${sources.map(s => html`
          <label class="year-label">
            <input type="checkbox"
              .checked=${!this._hiddenSources.has(s.value)}
              @change=${(e: Event) => this._onSourceToggle(s.value, (e.target as HTMLInputElement).checked)}
            />
            ${s.label}
          </label>
        `)}
      </div>
    </div>
  `;
}

private _onSourceToggle(sourceValue: string, checked: boolean) {
  const next = new Set(this._hiddenSources);
  if (checked) next.delete(sourceValue);
  else next.add(sourceValue);
  this._hiddenSources = next;
  this.dispatchEvent(new CustomEvent('source-filter-changed', {
    bubbles: true, composed: true,
    detail: { hiddenSources: next },
  }));
}
```

**In `_renderListContent()`:** Add `${this._renderSources()}` after `${this._renderShow()}`.

### Pattern 4: Source Filter Application in bee-map (following visibleIds setFilter precedent)

**What:** `BeeMap` gains a `hiddenSources` `@property`. `updated()` detects changes and calls `_applySourceFilter()`. The filter is a Mapbox GL JS filter expression using `!in` to exclude features whose `source` property is in the hidden set.

```typescript
// bee-map.ts — new @property:
@property({ attribute: false }) hiddenSources: Set<string> = new Set();

// bee-map.ts — in updated():
if (changedProperties.has('hiddenSources')) {
  this._applySourceFilter();
}

// bee-map.ts — _applySourceFilter():
private _applySourceFilter() {
  if (!this._map?.getLayer('unclustered-point')) return;

  if (this.hiddenSources.size === 0) {
    // All sources visible — remove source restriction from filter
    this._map.setFilter('unclustered-point', ['!', ['has', 'point_count']]);
  } else {
    const hidden = [...this.hiddenSources];
    this._map.setFilter('unclustered-point', [
      'all',
      ['!', ['has', 'point_count']],
      ['!', ['in', ['get', 'source'], ['literal', hidden]]],
    ]);
  }
  // Apply same logic to clusters (cluster layer shows dot counts per source)
  // Clusters aggregate all features in source; hiding via setFilter on the
  // cluster layer requires a clusterProperties filter expression — more complex.
  // Simpler: filter clusters by checking if ANY non-hidden source point is inside.
  // For v1: hide clusters only if ALL their source arms are hidden (approximation).
  // The UI-SPEC says "hiding a source hides its points immediately" — cluster
  // handling is an implementation detail left to executor.
}
```

**Style cache invariant (CLAUDE.md):** The existing cache bypass rule covers `filterState` active OR `selectedOccIds` non-empty. The source filter is applied via Mapbox `setFilter` (not via the style function cache), so no change to the existing cache bypass logic is needed for source filtering. The `source` column is a feature property, not a runtime style parameter.

**iNat obs amber color:** The `unclustered-point` layer currently uses a `match` expression on `recencyTier`. iNat obs have `recencyTier` set (via `recencyTier()` in `features.ts`) and `source = 'inat_obs'`. The amber color requires adding a `source` condition to the paint expression:

```typescript
// In bee-map.ts _map.addLayer unclustered-point paint section:
'circle-color': [
  'case',
  ['==', ['get', 'source'], 'inat_obs'], '#e8a020',   // amber for iNat obs
  ['match', ['get', 'recencyTier'],                   // gray tiers for ecdysis/waba
    'thisYear', RECENCY_COLORS.thisYear,
    'lastYear', RECENCY_COLORS.lastYear,
    RECENCY_COLORS.earlier,
  ],
],
```

This requires modifying the `addLayer` call inside the `_map.on('load')` callback — specifically the `unclustered-point` layer paint block. The `case` expression wraps the existing `match` expression.

### Pattern 5: iNat Obs Detail Rendering (following _renderSampleOnly / _renderProvisional precedent)

**What:** Add `_renderInatObs(row: OccurrenceRow)` to `BeeOccurrenceDetail`. Extend `render()` to check `source === 'inat_obs'` in the `nonSpecimen` map — the `isProvisional` check already narrows this population, but `inat_obs` rows are neither provisional nor specimen-backed. They need a third branch.

**Current render() nonSpecimen dispatch:**
```typescript
${nonSpecimen.map(row =>
  isProvisional(row)
    ? this._renderProvisional(row)
    : this._renderSampleOnly(row)      // catches inat_obs rows currently
)}
```

**Updated dispatch:**
```typescript
${nonSpecimen.map(row =>
  isProvisional(row)
    ? this._renderProvisional(row)
    : row.source === 'inat_obs'
      ? this._renderInatObs(row)       // NEW branch
      : this._renderSampleOnly(row)
)}
```

**_renderInatObs() implementation (from UI-SPEC DET-01):**
```typescript
private _renderInatObs(row: OccurrenceRow) {
  const isCC = row.license != null && row.license.toUpperCase().startsWith('CC');
  return html`
    <div class="panel-content sample-dot-detail">
      <div class="event-date">${formatRomanDate(row.date)}</div>
      ${row.user_login != null
        ? html`<div class="event-observer">${row.user_login}</div>` : ''}
      ${row.floralHost != null
        ? html`<div class="event-host"><em>${row.floralHost}</em></div>` : ''}
      ${isCC && row.image_url != null ? html`
        <img
          src="${row.image_url}"
          alt="Photo of ${row.scientificName ?? 'bee'} by ${row.user_login ?? 'observer'} on iNaturalist"
          style="width:100%;max-height:200px;object-fit:cover;border-radius:4px;"
        />
      ` : ''}
      ${row.obs_url != null ? html`
        <div class="event-inat">
          <a href="${row.obs_url}" target="_blank" rel="noopener">View on iNaturalist</a>
        </div>
      ` : ''}
    </div>
  `;
}
```

**Note on `floralHost` column mapping:** The `int_combined.sql` ARM 3 maps `io.floral_host AS floralHost` — this lands in `OccurrenceRow.floralHost`, which is the correct field to read in `_renderInatObs`. The UI-SPEC uses `floral_host` / `data column` terminology but the TypeScript field is `floralHost`.

**Note on `scientificName` for iNat obs:** ARM 3 maps `io.scientific_name AS scientificName`. So `row.scientificName` is available for alt text.

### Pattern 6: bee-atlas.ts wiring

**What:** `bee-atlas` gains `@state() private _hiddenSources: Set<string> = new Set()`. It handles `source-filter-changed` events and passes `hiddenSources` to both `bee-pane` and `bee-map`.

```typescript
// bee-atlas.ts additions:
@state() private _hiddenSources: Set<string> = new Set();

// In render() — bee-map binding:
.hiddenSources=${this._hiddenSources}

// In render() — bee-pane binding:
.hiddenSources=${this._hiddenSources}
@source-filter-changed=${this._onSourceFilterChanged}

// New event handler:
private _onSourceFilterChanged(e: CustomEvent<{ hiddenSources: Set<string> }>) {
  this._hiddenSources = e.detail.hiddenSources;
  this._replaceUrlState();
}
```

**In `_buildCurrentParams()`:** Pass `hiddenSources: this._hiddenSources` as part of the `ui` object.

**In `firstUpdated()`:** After `parseParams`, restore `_hiddenSources` from `initialParams.ui?.hiddenSources ?? new Set()`.

**In `_onPopState()`:** Restore `_hiddenSources` from `parsed.ui?.hiddenSources ?? new Set()`.

**`isFilterActive` and `_visibleIds` — NOT affected:** Source filtering is a Mapbox-side display filter, not a SQLite `WHERE` clause. The `_filterQueryGeneration` / `queryVisibleIds` path remains unchanged. Source visibility does not change which IDs are in the visible ID set — it only controls what Mapbox renders.

### Anti-Patterns to Avoid

- **Making source filter async:** Source toggle MUST use synchronous Mapbox `setFilter` — never `setData` or `queryVisibleIds`. The UI-SPEC says "response is synchronous (same frame)."
- **Adding `source` to SQLite WHERE:** Source filtering is a display decision, not a data query. Do not extend `buildFilterSQL` with a source clause.
- **Treating `hiddenSources` as a change to `isFilterActive`:** `isFilterActive` drives async SQLite queries. Source visibility is orthogonal — don't conflate them.
- **Modifying `features.ts`:** The `...obj` spread in `loadOccurrenceGeoJSON` already propagates any column in `OCCURRENCE_COLUMNS` as a GeoJSON feature property. No change needed.
- **Cache bypass for source filter:** Source filtering uses `setFilter` on an already-rendered layer, not the style function path. The CLAUDE.md cache bypass rule applies to the style *function*, not to `setFilter`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Source visibility on map | Custom setData filtering | Mapbox `setFilter` | Synchronous, no re-clustering, no data reload |
| URL param encoding | Custom serializer | Existing `buildParams`/`parseParams` pattern | Consistency; round-trip coverage by existing test suite |
| Checkbox UI | Custom toggle widget | `<input type="checkbox">` + `accent-color: var(--accent)` | Matches existing year filter pattern exactly |
| iNat link | Custom link component | Inline `<a href target=_blank rel=noopener>` | Matches existing `_renderSampleOnly` pattern |
| License check | Custom license validator | `license.toUpperCase().startsWith('CC')` | UI-SPEC mandates this exact check |

## Common Pitfalls

### Pitfall 1: `source` column null in production parquet
**What goes wrong:** `public/data/occurrences.parquet` (31 columns) does NOT have `source`. When the frontend reads it, every row has `source: null`. Mapbox filter `['==', ['get', 'source'], 'ecdysis']` returns false for all rows — all points disappear.
**Why it happens:** Phase 118 pipeline hasn't regenerated `public/data/occurrences.parquet` from the nightly run yet.
**How to avoid:** The Mapbox `setFilter` for source visibility must NOT apply when `hiddenSources` is empty (the default state). Only apply the filter when at least one source is hidden. This way, the default state (all visible) leaves the existing filter expression unchanged — points render normally.
**Warning signs:** All points disappear on page load even with no sources hidden.

### Pitfall 2: `recencyTier` color overriding amber for iNat obs
**What goes wrong:** The existing `unclustered-point` paint uses `match` on `recencyTier`. iNat obs have valid `recencyTier` values. If the amber condition is nested as an inner branch inside the `match`, it never fires.
**Why it happens:** Mapbox `match` only checks exact value equality; a wrapping `case` on `source` must be the outermost expression.
**How to avoid:** Use `case` as the outermost expression, check `source === 'inat_obs'` first, fall through to the existing `match` for non-iNat rows.

### Pitfall 3: `hiddenSources` not restored from URL on popstate
**What goes wrong:** Clicking back/forward restores map view and filter but not source visibility.
**Why it happens:** `_onPopState` restores from `parsed.ui` but `hiddenSources` was forgotten.
**How to avoid:** `_onPopState` must restore `this._hiddenSources = parsed.ui?.hiddenSources ?? new Set()` alongside other UI state fields.

### Pitfall 4: `buildParams` `hasFilter` condition not extended
**What goes wrong:** URL omits `src=` param even when sources are hidden.
**Why it happens:** `buildParams` only emits `src` if the condition is satisfied. If the `ui.hiddenSources.size > 0` check is absent, the param is silently dropped.
**How to avoid:** Add `if (ui.hiddenSources && ui.hiddenSources.size > 0) params.set(...)` in `buildParams`.

### Pitfall 5: `parseParams` `result.ui` not emitted for `src`-only URLs
**What goes wrong:** Sharing a URL with `?src=ecdysis` fails to restore the hidden source.
**Why it happens:** The `result.ui` object is only populated when `boundaryMode !== 'off' || paneState !== 'collapsed' || checklistVisible`. If `src` is the only non-default UI param, `result.ui` is never created.
**How to avoid:** Add `|| (hiddenSources && hiddenSources.size > 0)` to the condition that creates `result.ui`.

### Pitfall 6: Confusing `floralHost` vs `floral_host`
**What goes wrong:** `_renderInatObs` reads `row.floral_host` (snake_case) and gets `undefined`.
**Why it happens:** The dbt ARM 3 renames `io.floral_host AS floralHost` (camelCase). All `OccurrenceRow` fields use camelCase.
**How to avoid:** Always use `row.floralHost` in TypeScript (matching existing `_renderSampleOnly` which uses `row.sample_host` — note: `sample_host` is already camelCase in the DB column name, but `floralHost` is the remapped name from the SQL).

### Pitfall 7: `specimen_inat_login` vs `user_login` confusion for display
**What goes wrong:** Rendering iNat obs observer as `row.host_inat_login` instead of `row.user_login`.
**Why it happens:** `host_inat_login` is the WABA sample host's login; `user_login` is the iNat expert observer. They are different people.
**How to avoid:** Use `row.user_login` for `_renderInatObs`. Use `row.host_inat_login` only in `_renderSampleOnly`/`_renderProvisional`.

## Code Examples

### Example 1: Mapbox source filter expression
```typescript
// Source: verified from bee-map.ts existing _applySelection pattern
// When some sources are hidden:
this._map.setFilter('unclustered-point', [
  'all',
  ['!', ['has', 'point_count']],
  ['!', ['in', ['get', 'source'], ['literal', [...this.hiddenSources]]]],
]);

// When all sources visible (default):
this._map.setFilter('unclustered-point', ['!', ['has', 'point_count']]);
```

### Example 2: checklist-layer-changed event dispatch (template for source-filter-changed)
```typescript
// Source: bee-pane.ts _onChecklistChange — exact pattern to follow
private _onChecklistChange(e: Event) {
  const visible = (e.target as HTMLInputElement).checked;
  this._showChecklist = visible;
  this.dispatchEvent(new CustomEvent('checklist-layer-changed', {
    bubbles: true, composed: true,
    detail: { visible },
  }));
}
```

### Example 3: _renderShow() — template for _renderSources()
```typescript
// Source: bee-pane.ts _renderShow() — follow this exact structure
private _renderShow() {
  return html`
    <div class="filter-row">
      <svg class="row-icon" ...></svg>
      <div class="year-row">
        <label class="year-label">
          <input type="checkbox" .checked=${this._showChecklist} @change=${this._onChecklistChange} />
          Checklist records
        </label>
      </div>
    </div>
  `;
}
```

### Example 4: updated() handler for property → local state sync
```typescript
// Source: bee-pane.ts updated() lines 503-554 — follow this pattern for hiddenSources
updated(changed: PropertyValues) {
  if (changed.has('checklistVisible') && this._showChecklist !== this.checklistVisible) {
    this._showChecklist = this.checklistVisible;
  }
  // ... (add hiddenSources sync here following same pattern)
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| No source discriminator | `source` column in occurrences parquet ('ecdysis', 'waba_sample', 'inat_obs') | Phase 119 can dispatch rendering/filtering by source |
| Single occurrence detail path (specimen-backed + sample-only + provisional) | Three paths + new inat_obs path | `_renderInatObs` as a fourth render branch |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `source` column is null (not absent) when wa-sqlite reads the 31-col parquet | Pitfall 1 | If the column read throws instead of returning null, source filter could crash on load |
| A2 | Mapbox `!in` filter with `['literal', []]` (empty array) matches no features and is a no-op | Pattern 4 | If `!in` with empty array incorrectly hides all features, default state breaks all rendering |
| A3 | `row.floralHost` is the correct field name for the dbt ARM 3 `floral_host` column | Pattern 5 | If the column lands as `floral_host` (snake_case), the detail card silently omits the host |

**Risk mitigation for A1:** The `_applySourceFilter()` method MUST check `hiddenSources.size === 0` and revert to the no-source-filter expression — this is safe regardless of null behavior.

**Risk mitigation for A3:** Verify in `OCCURRENCE_COLUMNS` or the SQL: `int_combined.sql` line 114 reads `io.floral_host AS floralHost` — confirmed camelCase.

## Open Questions

1. **Cluster source filtering**
   - What we know: `clusters` layer aggregates ALL features in the `occurrences` source, including iNat obs. The `clusterProperties` expression only aggregates `recencyTier` counts (thisYearCount, lastYearCount, earlierCount), not `source`.
   - What's unclear: Should hiding `inat_obs` source also remove iNat obs from cluster counts? To do this properly would require adding `inat_obs_count` to `clusterProperties` and filtering clusters via a Mapbox expression.
   - Recommendation: For MVP, do not filter clusters by source (clusters are already an approximation). Only filter `unclustered-point`. The UI-SPEC does not mandate cluster-level source filtering.

2. **Empty state when all sources hidden**
   - What we know: UI-SPEC says to show "No sources selected. Enable at least one source above." in the occurrence list.
   - What's unclear: This message belongs in `bee-pane` list placeholder, not in the map. The list placeholder is currently "Click a point on the map to see details." when `listRows.length === 0`.
   - Recommendation: Add a check in `bee-pane._renderListContent()` — if `hiddenSources.size === 3` (all sources hidden), show the "No sources selected" message instead of the click prompt.

## Environment Availability

No external dependencies. All runtime libraries (`mapbox-gl`, `lit`, `hyparquet`, `wa-sqlite`) are already bundled. Data pipeline (Phase 118) has already produced the new parquet schema in the dbt sandbox; `public/data/occurrences.parquet` will be updated when the nightly pipeline runs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (happy-dom environment) |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-01 | iNat obs amber color in unclustered-point paint | unit (source inspection) | `npm test` — bee-atlas.test.ts | ❌ Wave 0 |
| MAP-02 | Source filter checkboxes exist in bee-pane | unit (DOM) | `npm test` — bee-pane.test.ts | ❌ Wave 0 |
| MAP-03 | `src` param round-trips in buildParams/parseParams | unit | `npm test` — url-state.test.ts | ❌ Wave 0 |
| DET-01 | `_renderInatObs` dispatched for source=inat_obs | unit (source inspection) | `npm test` — bee-atlas.test.ts | ❌ Wave 0 |

**Test patterns from existing suite:** All new tests should follow the source-inspection pattern in `bee-atlas.test.ts` (read source files and assert structural properties) and the round-trip pattern in `url-state.test.ts` (call `buildParams`/`parseParams` and assert values).

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/url-state.test.ts` — add MAP-03 tests: `src=ecdysis` round-trips, `src` absent when empty, multiple hidden sources
- [ ] `src/tests/bee-atlas.test.ts` — add MAP-01 test: `bee-map.ts` contains amber `#e8a020` in `unclustered-point` paint; add MAP-02 test: `bee-pane.ts` contains `source-filter-changed`; add DET-01 test: `bee-occurrence-detail.ts` dispatches `_renderInatObs` for `source === 'inat_obs'`
- [ ] `src/tests/bee-pane.test.ts` — add MAP-02 test: `bee-pane.ts` has `hiddenSources` property; contains checkboxes for all three sources

## Security Domain

No new authentication, sessions, input validation beyond what the existing filter system provides, cryptography, or network endpoints. Source values are validated against a fixed enum during URL parsing (`VALID_SOURCES` set). No user-controlled content is inserted into SQL (source filter is applied via Mapbox GL JS expression, not SQLite). Image URLs from iNat obs are displayed as `<img src>` — they are external URLs from iNaturalist.org (trusted domain per data pipeline constraint). Section: no new ASVS categories introduced.

## Sources

### Primary (HIGH confidence — codebase read)
- `src/bee-map.ts` — Mapbox layer setup, setFilter patterns, click interaction chain
- `src/bee-pane.ts` — filter-row pattern, `_renderShow()`, `checklist-layer-changed` event
- `src/bee-occurrence-detail.ts` — `_renderSampleOnly`, `_renderProvisional`, render dispatch
- `src/bee-atlas.ts` — `_hiddenSources` state ownership pattern, `_onChecklistLayerChanged`, `_buildCurrentParams`, `firstUpdated`, `_onPopState`
- `src/url-state.ts` — `UiState`, `buildParams`, `parseParams`, existing param patterns
- `src/filter.ts` — `OccurrenceRow`, `OCCURRENCE_COLUMNS`, filter SQL functions
- `src/occurrence.ts` — `isSpecimenBacked`, `isProvisional`, `isSampleOnly` predicates
- `data/dbt/models/intermediate/int_combined.sql` — ARM 3 column mapping (verified `io.floral_host AS floralHost`)
- `data/dbt/models/marts/schema.yml` — confirmed 36-column occurrences contract with `source`, `image_url`, `obs_url`, `user_login`, `license`
- `data/dbt/target/sandbox/occurrences.parquet` — confirmed 36-column schema in dbt sandbox
- `public/data/occurrences.parquet` — confirmed 31-column schema (pre-Phase-118 export)
- `.planning/phases/119-map-display-source-filter-detail-view/119-UI-SPEC.md` — all design decisions

### Secondary (MEDIUM confidence)
- `.planning/phases/118-occurrence-model-extension/118-03-SUMMARY.md` — confirms Phase 118 complete; 301 species with inat_obs_count > 0

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries
- Architecture: HIGH — entire codebase read, patterns established by prior phases
- Pitfalls: HIGH — verified against actual source files
- Data columns: HIGH — verified against both dbt SQL and sandbox parquet

**Research date:** 2026-05-25
**Valid until:** stable (no moving ecosystem targets; pure internal codebase)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAP-01 | Expert iNat observations render as points on the Mapbox map with a visual style distinct from Ecdysis specimen clusters and WABA sample points | Pattern 4 (amber paint expression via `case` on `source`); verified amber `#e8a020` is distinct from gray RECENCY_COLORS |
| MAP-02 | Source filter in the filter panel allows showing/hiding occurrences by source independently | Pattern 3 (`_renderSources()` in bee-pane following `_renderShow` precedent); Pattern 4 (Mapbox `setFilter` via `hiddenSources` property) |
| MAP-03 | Source filter state is encoded in the URL and restored on page load | Pattern 2 (`src` param in `UiState`, `buildParams`, `parseParams`); bee-atlas wiring in Pattern 6 |
| DET-01 | Clicking an expert iNat observation shows observer login, observed date, floral host (if present), image (if CC-licensed), and iNat link | Pattern 5 (`_renderInatObs` method in bee-occurrence-detail; `source === 'inat_obs'` dispatch; columns verified in dbt ARM 3) |
</phase_requirements>
