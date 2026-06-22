# Phase 159: Filter by Taxon from Occurrence Summary in Sidebar — Research

**Researched:** 2026-06-22
**Domain:** Lit/TypeScript frontend — event wiring, component property threading
**Confidence:** HIGH — all findings verified by direct source reading

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01/D-02:** Taxon name becomes the filter trigger; external record link demoted to a small icon link following the `📷` / "View on iNaturalist" patterns already in this file.
- **D-03:** All five render paths in `bee-occurrence-detail` receive the name→filter / external→icon treatment: `_renderCollectorGroup`, `_renderInatObs`, `_renderProvisional`, `_renderChecklist`, `_renderSampleOnly`.
- **D-04:** "No determination" rows (and sample-only rows) have no taxon → no filter affordance. The external record icon link, where it exists, still applies.
- **D-05:** Filter at the precise `taxon_id` of the clicked taxon. No roll-up. The existing hierarchical WHERE clause handles any rank automatically.
- **D-06:** `taxonDisplayName` label comes from `row.display_name` or `taxonCache.get(row.taxon_id)?.name`. Filter key is `taxon_id`.
- **D-07:** Clicking a taxon replaces only `taxonId` + `taxonDisplayName` in FilterState; all other dimensions (collector, year, county/ecoregion/place, months, elevation, bounds) are preserved.
- **D-08:** Filter click sets FilterState only; active point-selection is unaffected **beyond what the existing `_onFilterChanged` path already does** (see note in Pitfalls).

### Claude's Discretion

- Exact glyph/markup for the demoted external icon link, hover/focus styling of the now-clickable taxon name, and where the icon sits relative to the name — reuse existing component styles; do not introduce a brand-new UI pattern.

### Deferred Ideas (OUT OF SCOPE)

- Click-to-filter in the table/drawer view.
- Roll-up-to-species option.
</user_constraints>

---

## Summary

Phase 159 adds a one-click taxon filter entry point inside `bee-occurrence-detail`. The implementation is a property-threading + markup change: thread `filterState` down from `bee-pane` to `bee-occurrence-detail`, then in each render path convert the taxon name from an `<a href="external">` into a clickable element that dispatches `filter-changed` with `bubbles: true, composed: true`. The external record link moves to a small icon (following `📷` at line 219). No new FilterState fields, no SQL changes, no new event types.

The critical non-obvious finding: `_onFilterChanged` in `bee-atlas` (line 1491-1493) **clears `_selectedOccIds` and `_selectedCluster`** on every filter change. This is existing behavior — it also fires when the user changes the filter panel. Because occurrence-detail is only visible when `_paneState === 'list'`, line 1494 preserves the list view. So after a taxon click from the detail panel: selection is cleared, list query re-runs (now filtered to the taxon), pane stays in 'list' state. This is acceptable UX and consistent with D-08 as scoped ("beyond what the existing path already does").

**Primary recommendation:** Add `filterState: FilterState` property to `bee-occurrence-detail`; thread it from `bee-pane`; dispatch `FilterChangedEvent` directly from click handlers with `bubbles: true, composed: true`. No bee-pane interception needed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Taxon click affordance + event dispatch | bee-occurrence-detail (presenter) | — | The click site is inside this component; pure presenter emits upward |
| FilterState construction (merge) | bee-occurrence-detail | — | Needs filterState prop to merge; can construct full FilterChangedEvent directly |
| FilterState application | bee-atlas (state owner) | — | State invariant: only bee-atlas mutates _filterState |
| Event routing (composed bubbling) | Shadow DOM / platform | — | `composed: true` + `bubbles: true` crosses shadow boundaries automatically |

---

## Standard Stack

No new packages. All work is in existing TypeScript + Lit source files.

| File | Role in this phase |
|------|--------------------|
| `src/bee-occurrence-detail.ts` | Primary change: new `filterState` property, click handlers, markup changes across 5 render paths |
| `src/bee-pane.ts` | Thread `filterState` into `<bee-occurrence-detail>` (one-line template change) |
| `src/filter.ts` | Read-only: `FilterState`, `FilterChangedEvent` interfaces — no changes |
| `src/tests/bee-occurrence-detail.test.ts` | Add new test coverage |

---

## Architecture Patterns

### Event Wiring: bee-occurrence-detail → bee-atlas

The `filter-changed` event is already handled at `bee-atlas.ts:548`:

```typescript
@filter-changed=${this._onFilterChanged}
```

