---
phase: 157
slug: regions-dropdown-obscured-by-filter-button
created: 2026-06-21
status: complete
supersedes: prior research pass (recommended deleting `bee-map { z-index: 0 }` — WRONG, see §2)
---

# Phase 157 Research — Regions dropdown obscured by filter button

## TL;DR — Recommended Approach

The fix has **two coordinated parts**, both required (operator chose the robust scope):

- **Part A (layout):** Lay the collapsed filter button out *beside* (to the left of) the regions button instead of stacked directly below it.
- **Part B (stacking):** Guarantee the regions dropdown paints **above** `<bee-pane>` in **all** pane states — *without* removing `bee-map`'s load-bearing `z-index: 0`.

**Recommended mechanism: relocate the region control out of `<bee-map>` into `<bee-atlas>`,** so the region control and `<bee-pane>` become siblings inside `.content`. `<bee-atlas>` then orders the region control above `<bee-pane>` (a higher sibling `z-index`) and lays the collapsed filter button beside it — solving Part A and Part B with one structural change. `<bee-map>` keeps `z-index: 0`, so native Mapbox controls (esp. bottom-right attribution over the table pane) stay contained.

This is cleaner than it sounds because the region control barely depends on map internals (see §3).

---

## 1. Root cause (confirmed)

- The region control (button + dropdown menu) lives in `<bee-map>`'s shadow DOM: `src/bee-map.ts` — `.region-control { position: absolute; top: 0.5em; right: 0.5em; z-index: 2 }`, `.region-menu { position: absolute; top: 100%; right: 0 }` (opens downward).
- `<bee-map>` is `position: relative; z-index: 0` in `.content` (`src/bee-atlas.ts:225`) → it forms a **stacking context capped at z-index 0** relative to its siblings. Nothing inside `<bee-map>` (whatever its local z-index) can paint above a sibling with a higher z-index.
- `<bee-pane>` is `:host { position: absolute; z-index: 1 }` (`src/bee-pane.ts:129`), positioned by `<bee-atlas>` at `top: calc(0.5em + 2.5rem); right: 0.5em` — i.e. its collapsed toggle button sits **directly below** the region button, on the same right edge.
- Result: the region menu opens downward into the pane's territory and is painted **beneath** `<bee-pane>` (z-index 1 > the whole `<bee-map>` subtree at z-index 0). The collapsed filter (toggle) button is the visible obstruction in the reported case.

## 2. Why the obvious "one-line" fix is WRONG

Deleting `bee-map { z-index: 0 }` dissolves the stacking context and *would* let the region menu rise above the pane — but `z-index: 0` is **load-bearing**:

- It was added deliberately in commit `014c6d15` (Phase 108-02). Commit message: *"bee-atlas: position:relative + z-index:0 on bee-map so Mapbox controls can't bleed above bee-pane's z-index:1 stacking context."*
- The only native Mapbox control added is the `GeolocateControl` at `top-left` (`src/bee-map.ts:410`), plus Mapbox's **default attribution/logo** control at **bottom-right**. The bottom-right attribution spatially overlaps `<bee-pane>`'s **table mode** (`.content.pane-table bee-pane { bottom: 0; left: 0; right: 0; height: 60% }`).
- Removing `bee-map`'s containing z-index would let that attribution (and any future native control) paint over the table pane — reintroducing the exact regression Phase 108 fixed. ToS also requires attribution remain visible, but it must not bleed over app chrome.

**Constraint for any fix: `bee-map { z-index: 0 }` must be retained.** This is asserted as a regression guard (see Validation Architecture below).

## 3. Why relocating the region control is low-cost

The region control depends on almost nothing inside `<bee-map>`:

- Its menu renders **4 fixed options** (Off / Counties / Ecoregions / Places), driven only by `boundaryMode`. It does **not** read `ecoregionOptions` (those drive map *layers*, not this menu).
- `<bee-atlas>` **already owns** `_boundaryMode` (`@state`, `src/bee-atlas.ts:100`) and passes it down. The button's only upward signal is the `boundary-mode-changed` event (`src/bee-map.ts:317`), handled by `_onBoundaryModeChanged` (`src/bee-atlas.ts:1534`, which just sets `this._boundaryMode = newMode`).
- Map **click-based** boundary selection is a *separate* path (`map-click-region` → `_onRegionClick`, and the ecoregion-fill click interaction). That stays in `<bee-map>` — it is genuinely map-coupled. Only the **button/menu UI** moves.

### What moves into `<bee-atlas>`
- Markup: the `.region-control` div → `.region-btn` button (icon + dynamic label from `_boundaryMode`) and the conditional `.region-menu` with its 4 option buttons.
- State: `_regionMenuOpen` (`@state`) and `_toggleRegionMenu()`.
- Selection: replace `_selectBoundary(mode)` → on click, set `this._boundaryMode = mode` directly and close the menu (no event needed — same component now). This must reuse the existing `_onBoundaryModeChanged` side effects (URL sync, layer update); see §6.
- Outside-click close: the `_onDocumentClick` handler (uses `composedPath()`), now checking against the region control element in `<bee-atlas>`'s shadow root.
- CSS: `.region-control` / `.region-btn` / `.region-menu` rules → `<bee-atlas>` styles, with `.region-control` given a `z-index` **above** `bee-pane` (e.g. `z-index: 2` in `.content`, since `bee-pane` is `z-index: 1` and `bee-map` is `z-index: 0`).

