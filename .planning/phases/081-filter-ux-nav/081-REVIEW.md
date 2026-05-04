---
phase: 081-filter-ux-nav
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - _data/species.js
  - _includes/taxon-tree.njk
  - _pages/species.njk
  - src/entries/species.ts
  - src/lib/spa-link.ts
  - src/species/bee-species-card.ts
  - src/species/bee-species-filter.ts
  - src/species/bee-species-page.ts
  - src/species/bee-taxon-nav.ts
  - src/species/seasonality-cache.ts
  - src/species/seasonality-viz.ts
  - src/species/url-state.ts
  - src/tests/arch.test.ts
  - src/tests/bee-species-filter.test.ts
  - src/tests/bee-species-page.test.ts
  - src/tests/bee-taxon-nav.test.ts
  - src/tests/seasonality-viz.test.ts
  - src/tests/spa-link.test.ts
  - src/tests/species-url-state.test.ts
  - src/url-state.ts
findings:
  blocker: 4
  warning: 8
  total: 12
status: issues_found
---

# Phase 081: Code Review Report

**Reviewed:** 2026-05-04
**Depth:** standard
**Files Reviewed:** 19 (plus 1 implicit URL-state file)
**Status:** issues_found

## Summary

The Phase 81 filter/UX/nav surface lands a coordinator (`bee-species-page`), three presenters (`bee-taxon-nav`, `bee-species-filter`, `seasonality-viz`), an SSR taxon tree, and a disjoint URL contract. Architecture invariants (light-DOM + no `render()`, ARCH-04 import boundaries, SSR-preserving willUpdate decoration) are well-defended by tests in `arch.test.ts`. Test coverage is solid for the URL round-trip and filter widget basics.

However, several integration-level defects surfaced. Four are blockers — three concern correctness of the user-visible filter behavior (taxon path is computed but never applied to card counts; popstate guard is racy; initial URL hydrate spuriously pushes a duplicate history entry). One blocker concerns a subtle subgenus rendering choice that leaks the literal string `"(no subgenus)"` into URL state. Eight warnings document smaller issues — encoding inconsistencies, missing month-range validation, brittle sibling coupling, and unescaped `&` in SSR `href`s.

## Blocker Issues

### BL-01: Taxon-path filter is never applied to card counts or muting

**File:** `src/species/bee-species-page.ts:160-226`
**Issue:** `_computeAndPropagate` derives `filteredCount` per card from `seasonality.json` slices using the geo + month dimensions only. The `_activeTaxonPath` is folded into the `_isFilterActive` flag (line 166-169) but is **never used** to gate which cards get a non-zero count or get muted. Effect: when the user clicks "Bombus" (genus) in the nav tree, every card outside that genus continues to display its full `_total` count and remains un-muted. The breadcrumb pill says "Bombus" but cards from Andrena, Halictus, etc. are visually unfiltered.

The doc-comment header for the file (line 17) lists "filtered count + 12-vector slice propagation to <bee-species-card> ... per CONTEXT D-02". CONTEXT D-02's max() OR-approximation is described in geo terms, but card filtering by taxon is what users observably expect from clicking a taxon — and the test at `bee-species-page.test.ts:107-122` only exercises the month-filter case, never asserting taxon-path muting on cards.

**Fix:** Decide whether taxon filter mutes cards (recommended), and if so, add the taxon-membership check in the per-card loop. Each `<bee-species-card>` already has its `<h2>scientificName</h2>` SSR'd. To classify by ancestor taxon, the coordinator needs each card's taxon path. Either (a) emit `data-family`, `data-genus`, etc. on each card from `_pages/species.njk`, or (b) build a name→taxonPath lookup from `_data/species.js` (already exposed as `byScientificName`) and load it via a small JSON sidecar.

