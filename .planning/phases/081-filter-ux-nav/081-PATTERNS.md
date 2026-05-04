# Phase 81: Filter UX & Nav — Pattern Map

**Mapped:** 2026-05-04
**Files analyzed:** 16 (10 new, 6 modified)
**Analogs found:** 16 / 16 (every target has at least one strong in-tree analog)

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `src/lib/spa-link.ts` | new | utility (pure fn) | transform | `src/url-state.ts:25-65` (buildParams shape) | role-match (smaller subset) |
| `src/species/url-state.ts` | new | utility (URL contract) | transform | `src/url-state.ts:25-130` (buildParams + parseParams) | exact |
| `src/species/bee-taxon-nav.ts` | new | presenter (light-DOM Lit) | event-driven (down=props, up=CustomEvent) | `src/species/bee-species-card.ts` (light-DOM, no-render decorate-SSR pattern) | exact (decorate SSR) |
| `src/species/bee-species-filter.ts` | new | presenter (light-DOM Lit) | event-driven (CustomEvent up) | `src/bee-filter-controls.ts:355-364, 475-501` (chip UI + filter-changed event) | role-match (renders into light DOM, but emits same event shape) |
| `src/species/seasonality-viz.ts` | new | presenter (light-DOM Lit, inline SVG) | request-response (data prop → SVG) | `src/bee-sidebar.ts:112-123` (Lit `render()` returning template) — no inline-SVG analog exists | role-match; SVG pattern is new (RESEARCH Example 4) |
| `src/tests/spa-link.test.ts` | new | test (pure fn) | unit | `src/tests/url-state.test.ts:25-50` | exact |
| `src/tests/species-url-state.test.ts` | new | test (pure fn) | unit | `src/tests/url-state.test.ts:25-60` | exact |
| `src/tests/bee-taxon-nav.test.ts` | new | test (DOM, happy-dom) | unit | `src/tests/bee-sidebar.test.ts:23-37` (elementProperties + source-regex) | exact |
| `src/tests/bee-species-filter.test.ts` | new | test (DOM) | unit | `src/tests/bee-sidebar.test.ts:23-37` | exact |
| `src/tests/seasonality-viz.test.ts` | new | test (DOM) | unit | `src/tests/bee-sidebar.test.ts:23-37` | role-match |
| `src/entries/species.ts` | modified | bundler entry (side-effect imports) | import-only | itself (already established pattern) | exact (additive 3 imports) |
| `_pages/species.njk` | modified | Eleventy SSR template | template | itself (Phase 80 baseline) | exact (additive markup) |
| `_data/species.js` | modified | build-time data feed | transform (sync JSON read) | itself (already reads `species.json`); extend with `seasonality.json` keys | exact (extend in place) |
| `src/species/bee-species-card.ts` | modified | presenter (light-DOM, locked NO-render) | downward `@property`; DOM mutate via `willUpdate` | `src/species/bee-species-card.ts` itself + Pitfall #81-A pattern | exact (extend without violating prototype-identity) |
| `src/species/bee-species-page.ts` | modified | coordinator (state owner, ARCH-03) | URL ↔ state ↔ children | `src/bee-atlas.ts:265-300, 477-499` (`replaceState`+debounced `pushState`+popstate) | exact |
| `src/tests/arch.test.ts` | modified | test (source-analysis) | static | itself (extend FORBIDDEN block for `src/lib/spa-link.ts`) | exact |

---

## Pattern Assignments

### `src/lib/spa-link.ts` (NEW — utility, pure fn)

**Analog:** `src/url-state.ts:25-65` (URL-building idiom).

**Imports pattern — none (D-05 explicitly forbids transitive `../filter.ts` pulls).** No imports at all is the goal: this file must be a leaf module. Verify by `src/tests/arch.test.ts` extension (see below).

**Core pattern (full file ≈ 15 lines)** — see RESEARCH.md Example 1, lines 254-279. Verbatim recommendation:

```ts
export type TaxonRank = 'family' | 'genus' | 'species';

export function buildSpaTaxonLink(
  scientificName: string,
  rank: TaxonRank = 'species'
): string {
  const params = new URLSearchParams();
  params.set('taxon', scientificName);
  params.set('taxonRank', rank);
  return '/?' + params.toString();
}
```