This listener is on `<bee-pane>`. Because `bee-occurrence-detail` is rendered inside `bee-pane`'s shadow DOM, an event dispatched with `{ bubbles: true, composed: true }` from `bee-occurrence-detail` will:
1. Bubble through `bee-occurrence-detail`'s shadow DOM
2. Cross the shadow boundary into `bee-pane`'s shadow DOM (via `composed: true`)
3. Continue bubbling to `bee-atlas`'s template where the `@filter-changed` listener sits

No interception in `bee-pane` is needed. The event passes through transparently.

### How to Build the FilterChangedEvent Payload (D-07)

`FilterChangedEvent` (`filter.ts:388-400`) carries all filter dimensions EXCEPT `bounds`. The `_onFilterChanged` handler in `bee-atlas` (line 1478-1479) explicitly preserves `this._filterState.bounds`:

```typescript
// bee-atlas.ts line 1478-1479
bounds: this._filterState.bounds,  // D-05: FilterChangedEvent carries no bounds — preserve active bounds explicitly
```

So `bee-occurrence-detail` should dispatch:

```typescript
private _onTaxonClick(row: OccurrenceRow, displayName: string) {
  if (row.taxon_id == null || !this.filterState) return;
  this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
    bubbles: true,
    composed: true,
    detail: {
      taxonId: row.taxon_id,
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
    },
  }));
}
```

Note: `months` and `selectedCounties`/`selectedEcoregions`/`selectedCollectors` are `Set` / array references from the existing filterState. Passing them by reference is safe — `_onFilterChanged` in bee-atlas replaces the whole `_filterState` object, it does not mutate the sets.

### New Property Threading

`bee-pane.ts` line 1232 (the only place `<bee-occurrence-detail>` is rendered):

```typescript
// BEFORE:
html`<bee-occurrence-detail .occurrences=${this.listRows} .taxonCache=${this.taxonCache}></bee-occurrence-detail>`

// AFTER:
html`<bee-occurrence-detail .occurrences=${this.listRows} .taxonCache=${this.taxonCache} .filterState=${this.filterState}></bee-occurrence-detail>`
```

`bee-pane` already has `filterState` as a `@property` (line 58). No additional threading from `bee-atlas` is needed.

### Markup Pattern per Render Path

Reference pattern (existing `📷` icon at `bee-occurrence-detail.ts:219`):
```typescript
· <a href="https://www.inaturalist.org/observations/${row.specimen_observation_id}" target="_blank" rel="noopener" aria-label="View photo on iNaturalist">📷</a>
```

---

## Per-Render-Path Analysis

### 1. `_renderCollectorGroup` (lines 204-226) — Ecdysis specimens

**Taxon source:** `taxonCache.get(row.taxon_id)?.name` → local variable `displayName` (line 211).

**`taxon_id` availability:** `row.taxon_id` is available on every row in the group. Can be `null` for undetermined specimens.

**Current external link (line 214):** `<a href="https://ecdysis.org/...?occid=${row.ecdysis_id}">` wraps both the taxon name AND the no-determination fallback.

**Required change:**
- If `displayName` is set AND `row.taxon_id != null`: render taxon name as clickable button/span (filter trigger) + Ecdysis icon link
- If no taxon (`displayName` is null / `taxon_id` is null): render `<span class="no-determination">No determination</span>` (no filter affordance) + Ecdysis icon link

**No determination branch:** The existing `<a href="ecdysis...">No determination</a>` must split: the text becomes a plain `<span>` (no filter), and the Ecdysis link moves to an icon.

**Display name for chip (D-06):** `displayName` from taxonCache. `row.display_name` is also available (JOIN-resolved). Use either — both come from the same taxa table. For consistency with `_renderInatObs` and `_renderProvisional`, prefer `row.display_name` when set, with `taxonCache.get(row.taxon_id)?.name` as fallback.

### 2. `_renderSampleOnly` (lines 237-254) — WABA sample awaiting identification

**Taxon:** None. `taxon_id` is null for sample-only rows (identification pending). The text "identification pending" is already plain (not in an `<a>`).

**Current external link (line 249):** `<a href="https://www.inaturalist.org/observations/${row.observation_id}">View on iNaturalist</a>` — this is NOT a taxon link; it links to the sample's iNat observation.

**Required change per D-03/D-04:** No taxon filter affordance (no taxon to filter on). The "View on iNaturalist" link is already an icon-style link (not wrapping a taxon name) — it stays as-is. **No markup change needed in this path.** D-04 confirms: sample-only rows with no taxon get no filter affordance.