```ts
// inside the card loop in _computeAndPropagate:
const taxonMatches = this._activeTaxonPath.length === 0
  || this._activeTaxonPath.every((needle, i) => cardTaxonPath[i] === needle);
if (!taxonMatches) {
  newCounts.set(name, 0);
  newSlices.set(name, new Array(12).fill(0));
  continue;
}
```

If the design intent is "taxon filter only mutes the nav tree, not cards" — that should be documented loudly in the file header AND reflected in the breadcrumb pill UX (e.g., the taxon pill should not be a "remove to widen" affordance because removing it changes nothing visible).

---

### BL-02: Initial URL hydration pushes a duplicate history entry

**File:** `src/species/bee-species-page.ts:66-79, 92-101, 136-146`
**Issue:** `connectedCallback` calls `_parseUrlAndHydrate()` which mutates the `@state` properties from the URL. Lit then schedules an update; `willUpdate` runs and at line 97 calls `_pushUrlState()` because `_isRestoringFromHistory` is `false` (it is only set inside `_onPopState`). `_pushUrlState` does an immediate `replaceState` (idempotent) AND arms a 500 ms timer that calls `pushState(url)` with the URL we just parsed. After 500 ms a duplicate history entry is created; the user's Back button no longer returns them to the previous page.

The 500 ms debounced `pushState` design assumes that interactive changes are the only callers, but the initial hydrate path also reaches it.

**Fix:** Treat the initial parse like a popstate restore (suppress the pushState):

```ts
async connectedCallback(): Promise<void> {
  super.connectedCallback();
  this._isRestoringFromHistory = true;
  this._parseUrlAndHydrate();
  queueMicrotask(() => { this._isRestoringFromHistory = false; });
  // ... rest as before
}
```

But also see BL-03 — `queueMicrotask` is the wrong primitive for clearing the guard.

---

### BL-03: `_isRestoringFromHistory` guard is cleared before `willUpdate` runs

**File:** `src/species/bee-species-page.ts:148-156`
**Issue:** `_onPopState` sets the guard, calls `_parseUrlAndHydrate` (which assigns to `@state` properties — these schedule a Lit update), then `queueMicrotask(() => { this._isRestoringFromHistory = false; })`. Lit's update cycle defers `willUpdate` to a later microtask checkpoint (post-`requestUpdate`). Empirically the order is platform-dependent, but on at least some Lit versions the queued microtask resolves *before* `willUpdate` runs, so by the time `willUpdate` evaluates `if (!this._isRestoringFromHistory) this._pushUrlState()` (line 97), the guard is already `false`. Result: popstate-driven state restores re-push their own history entry, breaking back/forward navigation.

**Fix:** Clear the flag in `updated()` (which runs *after* `willUpdate`) or by awaiting `this.updateComplete`:

```ts
private _onPopState = async (): Promise<void> => {
  this._isRestoringFromHistory = true;
  if (this._urlPushDebounce) {
    clearTimeout(this._urlPushDebounce);
    this._urlPushDebounce = null;
  }
  this._parseUrlAndHydrate();
  await this.updateComplete;
  this._isRestoringFromHistory = false;
};
```

---

### BL-04: `"(no subgenus)"` literal is leaked into URL state

**File:** `_includes/taxon-tree.njk:24-32`, `src/species/bee-species-page.ts:108`, `src/species/url-state.ts:37`
**Issue:** When a genus has multiple subgenus children including the `null` bucket, the template renders an `<li data-taxon="(no subgenus)" data-rank="subgenus">`. Clicking it walks the ancestor chain in `bee-taxon-nav._onClick` and dispatches `taxon-selected` with `path=[family, ..., genus, "(no subgenus)"]`. The coordinator stores this in `_activeTaxonPath`, projects it into `taxonPath.subgenus = "(no subgenus)"`, and emits it to the URL as `?subg=(no+subgenus)`. The URL is now bookmarked with a UI label, not a domain value; on reload `parseParams` happily takes the literal string back; mute/match logic (when implemented per BL-01) will compare against the literal `"(no subgenus)"` rather than the `null` taxon.

