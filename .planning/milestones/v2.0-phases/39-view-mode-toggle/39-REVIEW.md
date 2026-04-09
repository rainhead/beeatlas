---
phase: 39-view-mode-toggle
reviewed: 2026-04-07T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - frontend/src/url-state.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-sidebar.ts
  - frontend/src/tests/url-state.test.ts
  - frontend/src/tests/bee-atlas.test.ts
  - frontend/src/tests/bee-sidebar.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-04-07
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This phase adds `viewMode` ('map' | 'table') as a first-class URL-persisted state field, wiring a view-mode toggle in `bee-sidebar` up through `bee-atlas` to the render conditional and the URL serialization layer. The architecture is clean: `bee-sidebar` remains a pure presenter (emits `view-changed`, receives `viewMode` as property), and `bee-atlas` owns the state and URL sync. The URL round-trip tests in `url-state.test.ts` are thorough.

One security finding stands out: SQL injection via URL-controlled input in `_restoreSelectionSamples`. Two warning-level logic issues are present: one around the CSS class reuse creating a semantic collision, and one around sample-event selection not being URL-persisted (silent state loss on history navigation). Two info-level items round out the review.

## Critical Issues

### CR-01: SQL injection via URL-controlled occurrence IDs

**File:** `frontend/src/bee-atlas.ts:507-512`
**Issue:** `ecdysisIds` are sliced from URL-controlled `o=` params and interpolated directly into a DuckDB query string. The URL filter (`startsWith('ecdysis:') && s.length > 8`) does not constrain the suffix to digits. A crafted URL such as `?o=ecdysis:1')%20OR%20('1'%3D'1` would produce:

```sql
WHERE CAST(ecdysis_id AS VARCHAR) IN ('1') OR ('1'='1')
```

returning all rows. Because DuckDB WASM runs entirely in-browser against the user's own local data, there is no server-side confidentiality impact; however, this is a bad pattern that bypasses intended query scoping, and could produce unexpected rendering behavior (e.g., thousands of specimens loaded into `_selectedSamples`). It also sets a precedent for SQL interpolation that would be dangerous if the pattern is copied to a future server context.

**Fix:** Validate that each extracted ID is a non-empty decimal integer before interpolation, or use numeric casting:

```typescript
const ecdysisIds = occIds
  .filter(id => id.startsWith('ecdysis:'))
  .map(id => id.slice('ecdysis:'.length))
  .filter(id => /^\d+$/.test(id));  // only accept pure integer suffixes
```

This is consistent with the CLAUDE.md invariant that ecdysis IDs are `ecdysis:<integer>`.

---

## Warnings

### WR-01: Sample-event selection silently lost on browser back/forward

**File:** `frontend/src/bee-atlas.ts:356-361`
**Issue:** `_onSampleClick` stores the selected `SampleEvent` in `_selectedSampleEvent` and calls `_pushUrlState()`, but `buildParams` has no serialization for `SampleEvent` data — it only serializes `occurrenceIds` (which is set to `null` in this handler). The result is that clicking a sample event pushes a URL that contains no record of that selection. Navigating back to that history entry restores map/filter state but the sample event panel is blank.

This may be intentional scope (iNat observations are not assigned an `inat:` prefix in the `o=` param), but it is asymmetric: specimen clicks persist through history navigation, sample event clicks do not. If this is intentional, it should be documented as a known limitation; if not, the `o` param needs to support `inat:<observation_id>` entries (which would also align with the CLAUDE.md invariant that both `ecdysis:` and `inat:` prefixes are load-bearing).

**Fix (if intentional):** Add a comment in `_onSampleClick` noting that sample event selection is not URL-persisted.

**Fix (if not intentional):** Extend `buildParams`/`parseParams` to serialize `SampleEvent` as `o=inat:<observation_id>` and restore `_selectedSampleEvent` in `_onPopState`.

---

### WR-02: `_renderViewToggle` reuses `layer-toggle` CSS class

**File:** `frontend/src/bee-sidebar.ts:231`
**Issue:** `_renderViewToggle()` wraps its buttons in `<div class="layer-toggle">`, the same CSS class used by `_renderToggle()`. The styles include `border-bottom: 1px solid var(--border)` which will apply to both toggles identically. This is currently harmless, but creates a brittle coupling: any future style change to distinguish the view-mode toggle from the layer toggle (e.g., adding margin between them, or a different active-color) requires either duplicating the class or adding a more specific selector.

**Fix:** Add a distinct class to the view toggle container:

```typescript
// _renderViewToggle
return html`
  <div class="layer-toggle view-mode-toggle">
    ...
  </div>
`;
```

Then style `.view-mode-toggle` independently when needed. The shared `layer-toggle` base class can remain for common properties.

---

## Info

### IN-01: Non-null assertion on `taxonRank` is safe but brittle

**File:** `frontend/src/url-state.ts:38`
**Issue:** `params.set('taxonRank', filter.taxonRank!)` uses a non-null assertion. This is safe because the `if (filter.taxonName !== null)` guard on line 36 should imply `taxonRank` is also non-null by invariant. However, the type system does not encode this dependency — `FilterState` has `taxonRank: 'family' | 'genus' | 'species' | null` independently of `taxonName`. If `taxonRank` is null while `taxonName` is set (a `FilterState` the type permits), the assertion would produce `undefined` being passed to `params.set`, silently omitting the param and causing broken round-trips.

**Fix:** Either add an explicit guard (`filter.taxonRank !== null &&`) to the condition, or use nullish coalescing to fail safe:

```typescript
if (filter.taxonName !== null && filter.taxonRank !== null) {
  params.set('taxon', filter.taxonName);
  params.set('taxonRank', filter.taxonRank);
}
```

---

### IN-02: `console.debug` left in production path

**File:** `frontend/src/bee-atlas.ts:236`
**Issue:** `console.debug('DuckDB tables ready')` will emit to the browser console in production builds unless the bundler strips it. Vite does not strip `console.debug` by default.

**Fix:** Either remove the log or guard it with an `import.meta.env.DEV` check:

```typescript
if (import.meta.env.DEV) console.debug('DuckDB tables ready');
```

---

_Reviewed: 2026-04-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