### 3. `_renderProvisional` (lines 256-275) — WABA specimen with iNat ID but not yet in Ecdysis

**Taxon source:** `row.display_name` (line 257). `row.taxon_id` is available (JOIN from taxa table).

**Current external link (line 269-271):** `<a href="https://www.inaturalist.org/observations/${row.specimen_observation_id}">View WABA observation</a>` — this links the WABA observation, NOT the taxon. The taxon is currently displayed as `<em>${row.display_name}</em>` wrapped in `<div class="inat-id-label">`, with no external link on the taxon name itself.

**Wait — re-read the current code:** The taxon name in `_renderProvisional` is NOT currently in an `<a>` tag. Line 257-259 renders `taxonEl` as `html\`<em>${row.display_name}</em>\`` or a hint span. The external link is separately below (line 268-272).

**Required change per D-03:** Add filter affordance to the taxon name (when `row.display_name` and `row.taxon_id` are set). The "View WABA observation" link is already an icon-style text link — it may stay as-is, or get a glyph icon per D-02. Since it's not a taxon name link, D-02 doesn't strictly require demoting it, but the spirit of D-02 is "external destination stays reachable via an icon". The current "View WABA observation" text link is already small and clearly labeled as external — discretion applies here.

### 4. `_renderInatObs` (lines 277-306) — iNat observations

**Taxon source:** `taxonCache.get(row.taxon_id)?.name` → local `inatDisplayName` (line 280). `row.taxon_id` is available.

**Current state:** `taxonEl` (line 281-283) is `html\`<em>${inatDisplayName}</em>\`` or hint span. It is NOT currently in an external `<a>`. The external link is below at line 299-302: `<a href="${row.obs_url}">View on iNaturalist</a>`.

