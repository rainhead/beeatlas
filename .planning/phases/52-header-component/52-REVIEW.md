---
phase: 52-header-component
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - frontend/index.html
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-header.ts
  - frontend/src/index.css
  - frontend/src/tests/bee-header.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 52: Code Review Report

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Five files were reviewed covering the new `bee-header` custom element, its integration into `bee-atlas`, styling, and tests. The component is well-structured — state flows correctly as properties from parent to child, events bubble up composed, and the idle-guard pattern (no dispatch when mode already active) is tested.

Two related layout warnings concern the hamburger dropdown: the positioned ancestor is the narrow `<details>` icon rather than the full header, so `left: 0; right: 0` will not produce a full-width dropdown on small screens. A third warning flags unhandled promise rejections on filter-query call sites in `bee-atlas.ts` (pre-existing, but present in reviewed scope). Three info items cover minor code quality notes.

## Warnings

### WR-01: Hamburger dropdown anchored to narrow `<details>`, not full header width

**File:** `frontend/src/bee-header.ts:131-155`

**Issue:** `.hamburger-items` uses `position: absolute; left: 0; right: 0; top: 100%`. Its positioned ancestor is `.hamburger-menu` (`position: relative`, applied in the media query at line 154). That element is a narrow `<details>` tag containing only the hamburger icon — it has no intrinsic width beyond its content. Therefore `left: 0; right: 0` stretches the dropdown only to the width of that icon wrapper, not across the full header. On narrow viewports the dropdown will appear clipped or unexpectedly narrow.

**Fix:** Move `position: relative` to `:host` instead of `.hamburger-menu`, and adjust `top: 100%` to account for the header height, or use a fixed/viewport-relative width on `.hamburger-items`:

```css
/* Option A: anchor to :host */
:host {
  position: relative; /* add this */
  /* existing properties... */
}

.hamburger-menu {
  display: none;
  /* remove position: relative from the @media block */
}

@media (max-width: 640px) {
  .inline-tabs { display: none; }
  .hamburger-menu { display: block; }
}

/* .hamburger-items already has left:0; right:0; top:100% — */
/* these now resolve correctly against the full-width :host  */
```

```css
/* Option B: force full viewport width on the dropdown */
.hamburger-items {
  position: fixed;
  top: var(--header-height, 3.5rem); /* set --header-height on :host */
  left: 0;
  right: 0;
  /* ... */
}
```

---

### WR-02: `top: 100%` on hamburger dropdown resolves relative to `<details>` box, not header bottom

**File:** `frontend/src/bee-header.ts:133`

**Issue:** Even if the width issue (WR-01) is fixed by repositioning the anchor to `:host`, `top: 100%` will resolve to 100% of the `:host` height — which is correct for a full-height header anchor. However with the current anchor (`.hamburger-menu` at `position: relative`), `top: 100%` only clears the bottom of the small icon, which happens to coincide with the header bottom only by coincidence. If header padding or icon sizing changes, the dropdown may overlap or gap from the header bottom. This is structurally fragile and is directly caused by the same anchor issue as WR-01 — resolving WR-01 also resolves this.

**Fix:** Apply the fix in WR-01. No separate change needed beyond anchoring correctly.

---

### WR-03: Unhandled promise rejection on `_runFilterQuery()` call sites in `bee-atlas.ts`

**File:** `frontend/src/bee-atlas.ts:600,613,646`

**Issue:** Three call sites invoke `this._runFilterQuery().then(() => { this._pushUrlState(); })` without a `.catch()`. If `queryVisibleIds` rejects (e.g., DuckDB error), the rejection is silently swallowed by the `then`-only chain and `_pushUrlState()` never fires, leaving the URL out of sync with the UI state. The `_runFilterQuery` method itself has no internal catch, so the rejection propagates.

```typescript
// Line 600 (also 613, 646):
this._runFilterQuery().then(() => {
  this._pushUrlState();
});
// Rejection from _runFilterQuery is unhandled here
```

**Fix:** Add a `.catch()` at each call site, or push the URL state unconditionally and let `_runFilterQuery` handle its own errors:

```typescript
this._runFilterQuery()
  .then(() => { this._pushUrlState(); })
  .catch((err: unknown) => {
    console.error('Filter query failed:', err);
    this._pushUrlState(); // still update URL to reflect new filter state
  });
```

Similarly on line 651 and 671:
```typescript
queryFilteredCounts(this._filterState)
  .then(c => { /* ... */ })
  .catch((err: unknown) => { console.error('Filtered counts failed:', err); });
```

---

## Info

### IN-01: Duplicate `_renderTabItems()` renders could diverge on DOM query in tests

**File:** `frontend/src/tests/bee-header.test.ts:77-79`

**Issue:** The test finds the Samples button using `shadow.querySelectorAll('button.tab-btn')` and iterating by text content. Because `_renderTabItems()` renders into both `.inline-tabs` and `.hamburger-items`, `querySelectorAll` returns buttons from both — effectively doubling the result set. Currently tests find the first matching button, which happens to be from `.inline-tabs`. This is non-deterministic if DOM order changes. The test should prefer a scoped selector to make the intent explicit.

**Fix:** Scope the query to `.inline-tabs` to make intent explicit and resilient to structure changes:
```typescript
const buttons = shadow.querySelectorAll('.inline-tabs button.tab-btn');
```

---

### IN-02: `--accent` contrast on dark header background may be insufficient

**File:** `frontend/src/bee-header.ts:55-57`, `frontend/src/index.css:10`

**Issue:** `--accent` is `#2c7a2c` (dark green). The active tab uses `border-bottom-color: var(--accent)` on a `--header-bg` of `rgb(8, 13, 38)` (near-black navy). The 2px underline indicator will be very low contrast against the dark background. While the underline is a decorative indicator rather than text, it may be invisible to users in low-light or with reduced contrast sensitivity.

**Fix:** Consider using a brighter active indicator on the dark header — either a lighter green, white, or `var(--accent)` with a lighter tint. Or add a secondary highlight (e.g., `color: white` for active tab text in addition to the underline).

---

### IN-03: `_loadCollectorOptions` is dead code after `_loadSummaryFromDuckDB` now includes it

**File:** `frontend/src/bee-atlas.ts:405-429`

**Issue:** `_loadCollectorOptions()` runs the same SQL query as the collector block inside `_loadSummaryFromDuckDB()` (lines 383–396). Both methods produce identical `_collectorOptions` results. `_loadCollectorOptions` is only called from `_onDataLoaded` (line 752), but `_onDataLoaded` is the map-path handler while `_loadSummaryFromDuckDB` handles the table-path. This means when in map view, `_collectorOptions` is loaded via the standalone method; when in table view it's loaded via the summary method. The duplication is a maintenance risk — if the query changes in one place it may not be updated in the other.

**Fix:** Extract the collector query into a shared private method, or remove `_loadCollectorOptions` and call it from within `_loadSummaryFromDuckDB`. On the map path, call the shared helper from `_onDataLoaded` rather than the full summary loader.

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
