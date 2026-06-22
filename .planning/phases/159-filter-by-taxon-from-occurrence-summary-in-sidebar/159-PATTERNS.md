# Phase 159: Filter by Taxon from Occurrence Summary in Sidebar - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 3 (2 modified source files, 1 modified test file)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/bee-occurrence-detail.ts` | component (presenter) | event-driven | `src/bee-pane.ts` (`_emitFilter`) | role-match |
| `src/bee-pane.ts` | component (presenter) | request-response | itself (line 1232 template) | exact |
| `src/tests/bee-occurrence-detail.test.ts` | test | — | `src/tests/bee-pane.test.ts` (lines 186-222) | exact |

---

## Pattern Assignments

### `src/bee-occurrence-detail.ts` (component, event-driven)

---

#### New `filterState` property declaration

**Analog:** `src/bee-occurrence-detail.ts` lines 69-70 (existing `@property` declarations)

```typescript
// EXISTING — mirror this pattern exactly:
@property({ attribute: false }) occurrences: OccurrenceRow[] = [];
@property({ attribute: false }) taxonCache: Map<number, TaxonCacheEntry> | null = null;

// NEW — add immediately after:
@property({ attribute: false }) filterState: FilterState | null = null;
```

Also add `FilterState` and `FilterChangedEvent` to the import from `'./filter.ts'`:

```typescript
// EXISTING line 3:
import type { OccurrenceRow } from './filter.ts';

// AFTER:
import type { OccurrenceRow, FilterState, FilterChangedEvent } from './filter.ts';
```

---

#### `filter-changed` CustomEvent dispatch pattern

**Analog:** `src/bee-pane.ts` lines 611-631 (`_emitFilter`)

```typescript
// bee-pane.ts lines 615-630 — exact shape to copy:
this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
  bubbles: true, composed: true,
  detail: {
    taxonId: this._selectedTaxon?.taxonId ?? null,
    taxonDisplayName: this._selectedTaxon?.displayName ?? null,
    yearFrom,
    yearTo,
    months: new Set<number>(),
    selectedCounties: this._selectedCounties,
    selectedEcoregions: this._selectedEcoregions,
    selectedCollectors: this._selectedCollectors,
    elevMin: this._elevMin,
    elevMax: this._elevMax,
    selectedPlace: this._selectedPlace,
  } as FilterChangedEvent,
}));
```

For `bee-occurrence-detail`, the method reads from `this.filterState` instead of internal state fields. The research-provided implementation (RESEARCH.md lines 97-116) is the correct adaptation:

```typescript
private _onTaxonClick(taxonId: number, displayName: string) {
  if (!this.filterState) return;
  this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
    bubbles: true,
    composed: true,
    detail: {
      taxonId,
      taxonDisplayName: displayName,
      yearFrom: this.filterState.yearFrom,
      yearTo: this.filterState.yearTo,
      months: this.filterState.months,
      selectedCounties: this.filterState.selectedCounties,
      selectedEcoregions: this.filterState.selectedEcoregions,
      selectedCollectors: this.filterState.selectedCollectors,
      elevMin: this.filterState.elevMin,
      elevMax: this.filterState.elevMax,
      selectedPlace: this.filterState.selectedPlace,
    } as FilterChangedEvent,
  }));
}
```

Note: `bubbles: true, composed: true` are both required — `composed` crosses the shadow DOM boundary from `bee-occurrence-detail`'s shadow root through `bee-pane`'s shadow root up to `bee-atlas`'s `@filter-changed` listener (bee-atlas.ts:548).

---

#### Icon-link markup pattern (for demoted external links)

**Analog:** `src/bee-occurrence-detail.ts` line 219 (existing `📷` pattern)

```typescript
// EXISTING — the icon-link pattern to mirror for demoted external links:
· <a href="https://www.inaturalist.org/observations/${row.specimen_observation_id}" target="_blank" rel="noopener" aria-label="View photo on iNaturalist">📷</a>
```