**Source contract** (extracted from `src/url-state.ts:35-38, 83-89`): the SPA's `parseParams` requires BOTH `taxon` AND `taxonRank`. If either is missing, `resolvedTaxonName` and `resolvedTaxonRank` both become `null` (line 88). `buildSpaTaxonLink` MUST emit both. Round-trip test at `src/tests/spa-link.test.ts` proves this.

**Header doc:** Mirror RESEARCH.md Example 1 lines 256-266 verbatim — names the ARCH-04 boundary and the SPA contract source.

---

### `src/species/url-state.ts` (NEW — utility, URL contract for /species/)

**Analog:** `src/url-state.ts:25-130` — exact pattern (buildParams returning `URLSearchParams`, parseParams taking `search: string`).

**SPA url-state CSV-encoding excerpt** (`src/url-state.ts:52-57`) — copy this pattern for `county` and `ecor`:

```ts
if (filter.selectedCounties.size > 0) {
  params.set('counties', [...filter.selectedCounties].sort().join(','));
}
if (filter.selectedEcoregions.size > 0) {
  params.set('ecor', [...filter.selectedEcoregions].sort().join(','));
}
```

**Core pattern (full file)** — see RESEARCH.md Example 2, lines 281-336 verbatim. Disjoint param namespace: `fam, subf, tribe, gen, subg, county, ecor, m0, m1`. NO imports from `src/url-state.ts` (D-06: zero shared code).

**Header doc:** include the D-02 `max()` approximation disclosure (RESEARCH lines 286-289) so future readers don't refactor it into a sum.

---

### `src/species/bee-taxon-nav.ts` (NEW — presenter, decorate-SSR)

**Analog:** `src/species/bee-species-card.ts:1-53` — the light-DOM, NO-render, decorate-server-rendered-children pattern. The taxon tree is server-rendered as nested `<details>`/`<ul>` by a Nunjucks macro in `_pages/species.njk`; `<bee-taxon-nav>` upgrades and walks the existing DOM.

**Imports pattern** (from `src/species/bee-species-card.ts:21-22`):

```ts
import { LitElement, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
```

**Light-DOM + no-render pattern** (`src/species/bee-species-card.ts:24-53`):

```ts
@customElement('bee-taxon-nav')
export class BeeTaxonNav extends LitElement {
  @property({ attribute: false }) activeTaxonPath: string[] = [];

  protected createRenderRoot(): HTMLElement { return this; }

  // INTENTIONAL: do NOT define render() — Nunjucks emits the tree.
  // Decorate via willUpdate + this.querySelectorAll(...).
}
```