**Required change per D-03:** Add filter affordance to the taxon name. The "View on iNaturalist" link below stays (possibly demoted to icon per Claude's discretion). Same structure as `_renderProvisional`.

**No determination branch:** When `inatDisplayName` is null → `html\`<span class="hint">identification unknown</span>\`` (no filter affordance).

### 5. `_renderChecklist` (lines 308-334) — Bartholomew et al. 2024 checklist records

**Taxon source:** `taxonCache.get(row.taxon_id)?.name` → `accepted` (line 310). `row.taxon_id` available. Also has `row.verbatim_name` as the string the author originally used.

**Current state:** `taxonEl` is a compound: `<em>${accepted}</em>` alone, or `<em>${accepted}</em> <span class="hint">(det. as ${verbatim})</span>`, or `<em>${verbatim}</em>` (when accepted is null), or `<span class="hint">No determination</span>`. The full `taxonEl` is rendered in `<div class="inat-id-label">`. No external link on the taxon.

**There is NO external link in `_renderChecklist`** (no Ecdysis link, no iNat link). The `<div class="hint">Bartholomew et al. 2024</div>` is the source attribution, not a link.

**Required change per D-03:** Add filter affordance to the taxon name portion. In the `accepted != null` branches, the `<em>${accepted}</em>` becomes clickable (using `taxon_id`). In the `accepted == null, verbatim != null` branch: `taxon_id` is null (no accepted taxon in our taxa table) → no filter affordance; render verbatim name as plain text per D-04.

**No determination branch (line 319-320):** `taxon_id == null`, `verbatim == null` → plain `<span class="hint">No determination</span>`, unchanged per D-04.

**No external icon to add** for this path — no external record link exists currently. D-02 only requires demoting existing external links; no new external links need to be added.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Shadow DOM event cross-boundary | Custom relay/callback in bee-pane | `composed: true` on CustomEvent — platform handles it |
| Current filter dimension preservation | New state in bee-occurrence-detail | Pass `filterState` prop; spread all dimensions in event detail |
| New event type | `taxon-clicked` custom event + new listener | Reuse `FilterChangedEvent` / `filter-changed` event — `_onFilterChanged` already wired |

---

## Common Pitfalls

### Pitfall 1: Selection Clear on Filter Change (D-08 Qualification)

**What goes wrong:** D-08 says "leaves active point-selection untouched". But `_onFilterChanged` in `bee-atlas.ts` (lines 1491-1493) DOES clear `_selectedOccIds` and `_selectedCluster` on every filter change — including those from the filter panel.

**Why it happens:** This is existing behavior: any filter change clears the selection (the map result set changes so the old selection is no longer meaningful).

**How D-08 applies:** CONTEXT.md scopes D-08 as: "The planner should confirm there is no implicit selection-clear coupled to **this new entry point beyond whatever the filter panel already does**." The existing `_onFilterChanged` handler fires from this new entry point the same as from the filter panel — so the behavior is consistent. D-08 is satisfied as long as the new click does not introduce ADDITIONAL selection-clearing beyond what `_onFilterChanged` already does.

**Action for plan:** Explicitly document this in the plan. No code change needed — existing behavior is correct.

### Pitfall 2: Pane State After Filter From Detail

**What goes wrong:** Fear that emitting `filter-changed` from within the list panel will collapse the pane.

**Why it won't:** `bee-atlas.ts` line 1494: `if (this._paneState !== 'list') this._paneState = 'collapsed'`. Since `bee-occurrence-detail` is only rendered when `_paneState === 'list'`, the condition is false and pane stays in 'list'. Line 1495 then re-runs the list query with the new filter. The updated list (now filtered to the clicked taxon) replaces the content.

**Action for plan:** No special handling; it just works.

### Pitfall 3: `_renderSampleOnly` Taxon Assumption

**What goes wrong:** Applying "all five render paths need name→filter" uniformly to `_renderSampleOnly`.

**Why it's wrong:** `_renderSampleOnly` has no taxon. There is no taxon name in this path — only "identification pending" text. The existing "View on iNaturalist" link is a sample observation link, NOT a taxon link, so D-02 does not require demoting it.

**Action for plan:** `_renderSampleOnly` requires no markup changes (D-04 covers this). Call it out explicitly.

### Pitfall 4: `_renderProvisional` / `_renderInatObs` Have No Current Taxon Link

**What goes wrong:** Assuming all 5 paths need D-02 "demotion" treatment (removing an existing `<a>` wrapping the taxon name).

**Why it's more nuanced:** `_renderProvisional` and `_renderInatObs` do NOT currently wrap the taxon name in an external `<a>`. The external links in those paths are separately placed (below the taxon line, in `.event-inat` divs). So for those two paths, the work is purely ADDITIVE (add click affordance to taxon name) without the demotion step. Only `_renderCollectorGroup` has a true demotion (the `<a href="ecdysis...">` that currently wraps both name and "No determination").

### Pitfall 5: Checklist Verbatim-Only Rows

**What goes wrong:** Making `verbatim_name` clickable as a filter trigger when `accepted` is null.

**Why it's wrong:** When `accepted` (from taxonCache) is null, `taxon_id` is also null — there is no taxa-table entry to filter on. Using `verbatim_name` as a filter key would require a string-based name lookup, which is not how the filter works. D-04 applies: no `taxon_id` → no filter affordance.

**Action for plan:** In `_renderChecklist`, only the `accepted != null` branches (where `taxon_id` is set) get the filter affordance. Verbatim-only rows render as plain text.

### Pitfall 6: `taxon_id` vs `display_name` for the Chip Label

**What goes wrong:** Using `row.display_name` as `taxonDisplayName` everywhere, but `_renderCollectorGroup` uses `taxonCache.get(row.taxon_id)?.name` (not `row.display_name`).

**Why it matters:** `row.display_name` is JOIN-resolved from `taxa.name` (same table as `taxonCache`). For specimen rows in `_renderCollectorGroup`, use `taxonCache.get(row.taxon_id)?.name` (already computed as `displayName` at line 211). For other paths, `row.display_name` is correct. Both produce the same string (both come from `taxa.name`), so consistency is cosmetic.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vite.config.ts` (`test` section, `environment: 'happy-dom'`) |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test` |

### Existing Test Pattern

All existing tests in `bee-pane.test.ts` and `bee-occurrence-detail.test.ts` use **source-text pattern matching** (reading the `.ts` file with `readFileSync` and asserting on regex matches). They do NOT do DOM mounting (no `document.createElement`, no `shadowRoot` queries).

This is intentional — the bee-atlas test that does mount `<bee-atlas>` requires mocking mapbox-gl, sqlite.ts, and features.ts (see `bee-atlas.test.ts` lines 11-71).

**Recommended test approach for this phase:** Source-text assertions in `src/tests/bee-occurrence-detail.test.ts`, following the exact pattern of `bee-pane.test.ts:186-222`.

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-01/D-02 | Taxon name dispatches `filter-changed`; external link demoted to icon | source-text | `npm test` | `bee-occurrence-detail.test.ts` exists but covers only `formatRomanDate` — needs expansion |
| D-03 | All 5 render paths handled | source-text | `npm test` | same file |
| D-04 | No filter affordance when taxon_id is null | source-text | `npm test` | same file |
| D-07 | FilterChangedEvent detail preserves non-taxon dimensions | source-text | `npm test` | same file |
| D-08 | Existing selection-clear behavior unchanged | no new test — existing behavior | — | — |

### Wave 0 Gaps

New test cases to add to `src/tests/bee-occurrence-detail.test.ts`:

```typescript
// Read the source file (same pattern as bee-pane.test.ts)
const src = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');

test('bee-occurrence-detail.ts declares filterState property', () => {
  expect(src).toMatch(/@property[^)]*\)\s+filterState/);
});

test('bee-occurrence-detail.ts dispatches filter-changed event', () => {
  expect(src).toMatch(/new CustomEvent[^)]*['"]filter-changed['"]/);
});

test('filter-changed event uses bubbles:true, composed:true', () => {
  expect(src).toMatch(/bubbles:\s*true/);
  expect(src).toMatch(/composed:\s*true/);
});

test('FilterChangedEvent detail carries taxonId from row.taxon_id', () => {
  expect(src).toMatch(/taxonId:\s*row\.taxon_id/);
});

test('FilterChangedEvent detail preserves filterState year/county/collector dimensions', () => {
  expect(src).toMatch(/yearFrom:\s*this\.filterState/);
  expect(src).toMatch(/selectedCounties:\s*this\.filterState/);
  expect(src).toMatch(/selectedCollectors:\s*this\.filterState/);
});

test('ecdysis link is demoted to icon in _renderCollectorGroup', () => {
  // Taxon name is no longer the direct child of the ecdysis <a> href
  const collectorGroupBody = src.match(/_renderCollectorGroup[\s\S]*?\n  private /)?.[0] ?? '';
  expect(collectorGroupBody).not.toMatch(/href="https:\/\/ecdysis.*>\$\{displayName\}/);
});

test('_renderSampleOnly has no filter-changed dispatch (no taxon)', () => {
  const sampleBody = src.match(/_renderSampleOnly[\s\S]*?\n  private /)?.[0] ?? '';
  expect(sampleBody).not.toMatch(/filter-changed/);
});
```

Also add to `bee-pane.test.ts`:

```typescript
test('bee-pane.ts passes filterState to bee-occurrence-detail', () => {
  const body = src.match(/<bee-occurrence-detail[\s\S]*?<\/bee-occurrence-detail>/)?.[0] ?? 
               src.match(/bee-occurrence-detail[^`]*`/)?.[0] ?? '';
  expect(src).toMatch(/\.filterState=\$\{this\.filterState\}.*bee-occurrence-detail|bee-occurrence-detail.*\.filterState=\$\{this\.filterState\}/s);
});
```