Use this for the demoted Ecdysis link in `_renderCollectorGroup`. Choose a glyph (e.g. `🔗` or `↗`) with a descriptive `aria-label="View on Ecdysis"`.

---

#### `_renderCollectorGroup` current markup to transform

**Source:** `src/bee-occurrence-detail.ts` lines 212-220

```typescript
// CURRENT (lines 212-220) — the <a> wraps BOTH determined name and "No determination":
<a href="https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}" target="_blank" rel="noopener">${displayName ? displayName : html`<span class="no-determination">No determination</span>`}</a>
${row.specimen_observation_id != null ? html`
  · <a href="https://www.inaturalist.org/observations/${row.specimen_observation_id}" target="_blank" rel="noopener" aria-label="View photo on iNaturalist">📷</a>
` : ''}

// AFTER — split into: taxon-name-as-button + ecdysis-icon-link (when determined);
//                      plain span + ecdysis-icon-link (when undetermined):
${displayName && row.taxon_id != null
  ? html`<span class="taxon-filter-link" role="button" tabindex="0" @click=${() => this._onTaxonClick(row.taxon_id!, displayName)}>${displayName}</span>`
  : html`<span class="no-determination">No determination</span>`
}
· <a href="https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}" target="_blank" rel="noopener" aria-label="View on Ecdysis">🔗</a>
```

---

#### Render paths that need ADDITIVE filter affordance only (no demotion)

`_renderProvisional` (lines 256-275), `_renderInatObs` (lines 277-306), and `_renderChecklist` (lines 308-334) do NOT currently wrap the taxon name in an external `<a>`. For these paths, the work is purely additive: wrap the `<em>${name}</em>` taxon element in a clickable span/button when `taxon_id != null`.

**Example from `_renderInatObs` lines 281-283 (current):**
```typescript
const taxonEl = inatDisplayName
  ? html`<em>${inatDisplayName}</em>`
  : html`<span class="hint">identification unknown</span>`;
```

**After (additive change only):**
```typescript
const taxonEl = inatDisplayName && row.taxon_id != null
  ? html`<span class="taxon-filter-link" role="button" tabindex="0" @click=${() => this._onTaxonClick(row.taxon_id!, inatDisplayName)}><em>${inatDisplayName}</em></span>`
  : inatDisplayName
    ? html`<em>${inatDisplayName}</em>`
    : html`<span class="hint">identification unknown</span>`;
```

Apply the same wrapper pattern in `_renderProvisional` (using `row.display_name` and `row.taxon_id`) and `_renderChecklist` (using `accepted` and `row.taxon_id` — only when `accepted != null`).

---

#### `_renderSampleOnly` — no change needed

**Source:** `src/bee-occurrence-detail.ts` lines 237-254

No taxon is present in this render path. The "View on iNaturalist" link (line 249) links the sample observation, not a taxon — D-02 does not apply. Leave this method unchanged.

---

### `src/bee-pane.ts` (component, request-response)

**Change:** One line in the template — add `.filterState=${this.filterState}` to the `<bee-occurrence-detail>` element.

**Analog:** `src/bee-pane.ts` line 1232 (current template usage)

```typescript
// CURRENT (line 1232):
: html`<bee-occurrence-detail .occurrences=${this.listRows} .taxonCache=${this.taxonCache}></bee-occurrence-detail>`

// AFTER:
: html`<bee-occurrence-detail .occurrences=${this.listRows} .taxonCache=${this.taxonCache} .filterState=${this.filterState}></bee-occurrence-detail>`
```

`bee-pane` already has `filterState` as a `@property({ attribute: false })` at line 58 — no additional declaration needed.

---

### `src/tests/bee-occurrence-detail.test.ts` (test)

**Analog:** `src/tests/bee-pane.test.ts` lines 1-6 and 186-222

#### File setup pattern (copy from bee-pane.test.ts lines 1-6)