**State-mutation pattern (Pitfall #81-A):** override `willUpdate(changedProps)`, then `this.querySelectorAll('li[data-taxon]').forEach(li => li.classList.toggle('muted', !active))`. Same shape as the badge update on `<bee-species-card>` (Plan 5).

**Event emission pattern (`src/bee-sidebar.ts:105-110`):** clicking a node dispatches `taxon-selected`:

```ts
this.dispatchEvent(new CustomEvent('taxon-selected', {
  bubbles: true, composed: true,
  detail: { path: ['Apidae', 'Apinae', 'Bombus'] },
}));
```

---

### `src/species/bee-species-filter.ts` (NEW — presenter, render-on-upgrade)

**Analog:** `src/bee-filter-controls.ts:355-364` (filter-changed CustomEvent) + `src/bee-sidebar.ts:112-123` (Lit `render()` template). UNLIKE the card and taxon-nav, this component DOES define `render()` — the host element is server-rendered empty (CONTEXT D-03 accepts no-JS=non-functional filter).

**CustomEvent emission pattern** (`src/bee-filter-controls.ts:360-363`):

```ts
this.dispatchEvent(new CustomEvent('filter-changed', {
  bubbles: true, composed: true,
  detail: { counties: this._counties, ecoregions: this._ecoregions, monthFrom, monthTo },
}));
```

**Token-pill remove-button pattern** (`src/bee-filter-controls.ts:480-487`) — applies to the breadcrumb pill row in `<bee-species-page>` rather than this filter widget, but the visual token shape is the analog:

```ts
<span class="token">
  ${tokenLabel(t)}
  <button class="token-remove" aria-label="Remove ${tokenLabel(t)}"
    @click=${(e: Event) => { e.stopPropagation(); this._removeToken(i); }}
  >&#x2715;</button>
</span>
```

**`<details>` popover pattern (D-03):** new in this codebase. Render `<details><summary>County (N selected)</summary><ul>${options.map(o => html`<li><label><input type="checkbox" .checked=${this._counties.has(o)} @change=${e => this._toggleCounty(o, e)}>${o}</label></li>`)}</ul></details>`. Light DOM (`createRenderRoot() { return this }`).

**Properties:**

```ts
@property({ attribute: false }) countyOptions: string[] = [];
@property({ attribute: false }) ecoregionOptions: string[] = [];
@property({ attribute: false }) selectedCounties: Set<string> = new Set();
@property({ attribute: false }) selectedEcoregions: Set<string> = new Set();
@property({ type: Number }) monthFrom = 1;
@property({ type: Number }) monthTo = 12;
```

---

### `src/species/seasonality-viz.ts` (NEW — presenter, inline SVG)

**Analog:** `src/bee-sidebar.ts:112-123` for the `render()` shape; **no in-tree analog for inline SVG via lit-html**. Use the Lit 3 `svg` tagged template literal (RESEARCH.md Example 4, lines 394-455 verbatim).

**Required imports** (NEW pattern):

```ts
import { LitElement, html, svg, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
```

**Why `svg` tag and not `html`:** Lit's `svg` template tag emits SVG-namespace nodes; `html` emits HTML-namespace nodes which silently don't render inside `<svg>`. Verified pattern stable since lit-html 1.x (RESEARCH Pattern 7, lines 145-158).

**Light-DOM + render() (acceptable here — server emits empty host):**

```ts
@customElement('seasonality-viz')
export class SeasonalityViz extends LitElement {
  @property({ attribute: false }) data: number[] = new Array(12).fill(0);
  protected createRenderRoot(): HTMLElement { return this; }
  render() { /* see Example 4 */ }
}
```

Bar threshold: `total >= 5`. Sample-size annotation: `*` 20–49 / `**` 50–99 / `***` 100–999 / `****` ≥1000. Season bands: meteorological (Win=Dec/Jan/Feb, Spr=Mar-May, Sum=Jun-Aug, Fall=Sep-Nov).

---

### `src/species/bee-species-page.ts` (MODIFIED — coordinator extension)

**Analog:** `src/bee-atlas.ts` is the canonical state-owner coordinator.

**Read first:** `src/species/bee-species-page.ts:1-50` (current Phase 80 skeleton — already declares `_activeTaxonPath`, `_geoFilter`, `_seasonFilter`).

**URL push/replace pattern** (`src/bee-atlas.ts:477-492`) — copy verbatim:

```ts
private _pushUrlState() {
  const params = buildParams(/* ...this._taxonPath, this._geoFilter, this._seasonFilter */);
  window.history.replaceState({}, '', '?' + params.toString());
  if (this._mapMoveDebounce) clearTimeout(this._mapMoveDebounce);
  this._mapMoveDebounce = setTimeout(() => {
    window.history.pushState({}, '', '?' + params.toString());
    this._mapMoveDebounce = null;
  }, 500);
}
```

**connectedCallback URL parse + popstate** (`src/bee-atlas.ts:265-300`):

```ts
connectedCallback() {
  super.connectedCallback();
  // ...parse window.location.search, hydrate state...
  window.history.replaceState({}, '', '?' + initParams.toString());
  window.addEventListener('popstate', this._onPopState);
}

disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('popstate', this._onPopState);
  if (this._mapMoveDebounce) {
    clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = null;
  }
}
```

**popstate handler shape** (`src/bee-atlas.ts:494-504`):

```ts
private _onPopState = () => {
  this._isRestoringFromHistory = true;
  if (this._mapMoveDebounce) {
    clearTimeout(this._mapMoveDebounce);
    this._mapMoveDebounce = null;
  }
  const parsed = parseParams(window.location.search);
  // ...apply parsed state to fields...
};
```

**filteredCount compute pattern** (RESEARCH Example 3, lines 339-392) — D-01 + D-02 with `max()` approximation. Singleton seasonality fetch (RESEARCH OQ-5, lines 522-533).

**Phase 80 invariant — NO render() override:** the prototype-identity invariant is on `<bee-species-card>`, not the page. The page is allowed to define `render()` for breadcrumb pill row + empty-state additive markup. But: the SSR'd cards must NOT be removed by the coordinator's `render()`. Recommended: render coordinator chrome (pill row, empty-state div) into separate `<div slot=…>`-style hosts that Nunjucks emits as siblings of the card list, OR keep `<bee-species-page>` light-DOM and additive-only via `willUpdate` + `this.querySelector('.breadcrumb-pills')` (consistent with the card's pattern). The latter preserves the no-render invariant for both classes — recommended.

---

### `src/species/bee-species-card.ts` (MODIFIED — extension respecting prototype-identity)

**Analog:** itself + Pitfall #81-A mitigation pattern (RESEARCH lines 212-219).

**LOCKED invariant** (`src/tests/bee-species-card.test.ts:11-13`):

```ts
test('does NOT override render() — preserves Eleventy SSR children', () => {
  expect((BeeSpeciesCard.prototype as any).render).toBe((LitElement.prototype as any).render);
});
```

Adding `render()` here makes that test fail. DO NOT.

**Extension pattern (Pitfall #81-A):**

```ts
@property({ type: Number }) filteredCount = -1;  // -1 sentinel: not yet computed (Pitfall #81-D)

protected willUpdate(changed: PropertyValues<this>): void {
  super.willUpdate(changed);
  if (changed.has('filteredCount')) {
    if (this.filteredCount === -1) return;        // skip initial-flash
    const badge = this.querySelector('.count-badge');
    if (badge) badge.textContent = `${this.filteredCount} record${this.filteredCount === 1 ? '' : 's'}`;
    this.classList.toggle('muted', this.filteredCount === 0);
    const link = this.querySelector('.spa-link') as HTMLAnchorElement | null;
    if (link) link.textContent = `View ${this.filteredCount} occurrence${this.filteredCount === 1 ? '' : 's'} →`;
  }
}
```

**Imports addition:** `import { LitElement, css, type PropertyValues } from 'lit';` (extending the existing line 21).

**Mute styling (D-07 + Pitfall #81-A step 4):** add `.muted { opacity: 0.35; }` to the existing `static styles`. The class is toggled in `willUpdate`.

---

### `_pages/species.njk` (MODIFIED — additive SSR markup)

**Analog:** itself, lines 1-26 (Phase 80 baseline).

**Read first:** the full current file (26 lines). Phase 81 ADDS:

1. Above `<bee-species-page>` opening tag: a `<bee-taxon-nav>` host containing the recursive `<details>`/`<ul>` macro emitted from `species.tree`. NAV-05 mandates server-rendered, no-JS-navigable.
2. Inside `<bee-species-page>`, before the `{%- for sp in species.flat -%}` loop: empty `<bee-species-filter>` host element (D-03 accepts no-JS=non-functional) and a `<div class="breadcrumb-pills">` placeholder + `<div class="empty-state" hidden>` placeholder.
3. Inside each `<bee-species-card>`, after the existing children (heading/photo/map/attribution/description/link):
   - `<span class="count-badge">{{ sp.occurrence_count }} records</span>` (Pitfall #81-D fallback: SSR with unfiltered count so initial paint is correct).
   - `<seasonality-viz></seasonality-viz>` (empty host; Lit fills on upgrade).
   - Update the existing `<a href="/?taxon={{ sp.scientificName | urlencode }}">Open in atlas</a>` → `<a class="spa-link" href="/?taxon={{ sp.scientificName | urlencode }}&taxonRank=species">View {{ sp.occurrence_count }} occurrences →</a>` (LINK-01: BOTH `taxon` AND `taxonRank` required; the existing line 22 is missing `taxonRank` — that's the LINK-01/Pitfall #17 bug Phase 81 must fix).

**Subgenus-skip rule (NAV-02) — Nunjucks macro:** when iterating `genus.children`, skip the `'null'` subgenus key only if it's the SOLE key (i.e., no real subgenera exist for that genus). Otherwise include all keys including `'null'` (= "no subgenus" leaf bucket).

---

### `_data/species.js` (MODIFIED — extend exports)

**Analog:** itself, lines 1-60 (Phase 80 baseline).

**Read first:** the full current file (60 lines). It exports `{ tree, flat, byScientificName }`.

**Extension pattern** (RESEARCH lines 128-140):

```js
const seasonalityJsonPath = join(repoRoot, 'public/data/seasonality.json');
const seasonality = JSON.parse(readFileSync(seasonalityJsonPath, 'utf8'));

const counties = new Set();
const ecoregionL3 = new Set();
for (const speciesEntry of Object.values(seasonality)) {
  for (const key of Object.keys(speciesEntry)) {
    if (key.startsWith('county:')) counties.add(key.slice('county:'.length));
    else if (key.startsWith('ecoregion_l3:')) ecoregionL3.add(key.slice('ecoregion_l3:'.length));
  }
}

export default {
  tree, flat, byScientificName,
  counties: [...counties].sort(),
  ecoregionL3: [...ecoregionL3].sort(),
};
```

**Pitfall #8 preserved:** still no parquet read (`src/tests/data-species.test.ts:28-31` regex-asserts no `parquet` in the file). The test stays green.

---

### `src/entries/species.ts` (MODIFIED — additive side-effect imports)

**Analog:** itself.

**Read first:** the full current file (15 lines).

**Extension:** add three lines after line 14:

```ts
import '../species/bee-taxon-nav.ts';
import '../species/bee-species-filter.ts';
import '../species/seasonality-viz.ts';
```

**ALLOWED set update in `src/tests/arch.test.ts:144-148`:** add the three new specifiers (with and without `.ts` suffix) to the `ALLOWED` Set so the existing PAGE-04 test stays green.

---

### `src/tests/arch.test.ts` (MODIFIED — extension for `src/lib/spa-link.ts` + species-entry allowlist)

**Analog:** itself, lines 26-34 (FORBIDDEN list) and 142-168 (PAGE-04 ALLOWED set).

**Read first:** the full current file (168 lines).

**Extension 1 — new describe block for `src/lib/spa-link.ts`** (RESEARCH Example 5, lines 458-475):

```ts
describe('ARCH-04: src/lib/spa-link.ts boundary (D-05)', () => {
  const file = resolve(ROOT, 'src/lib/spa-link.ts');
  const FORBIDDEN_FOR_LIB = [...FORBIDDEN, '../url-state.ts', '../url-state'];

  test('src/lib/spa-link.ts contains no forbidden imports', () => {
    const src = readFileSync(file, 'utf8');
    const all = [
      ...extractImports(src, STATIC_IMPORT_RE),
      ...extractImports(src, DYNAMIC_IMPORT_RE),
    ];
    const violations = all.filter(s => FORBIDDEN_FOR_LIB.some(bad => s === bad || s.startsWith(bad + '/')));
    expect(violations, `forbidden imports: ${violations.join(', ')}`).toEqual([]);
  });
});
```

**Extension 2 — extend ALLOWED set at lines 144-148** to include `bee-taxon-nav`, `bee-species-filter`, `seasonality-viz` (with and without `.ts`).

---

### `src/tests/spa-link.test.ts` (NEW — pure fn round-trip)

**Analog:** `src/tests/url-state.test.ts:36-44` (taxon round-trip block).

**Pattern — round-trip via the SPA's `parseParams`** (LINK-02):

```ts
import { test, expect, describe } from 'vitest';
import { buildSpaTaxonLink } from '../lib/spa-link.ts';
import { parseParams } from '../url-state.ts';   // crossing module boundary in tests is fine

describe('buildSpaTaxonLink (LINK-01..04)', () => {
  test('species rank: round-trips through SPA parseParams', () => {
    const link = buildSpaTaxonLink('Andrena anograe');
    expect(link).toBe('/?taxon=Andrena+anograe&taxonRank=species');  // URLSearchParams encodes space as '+'
    const search = link.split('?')[1] ?? '';
    const parsed = parseParams(search);
    expect(parsed.filter?.taxonName).toBe('Andrena anograe');
    expect(parsed.filter?.taxonRank).toBe('species');
  });
  test('genus rank', () => { /* rank='genus' */ });
  test('family rank', () => { /* rank='family' */ });
});
```

LINK-04 sub-test: `readFileSync(resolve(ROOT, 'src/url-state.ts'), 'utf8')` and regex-assert the header comment names the contract.

---

### `src/tests/species-url-state.test.ts` (NEW — pure fn round-trip)

**Analog:** `src/tests/url-state.test.ts:25-60` — exact pattern, just different module under test.

**Pattern:**

```ts
import { test, expect, describe } from 'vitest';
import { buildParams, parseParams, type SpeciesPageState } from '../species/url-state.ts';

function emptyState(): SpeciesPageState {
  return {
    taxonPath: { family: null, subfamily: null, tribe: null, genus: null, subgenus: null },
    counties: new Set(), ecoregions: new Set(),
    monthFrom: 1, monthTo: 12,
  };
}

describe('species url-state round-trip (D-06, FILT-02, FILT-03)', () => {
  test('taxonPath family round-trips', () => {
    const s = { ...emptyState(), taxonPath: { ...emptyState().taxonPath, family: 'Apidae' } };
    const params = buildParams(s);
    expect(params.get('fam')).toBe('Apidae');
    const r = parseParams(params.toString());
    expect(r.taxonPath.family).toBe('Apidae');
  });
  // counties CSV; ecoregions CSV; m0/m1; multi-dimensional; defaults omitted from URL...
});
```

---

### `src/tests/bee-taxon-nav.test.ts`, `src/tests/bee-species-filter.test.ts`, `src/tests/seasonality-viz.test.ts` (NEW — DOM tests, happy-dom)

**Analog:** `src/tests/bee-sidebar.test.ts:23-37` for the `elementProperties` reflection check + `src/tests/bee-species-card.test.ts:11-18` for prototype-identity assertions where applicable.

**Three-tier strategy (RESEARCH OQ-6, lines 535-547):**

| Test | Tier | Mechanism |
|---|---|---|
| `bee-taxon-nav.test.ts` | tier 1 (proto-identity) for "no render()" + tier 3 (DOM) for mute-class application | `expect(BeeTaxonNav.prototype.render).toBe(LitElement.prototype.render)` then mount + set `activeTaxonPath` + assert `.muted` class on filtered branches |
| `bee-species-filter.test.ts` | tier 2 (`elementProperties`) for `@property` declarations + tier 3 for filter-changed CustomEvent | Mount, toggle a checkbox, assert `dispatchEvent` was called with `'filter-changed'` and correct `detail` |
| `seasonality-viz.test.ts` | tier 3 (DOM) | Two cases: `data=[5,5,5,5,5,5,5,5,5,5,5,5]` → assert 12 `<rect class="bar">`; `data=[1,1,1,0,...]` → assert fallback `<p class="viz-fallback">`. Plus 4 cases for `*`/`**`/`***`/`****` thresholds. Plus tier-1 source-regex: no `kde\|kernel` (VIZ-04 contract). |

**Mount pattern from `src/tests/bee-sidebar.test.ts:8-21`** (`vi.mock` heavy modules first, then `await import` the component); for these new presenters there are no heavy deps to mock — just `await import('../species/<name>.ts')` and `document.body.appendChild(document.createElement(<tag>))`.

---

## Shared Patterns

### State ownership (ARCH-03, D-01, locked)

**Source:** `src/species/bee-species-page.ts:32-50` (Phase 80 skeleton) + `src/bee-atlas.ts` overall.
**Apply to:** All Phase 81 files.

The coordinator owns ALL reactive state. Presenters receive `@property` and emit `CustomEvent`. There is exactly one place where mutable state lives: `<bee-species-page>` (and a frozen module-level `seasonalityPromise` singleton for the fetched JSON, which is read-only after first call).

### Light-DOM + NO-render presenter pattern (D-05, locked)

**Source:** `src/species/bee-species-card.ts:38-53`.
**Apply to:** `<bee-species-card>` (modified) and `<bee-taxon-nav>` (new) — both decorate Eleventy SSR.

```ts
protected createRenderRoot(): HTMLElement { return this; }
// INTENTIONAL: do NOT define render() — preserves SSR children.
```

State changes are projected via `willUpdate(changedProps)` + `this.querySelector(...)` mutations. Validated by prototype-identity assertion (`src/tests/bee-species-card.test.ts:11-13`).

### Light-DOM + render() presenter pattern (server emits empty host)

**Source:** `src/bee-sidebar.ts:112-123` (render() shape).
**Apply to:** `<bee-species-filter>` and `<seasonality-viz>` — server emits empty host element; Lit fills on upgrade. CONTEXT D-03 explicitly accepts these as non-functional without JS.

### URL push/replace + popstate (canonical phase 81 coordinator pattern)

**Source:** `src/bee-atlas.ts:265-300` (connectedCallback / disconnectedCallback) + `src/bee-atlas.ts:477-499` (`_pushUrlState` + `_onPopState`).
**Apply to:** `<bee-species-page>` only.

Immediate `replaceState` for refresh-survival; debounced 500 ms `pushState` to coalesce rapid changes into a single history entry. `popstate` listener restores state; clear the debounce on `disconnectedCallback`.

### CustomEvent emission (upward signal)

**Source:** `src/bee-filter-controls.ts:360-363` and `src/bee-sidebar.ts:105-110`.
**Apply to:** Every Phase 81 presenter that signals change.

```ts
this.dispatchEvent(new CustomEvent('<event-name>', {
  bubbles: true, composed: true,
  detail: { /* typed payload */ },
}));
```

Standard event names for Phase 81: `taxon-selected`, `filter-changed`, `pill-dismissed`, `clear-filters`. Coordinator wires `@taxon-selected`, `@filter-changed`, etc. on the host elements in its template (or via `addEventListener` in `connectedCallback` if no coordinator-side render).

### URL round-trip Vitest pattern

**Source:** `src/tests/url-state.test.ts:25-60`.
**Apply to:** `spa-link.test.ts`, `species-url-state.test.ts`.

Per-dimension `buildParams → parseParams` round-trip; assert each param key appears with expected value AND the parsed state equals the input state.

### Source-analysis arch test pattern (ARCH-04)

**Source:** `src/tests/arch.test.ts:26-107` — `FORBIDDEN` array + `STATIC_IMPORT_RE` + `DYNAMIC_IMPORT_RE` + `extractImports` strips comments before matching.
**Apply to:** Extension for `src/lib/spa-link.ts`. Reuse `extractImports` and the regex constants from the existing file.

### `_data/*.js` build-time data feed

**Source:** `_data/species.js:1-60`.
**Apply to:** Extension to derive `counties` and `ecoregionL3` arrays. Sync `readFileSync(JSON.parse(...))` only — Pitfall #8: NO parquet read in `_data/*.js`.

### Sentinel default for cross-tree `@property` (Pitfall #81-D)

**Source:** RESEARCH Pitfall #81-D, lines 231-234.
**Apply to:** `<bee-species-card>.filteredCount`. Default `-1` (= "not yet computed"); `willUpdate` skips DOM mutation when `filteredCount === -1`. Avoids initial-render "0 records" flash across 735 cards.

### Seasonality fetch singleton (Pitfall #81-B)

**Source:** RESEARCH OQ-5, lines 522-533. New module-level pattern.
**Apply to:** `<bee-species-page>` (or sibling `src/species/seasonality-cache.ts`).

```ts
let promise: Promise<Record<string, Record<string, number[]>> | null> | null = null;
export function loadSeasonality() {
  if (!promise) {
    promise = fetch('/data/seasonality.json')
      .then(r => r.ok ? r.json() : null)
      .catch(err => { console.warn('seasonality.json fetch failed', err); return null; });
  }
  return promise;
}
```

Coordinator awaits this before the first `_computeFilteredCounts` pass. While awaiting, cards stay in their SSR'd `occurrence_count` state (Pitfall #81-D fallback).

---

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `src/species/seasonality-viz.ts` (inline-SVG portion only) | presenter | No `lit` `svg` tagged-template usage anywhere in the repo; occurrence maps are `<img src="*.svg">` per Phase 80 D-03. RESEARCH Example 4 (lines 394-455) is the canonical recommendation; planner copies it verbatim. |
| `<details>`-popover checkbox-list filter widget | presenter | No existing `<details>`-popover multi-select in the repo. Native pattern — no analog needed beyond CONTEXT D-03 spec + RESEARCH OQ-3 (lines 496-503). |
| Nunjucks recursive macro for taxon tree | template | No recursive Nunjucks macro elsewhere in the repo; this is a new template idiom. Planner uses standard Nunjucks `{% macro %}` + self-recursive call over `species.tree.children`. |

In each case the absence of an in-tree analog is documented in RESEARCH.md and a concrete external pattern is recommended verbatim.

---

## Metadata

**Analog search scope:** `src/`, `_pages/`, `_data/`, `src/tests/`, `src/species/`, `src/lib/` (new).
**Files scanned:** 9 source files (`src/bee-atlas.ts`, `src/url-state.ts`, `src/bee-sidebar.ts`, `src/bee-filter-controls.ts`, `src/species/bee-species-page.ts`, `src/species/bee-species-card.ts`, `src/entries/species.ts`, `_data/species.js`, `_pages/species.njk`) + 5 test files (`src/tests/arch.test.ts`, `src/tests/url-state.test.ts`, `src/tests/bee-species-card.test.ts`, `src/tests/bee-sidebar.test.ts`, `src/tests/data-species.test.ts`).
**Pattern extraction date:** 2026-05-04