---

## Sources

### Primary (HIGH confidence — direct source reading)

- `src/bee-occurrence-detail.ts` — all 5 render paths read in full (lines 204-358)
- `src/filter.ts` — `FilterState` (lines 13-26), `FilterChangedEvent` (lines 388-400), `buildFilterSQL` taxon clause (lines 260-266)
- `src/bee-pane.ts` — `_emitFilter` (lines 611-631), `_selectTaxon` (lines 742-749), `filterState` property (line 58), `<bee-occurrence-detail>` template usage (line 1232)
- `src/bee-atlas.ts` — `@filter-changed` listener (line 548), `_onFilterChanged` handler (lines 1462-1502)
- `src/taxa.ts` — `TaxonCacheEntry` shape (line 27), `buildTaxonLabel` (lines 19-25)
- `src/tests/bee-occurrence-detail.test.ts` — existing test scope (only `formatRomanDate`)
- `src/tests/bee-pane.test.ts` — source-text test pattern
- `src/tests/bee-atlas.test.ts` — mock setup pattern (mapbox-gl, sqlite.ts, features.ts)
- `vite.config.ts` — Vitest config (happy-dom, `npm test` command)
- `git grep -n "FilterChangedEvent|filter-changed|dispatchEvent" src/` — complete event wiring map

---

## Open Questions

None. All decisions are locked in CONTEXT.md and all code paths have been read directly.

---

## Metadata

**Confidence breakdown:**
- Event wiring: HIGH — read `_onFilterChanged`, `_emitFilter`, `@filter-changed` listener directly
- Render path taxon availability: HIGH — read all 5 paths directly
- Test approach: HIGH — existing test files confirm source-text pattern
- Selection-clear behavior: HIGH — read `_onFilterChanged` lines 1491-1493 directly

**Research date:** 2026-06-22
**Valid until:** Until any of the 4 source files above are modified