```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
```

Note: bee-pane.test.ts also imports `vi` and mocks `sqlite.ts` + `features.ts` (lines 9-20) because it does DOM mounting. `bee-occurrence-detail.test.ts` does NOT mount DOM — source-text assertions only — so no mocks are needed. The existing file already has the minimal import shape (`import { describe, test, expect } from 'vitest'`).

#### Source-text read pattern (bee-pane.test.ts analog)

```typescript
// Add a new describe block for source-text assertions:
describe('bee-occurrence-detail.ts source structure', () => {
  const src = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');

  test('declares filterState property', () => {
    expect(src).toMatch(/@property[^)]*\)\s+filterState/);
  });

  test('dispatches filter-changed event', () => {
    expect(src).toMatch(/new CustomEvent[^)]*['"]filter-changed['"]/);
  });

  test('filter-changed event uses bubbles:true, composed:true', () => {
    expect(src).toMatch(/bubbles:\s*true/);
    expect(src).toMatch(/composed:\s*true/);
  });

  test('FilterChangedEvent detail carries taxonId from row.taxon_id', () => {
    expect(src).toMatch(/taxonId[^,\n]*taxon_id/);
  });

  test('FilterChangedEvent detail preserves filterState dimensions', () => {
    expect(src).toMatch(/yearFrom:\s*this\.filterState/);
    expect(src).toMatch(/selectedCounties:\s*this\.filterState/);
    expect(src).toMatch(/selectedCollectors:\s*this\.filterState/);
  });

  test('_renderSampleOnly has no filter-changed dispatch (no taxon)', () => {
    const sampleBody = src.match(/_renderSampleOnly[\s\S]*?\n  private /)?.[0] ?? '';
    expect(sampleBody).not.toMatch(/filter-changed/);
  });
});
```

Also add to `bee-pane.test.ts` (in the existing `describe` block, after line 222):

```typescript
test('bee-pane.ts passes filterState to bee-occurrence-detail', () => {
  expect(src).toMatch(/\.filterState=\$\{this\.filterState\}[^`]*bee-occurrence-detail|bee-occurrence-detail[^`]*\.filterState=\$\{this\.filterState\}/s);
});
```

---

## Shared Patterns

### `bubbles: true, composed: true` on all upward events

**Source:** `src/bee-pane.ts` line 616
**Apply to:** The new `_onTaxonClick` dispatch in `bee-occurrence-detail.ts`

Both flags are required. `bubbles` alone is insufficient — without `composed: true`, the event stops at the shadow boundary between `bee-occurrence-detail` and `bee-pane`, never reaching `bee-atlas`'s `@filter-changed` listener.

### `@property({ attribute: false })` for non-serializable props

**Source:** `src/bee-occurrence-detail.ts` lines 69-70, `src/bee-pane.ts` line 58
**Apply to:** The new `filterState` property in `bee-occurrence-detail.ts`

All complex object properties (Maps, objects with Sets) use `attribute: false`. FilterState contains Sets (`months`, `selectedCounties`, etc.) — must use `attribute: false`.

### Source-text test pattern (no DOM mounting)

**Source:** `src/tests/bee-pane.test.ts` lines 1-6, 186-222
**Apply to:** New tests in `src/tests/bee-occurrence-detail.test.ts`

The project tests Lit components via `readFileSync` source-text assertions rather than DOM mounting (DOM mounting requires mapbox-gl mocks). New tests follow the identical `readFileSync(resolve(__dirname, '../<component>.ts'), 'utf-8')` + `expect(src).toMatch(...)` pattern.

---

## No Analog Found

None. All three files have direct analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/`, `src/tests/`
**Files scanned:** 6 (`bee-occurrence-detail.ts`, `bee-pane.ts`, `bee-pane.test.ts`, `bee-occurrence-detail.test.ts`, `filter.ts`, `bee-atlas.ts`)
**Pattern extraction date:** 2026-06-22