This also conflicts with `_data/species.js:54` which serializes the `null` bucket key as the string `"null"` — the template renders it as `"(no subgenus)"`, and the coordinator stores `"(no subgenus)"`. Three different representations of the same concept.

**Fix:** Pick one canonical sentinel and propagate it consistently. Options:
- Render the empty-subgenus bucket as `data-taxon="null"` (matching the tree key) and emit `subg=null` in the URL; the visible label stays `(no subgenus)` via the `<summary>` text.
- OR don't emit a clickable subgenus pill at all when the value is null — render the species directly under the genus even when there are sibling non-null subgenera (changes semantics of NAV-02; would need design sign-off).

The first option is the smaller change:

```njk
{# in renderSubgenus: data-taxon should be the raw key, label is display-only #}
<li data-taxon="{{ subgKey }}" data-rank="subgenus">
  <details>
    <summary>{{ label }}</summary>
    ...
```

## Warnings

### WR-01: Month range allows `monthFrom > monthTo`, silently zeros all counts

**File:** `src/species/bee-species-filter.ts:127-131`, `src/species/bee-species-page.ts:223`
**Issue:** `_setMonth` accepts any value in `[1, 12]` independently for `monthFrom` and `monthTo`. If a user sets `from=10, to=3`, the loop `for (let m = m0 - 1; m <= m1 - 1 && m < 12; m++)` runs zero times for every species → every card gets count 0 → empty-state shows. The user sees "no species match" with no indication that the month range is inverted.

**Fix:** Either clamp `monthFrom <= monthTo` in the widget (auto-swap or block the change) or detect the inverted range in `_computeAndPropagate` and surface a distinct UI message. Minimal change:

```ts
private _setMonth(field: 'monthFrom' | 'monthTo', value: number): void {
  if (!Number.isFinite(value) || value < 1 || value > 12) return;
  this[field] = value;
  if (this.monthFrom > this.monthTo) {
    if (field === 'monthFrom') this.monthTo = value;
    else this.monthFrom = value;
  }
  this._emit();
}
```

### WR-02: SSR hrefs use unescaped `&` between query params

**File:** `_includes/taxon-tree.njk:20, 40, 83`, `_pages/species.njk:35`
**Issue:** `href="/?taxon=...&taxonRank=species"` should encode the ampersand as `&amp;` in HTML. Browsers' lenient parsing handles this, but strict tools (XML parsers, some link-checkers, HTML validators) flag it. With ~735 cards on the page this is also ~735 validation warnings.

**Fix:** Use `&amp;` in Nunjucks templates, or use a URL builder helper that returns a `safe` string.

### WR-03: SSR vs. JS use different space encoding (`%20` vs `+`)

**File:** `_pages/species.njk:35` (uses `urlencode` → `%20`), `src/lib/spa-link.ts:21-23` (uses `URLSearchParams` → `+`)
**Issue:** Server-rendered links emit `taxon=Andrena%20anograe`; JS-built links emit `taxon=Andrena+anograe`. Both decode to the same value via `URLSearchParams.get`, so functionally equivalent — but they produce different URLs, which fragments analytics/cache keys and confuses users comparing URLs.

**Fix:** Pick one. Easiest is to make `buildSpaTaxonLink` use `encodeURIComponent` and produce `%20`-encoded output to match SSR.

### WR-04: `_renderBreadcrumb` uses `innerHTML` for trusted-but-unaudited values

**File:** `src/species/bee-species-page.ts:330-355`
**Issue:** `escapeHtml` (line 391) escapes `&<>"` but not `'`. All attribute values use `"` delimiters in this code so the omission is currently safe — but it is brittle. Future edits that switch to single-quoted attributes (or add a `title` attribute interpolating user-derived data) would silently introduce XSS. The data sources here (`_geoFilter.counties`, `_activeTaxonPath`) come from URL parsing, which means an attacker-controlled URL can pass arbitrary strings.