### What is removed from `<bee-map>`
- The `.region-control` markup + CSS, `_regionMenuOpen`, `_toggleRegionMenu`, `_selectBoundary`, the `boundary-mode-changed` emit, and the document-click listener wiring **for the menu** (keep any map-click listeners). `boundaryMode` stays as an `@property` input (map layers still need it).

### Invariant check
This *strengthens* the architecture invariants: the region control becomes a pure presenter inside the state-owner (`<bee-atlas>`), `<bee-map>` sheds UI it didn't need to own, and no module-level mutable state is introduced. The `ARCH-03` sibling-isolation tests (`src/tests/bee-atlas.test.ts:106`) remain valid (`<bee-map>` still must not import siblings).

## 4. Part A — filter button beside regions button

Once the region control is a sibling in `.content` (top-right, `z-index: 2`), lay out the collapsed pane beside it rather than below:

- The region button stays at `top: 0.5em; right: 0.5em`.
- Change the **collapsed** `<bee-pane>` rule so the toggle button sits to the **left** of the region button at the same `top` — e.g. `top: 0.5em; right: calc(1em + <region-button-width>)`, or place both in a single top-right flex toolbar wrapper and let flow position them. Prefer the toolbar-wrapper approach: a `.map-toolbar` flex row (top-right, `z-index: 2`) containing the region control, with the collapsed pane button adjacent — avoids brittle hard-coded widths.
- **Scope it to collapsed only.** The `.content.pane-list` / `.content.pane-table` override rules (and the `@media (max-aspect-ratio: 1)` narrow rule) must continue to govern the expanded pane geometry unchanged. Verify the new collapsed rule doesn't leak into the list/table selectors.

## Validation Architecture

Established pattern in this repo: **source-analysis assertions** — `readFileSync(resolve(__dirname, '../<file>.ts'))` + `expect(src).toMatch(...)` / `.not.toMatch(...)`, grouped in `describe('CODE-NN: ...')` blocks (see `src/tests/bee-map.test.ts:7`, `src/tests/bee-atlas.test.ts:98`). No live Mapbox instance required. Tests that *mount* `<bee-atlas>` must mock `bee-map.ts` (the mapbox mock is incomplete) — but pure source-analysis tests don't mount anything, so prefer those.

Add a `describe('STACK-01: regions dropdown above pane (Phase 157)', ...)` block in `src/tests/bee-atlas.test.ts` asserting:

1. **Regression guard (Part B safety):** `bee-atlas.ts` source **retains** `bee-map`'s containing z-index — `expect(src).toMatch(/bee-map\s*\{[^}]*z-index:\s*0/)`. This locks out the wrong "just delete it" fix.
2. **Elevation present:** the relocated `.region-control` rule in `bee-atlas.ts` has a `z-index` greater than `bee-pane`'s (assert the rule exists with `z-index: 2` and that `bee-pane` is `z-index: 1`).
3. **Control relocated:** `bee-atlas.ts` now contains the region menu markup (`.region-menu` / region option buttons / `_regionMenuOpen`), and `bee-map.ts` no longer renders `.region-control` (`expect(beeMapSrc).not.toMatch(/region-control/)` / `not.toMatch(/_regionMenuOpen/)`).
4. **Part A layout:** the collapsed filter button is positioned beside (not stacked below) the regions button — assert the new collapsed-pane / toolbar rule exists and the old `top: calc(0.5em + 2.5rem)` stacking offset for the collapsed state is gone.

Keep existing `<bee-pane>` render tests green (they don't own the region control). Update any `bee-map.test.ts` assertion that references the moved region markup to reflect the relocation.

### Responsive / manual coverage (UAT)
Source tests can't prove pixels. Add a short human-UAT checklist (blocking checkpoint) covering, in **both** wide (side pane) and narrow (`max-aspect-ratio: 1`, bottom pane) layouts:
- Collapsed map: open Regions → all 4 options fully visible/clickable, filter button beside (not under) the menu.
- List mode expanded: open Regions → menu fully above the list column.
- Table mode expanded: open Regions → menu fully above the table; Mapbox attribution still visible at bottom-right and **not** bleeding over the table pane (Phase 108 regression guard).

## 6. Open questions / notes for the planner

- **Consolidate the selection side effects.** `_onBoundaryModeChanged` may do more than set `_boundaryMode` (URL sync via `ui.boundaryMode`, layer visibility). When the menu moves in-component, route its selection through the same logic (call the existing handler or factor a shared method) so nothing regresses.
- **Single plan, single wave** is appropriate (one structural refactor + tests + UAT). The relocation touches `bee-atlas.ts`, `bee-map.ts`, and the test files together — keep it atomic so the app never has the control in neither/both places.
- Confirm the region button's dynamic label (`Regions`/`Counties`/`Ecoregions`/`Places`) still derives from `_boundaryMode` after the move.

## RESEARCH COMPLETE