**Fix:** Either prefer DOM construction (`document.createElement` + `textContent`) over `innerHTML`, or extend `escapeHtml` to also escape `'`. The DOM-construction approach also avoids re-parsing HTML 700+ times during interactive filter changes.

### WR-05: Sibling-element coupling in coordinator

**File:** `src/species/bee-species-page.ts:253-258`
**Issue:** `_computeAndPropagate` reaches outside its own subtree via `document.querySelector('bee-taxon-nav')` to push state into a sibling element. The architecture invariant in `CLAUDE.md` says state flows down via `@property` and up via events, but here the coordinator's parent is `<body>`, and `<bee-taxon-nav>` is a sibling. The current workaround (also try `this.querySelector` first) handles both layouts, but the coupling is documented in a comment rather than enforced.

**Fix:** Move `<bee-taxon-nav>` inside `<bee-species-page>` in `_pages/species.njk` so the coordinator owns its descendants. The macro `renderTree` already wraps in `<bee-taxon-nav>` — just call it inside `<bee-species-page>`.

### WR-06: `_wireFilterWidgetOptions` runs once on connect; URL changes after load won't re-sync the widget

**File:** `src/species/bee-species-page.ts:282-307`
**Issue:** Called once from `connectedCallback`. After popstate or `_clearFilters`, the coordinator's `_geoFilter` updates and `_renderBreadcrumb` runs, but the `<bee-species-filter>` widget's UI state is only re-synced inside `_clearFilters` (line 325). On popstate-driven restore of, say, `?county=Pierce`, the filter widget's checkbox UI does not reflect the new selection (the checkbox state derives from `selectedCounties` Set, but that Set on the widget instance is whatever was set in the last interaction — not re-read from URL).

**Fix:** Call `_wireFilterWidgetOptions()` from `willUpdate` whenever `_geoFilter` or `_seasonFilter` changes:

```ts
if (changed.has('_geoFilter') || changed.has('_seasonFilter')) {
  this._wireFilterWidgetOptions();
}
```

(Or rename it; the function does both option-wiring and selection-syncing.)

### WR-07: Empty state can transiently show on first paint before seasonality loads

**File:** `src/species/bee-species-page.ts:75-79, 381-388`
**Issue:** `connectedCallback` awaits `loadSeasonality()` before calling `_computeAndPropagate`. Until then `_filteredCounts` is empty. The first reactive `willUpdate` (triggered by `_parseUrlAndHydrate` setting properties) runs before the await resolves; it calls `_toggleEmptyState`. With `counts.length === 0`, the guard `counts.length > 0 && Math.max(...counts) === 0` correctly evaluates to false → empty state stays hidden. OK in this code path.

But `Math.max(...[])` returns `-Infinity`, so if a future edit removes the `counts.length > 0` guard, the empty state will silently engage on every render where no counts have been computed. The guard is load-bearing and undocumented.

**Fix:** Add a comment, or short-circuit on `!this._seasonality`:

```ts
private _toggleEmptyState(): void {
  if (!this._seasonality) return;  // not yet computed
  ...
}
```

### WR-08: `arch.test.ts` ALLOWED set silently accepts removed entries

**File:** `src/tests/arch.test.ts:142-171`
**Issue:** The `ALLOWED` set in the species entry test is hardcoded. The test asserts no *unexpected* imports, but a presenter being silently removed from `src/entries/species.ts` (e.g., dropping `bee-species-filter` registration) would still pass the test — the side-effect import is gone but no test asserts it was *required*. The arch test should also assert that every component listed in `ALLOWED` is actually imported.

**Fix:** Add a positive assertion:

```ts
const REQUIRED = ['../bee-header.ts', '../species/bee-species-page.ts', /* ... */];
for (const req of REQUIRED) {
  expect(imports.some(i => i === req || i === req.replace(/\.ts$/, ''))).toBe(true);
}
```

---

_Reviewed: 2026-05-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
