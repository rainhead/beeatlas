# Phase 157: Regions Dropdown Obscured by Filter Button — Research

**Researched:** 2026-06-21
**Domain:** CSS stacking contexts, Lit Shadow DOM, cross-component z-index
**Confidence:** HIGH

---

## Summary

This is a focused cross-component stacking bug. The region control (button + dropdown)
lives inside `<bee-map>`'s shadow DOM. In `src/bee-atlas.ts`, the `bee-map` selector
carries `z-index: 0` on a `position: relative` element, which **creates a new stacking
context** whose entire painted output is ordered before any sibling with a higher z-index.
`<bee-pane>` is `position: absolute; z-index: 1` on its `:host`, so it always paints
on top of the whole `bee-map` subtree — including the region dropdown when it extends
downward past the button boundary. Raising the local `z-index: 2` on `.region-control`
inside `<bee-map>` cannot fix this: local z-index values only order elements within the
same stacking context.

The correct fix is to remove `z-index: 0` from the `bee-map` rule in `src/bee-atlas.ts`.
This dissolves `bee-map`'s stacking context, allowing the region dropdown's own
`z-index: 2` (within the browser's default stacking order) to paint above `bee-pane`'s
`z-index: 1`. The loading/error overlays (`.loading-overlay`, `.error-overlay`) live in
`<bee-atlas>`'s shadow DOM at `z-index: 10` as siblings of `.content`, not children of
`bee-map`, so they are unaffected. The Mapbox canvas has no dependency on the outer
element's z-index value.

**Primary recommendation:** Remove `z-index: 0` from the `bee-map` rule in
`src/bee-atlas.ts`. No other file changes are needed. Lock in the fix with a
source-analysis assertion in `bee-atlas.test.ts`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Region dropdown visibility | Frontend shell (`bee-atlas`) | — | The stacking order is determined by `bee-atlas`'s CSS, not `bee-map`'s internal z-index |
| Region menu open/close state | `bee-map` (`@state _regionMenuOpen`) | — | Local UI state; `bee-map` emits `boundary-mode-changed` when selection made; invariant-compliant |
| Boundary mode selection | `bee-atlas` (owner of `_boundaryMode`) | — | State ownership invariant: `bee-map` is pure presenter, emits event, `bee-atlas` updates property |

---

## Standard Stack

No new packages. This is a pure CSS fix in existing Lit components.

---

## Package Legitimacy Audit

N/A — no packages installed.

---

## Architecture Patterns

### The Stacking Context Bug — Full Diagnosis

**CSS stacking context rule (confirmed, [ASSUMED] from spec knowledge — universally documented):**
An element with `position` and any `z-index` value other than `auto` establishes a new
stacking context. Children of that context can only be painted relative to each other —
they cannot "escape" the context to compete with siblings in the parent context.

**Current layout (in `src/bee-atlas.ts` `.content` rule, lines 215–230):**

```
.content          position: relative   (creates stacking context)
  bee-map         position: relative; z-index: 0   ← CREATES OWN STACKING CONTEXT
    (shadow root)
      .region-control   position: absolute; z-index: 2
        .region-menu    position: absolute; top: 100%   ← trapped in bee-map's context
  bee-pane        position: absolute; z-index: 1   ← in .content's context, above all of bee-map
```

Result: `bee-pane` (z-index 1 in `.content` context) paints above the entire `bee-map`
subtree (z-index 0 in `.content` context), regardless of any z-index values set inside
`bee-map`'s shadow DOM.

**Why `z-index: 0` exists on `bee-map`:**
Reading `src/bee-atlas.ts` lines 222–226: the only z-index values in use are `bee-map:
z-index: 0`, `bee-pane` (implicit, stacks after `bee-map` in DOM order for the narrow
layout where there's no z-index on `:host`), and overlay divs at `z-index: 10`. The
`z-index: 0` appears to have been added to ensure `bee-map` does not accidentally paint
above the overlays in the narrow (bottom-pane) layout — but since the overlays
(`.loading-overlay`, `.error-overlay`) are **siblings of `.content`** in `bee-atlas`'s
shadow DOM (not children of `bee-map`), they already form their own stacking context and
are not affected by what `bee-map` does. [ASSUMED — no comment in source attributing
`z-index: 0` to a specific requirement; see Open Questions.]

**Mapbox canvas:** The canvas element lives inside `#map` in `bee-map`'s shadow DOM.
It has no dependency on the host element's z-index in the outer document tree. Mapbox
GL JS places its own internal layers (markers, popups, controls) using z-index values
relative to the canvas container, all of which remain inside `bee-map`'s shadow. Removing
`z-index: 0` from the outer `bee-map` selector does not affect Mapbox canvas stacking.
[ASSUMED from standard browser rendering — Mapbox internals stay within shadow DOM.]

**The GeolocateControl placement note** (from source comment at line 407–409 in
`bee-map.ts`):
> "Place top-left: the default top-right corner is occupied by the custom .region-control
> button (Phase 152 UAT — the control was rendering hidden behind it). top-left is
> otherwise empty."

The Phase 152 concern was Mapbox's own `top-right` control slot overlapping the
`.region-control`. That was solved by placing the GeolocateControl top-left. Removing
`z-index: 0` from `bee-map` in `bee-atlas.ts` does not affect that fix — the
GeolocateControl is a registered Mapbox IControl managed inside `bee-map`'s shadow DOM.

### Fix: One-Line CSS Change

In `src/bee-atlas.ts`, the `bee-map` rule:

```css
/* BEFORE */
bee-map {
  flex-grow: 1;
  position: relative;
  z-index: 0;
}

/* AFTER */
bee-map {
  flex-grow: 1;
  position: relative;
}
```

Removing `z-index: 0` leaves `bee-map` with `position: relative` but no `z-index`
(which defaults to `auto`). An element with `position: relative` and `z-index: auto` does
NOT establish a new stacking context. Its descendants (including the shadow DOM subtree)
participate in the document stacking order normally.

After the fix, when the region menu opens:
- `.region-control` has `position: absolute; z-index: 2` within bee-map's shadow
- `bee-pane` `:host` has `position: absolute; z-index: 1` in `.content`'s stacking context
- Without `bee-map` forming its own stacking context, the shadow-root contents
  participate in `.content`'s stacking order — and z-index 2 (region menu) > z-index 1
  (pane) means the menu paints on top.

**Note on shadow DOM stacking:** The CSS stacking spec applies to the flat tree (the
composed/rendered tree including slotted shadow content). Shadow DOM does not create new
stacking contexts by itself; the stacking context rules apply in the flat tree. Removing
`z-index: 0` from the `bee-map` host element means its shadow subtree's z-indexed
descendants compete in the parent stacking context as expected. [ASSUMED from CSSWG
spec and browser behavior — Shadow DOM section of CSS Stacking spec.]

### Responsive Layout Coverage

**Wide layout (side pane, `max-aspect-ratio: 1` does NOT apply):**
- `.content` is `flex-direction: row`
- `bee-pane` positioned at `top: calc(0.5em + 2.5rem); right: 0.5em`
- Bug: region menu opens down from button at `top: 0.5em; right: 0.5em`, directly into
  pane territory
- Fix: as above. Menu z-index 2 > pane z-index 1 → menu paints above.

**Narrow layout (`@media (max-aspect-ratio: 1)`):**
- `.content` switches to `flex-direction: column`
- `bee-pane` `pane-list` becomes bottom pane: `top: auto; bottom: 0; height: 60%; left: 0; right: 0`
- The region button still lives at top-right of the map; it no longer spatially overlaps
  the bottom pane in this layout even without the fix. However, the fix is still correct
  and harmless for this layout — removing `z-index: 0` doesn't break anything.
- Confirm: in the narrow layout, `bee-pane` has `z-index: 1` on `:host` regardless of
  layout mode; the fix resolves both layouts simultaneously.

### Anti-Patterns to Avoid

- **Local z-index bump inside `bee-map`:** Raising `.region-control` or `.region-menu`
  to z-index 9999 inside the shadow DOM has zero effect as long as `bee-map` forms a
  stacking context in the outer layout. The bug report explicitly identifies this as
  non-viable.
- **Moving region control to `<bee-atlas>`:** This would violate the Mapbox-coupling
  boundary. The control reads `this.boundaryMode`, `this._regionMenuOpen`, and emits
  `boundary-mode-changed` — these are currently private `<bee-map>` state and event
  concerns. Moving them up would require plumbing a new `@state` into `<bee-atlas>`,
  adding a property/event round-trip, and potentially breaking the pure-presenter
  invariant (since `bee-atlas` would need to own the open/close toggle state).
  Unnecessary for a one-line CSS fix.
- **Using Mapbox `addControl` for the region menu:** Mapbox IControls render into the
  map's control containers (`.mapboxgl-ctrl-top-right` etc.) inside the canvas container
  in the shadow DOM — still within `bee-map`'s stacking context. This would not escape
  the bug and would add implementation complexity.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Stacking across shadow DOM | Portal/teleport workarounds | Remove the unnecessary `z-index: 0` that creates the context |

---

## Runtime State Inventory

Not applicable (greenfield CSS fix, no rename/migration).

---

## Environment Availability

Not applicable (no external dependencies — pure CSS change in existing files).

---

## Common Pitfalls

### Pitfall 1: Assuming z-index alone controls paint order without checking stacking contexts

**What goes wrong:** Developer raises `z-index` on the region menu inside `bee-map` to a
very high value; it still paints under `bee-pane`.
**Why it happens:** `bee-map { z-index: 0 }` on a positioned element creates a stacking
context. All z-index values inside that context are local to it — they cannot compete
with z-index values in the parent context.
**How to avoid:** Fix at the level where the stacking context is created (`bee-atlas.ts`),
not where the child is rendered (`bee-map.ts`).

### Pitfall 2: Removing `bee-map`'s `z-index` breaks the loading overlay

**What goes wrong:** After removing `z-index: 0` from `bee-map`, the loading/error
overlays appear under the map.
**Why this doesn't happen here:** The `.loading-overlay` and `.error-overlay` are
siblings of the `<div class="content">` wrapper in `bee-atlas`'s shadow DOM (lines
386–387 in bee-atlas.ts), at `z-index: 10`. They are NOT children of `bee-map`. Removing
`z-index: 0` from `bee-map` does not affect their relative stacking.
**Warning sign:** If the template were restructured so overlays live inside `.content`,
this would become a real concern. Check the template before applying the fix.

### Pitfall 3: Regressing Phase 152 GeolocateControl placement

**What goes wrong:** A future change puts a Mapbox control back in `top-right`, where it
conflicts with `.region-control`.
**Why it happens:** Phase 152 explicitly moved GeolocateControl to `top-left` because of
this overlap. The comment at `bee-map.ts` line 407–409 documents the reason.
**How to avoid:** The comment is the guard. The fix in this phase does not touch
GeolocateControl placement.

### Pitfall 4: Outside-click close handler broken by fix

**What goes wrong:** After fix, clicks on `bee-pane` don't close the open region menu.
**Why this won't happen:** The outside-click handler at `bee-map.ts` line 208–211 uses
`e.composedPath().includes(this)` — `this` is the `bee-map` element itself. Clicks on
`bee-pane` will not include `bee-map` in their composed path, so the menu closes
correctly. This logic is independent of z-index changes.

---

## Code Examples

### The Fix (source-verified)

```typescript
// src/bee-atlas.ts — static styles, bee-map rule
// BEFORE:
bee-map {
  flex-grow: 1;
  position: relative;
  z-index: 0;       // ← REMOVE THIS LINE
}

// AFTER:
bee-map {
  flex-grow: 1;
  position: relative;
}
```

No other code changes needed.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (vitest.config.ts present) |
| Config file | vitest.config.ts |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Regression Test Strategy

The cheapest reliable test is a **source-analysis assertion** (same pattern as
`bee-map.test.ts` and `bee-atlas.test.ts`). No live Mapbox instance needed.

**What to assert:**

1. `bee-atlas.ts` does NOT contain `z-index: 0` in the `bee-map` rule — prevents the
   stacking context from being reintroduced.
2. `bee-map.ts` DOES contain `z-index: 2` on `.region-control` — confirms the local
   z-index that makes the menu win once the outer context is removed.
3. (Optional) `bee-pane.ts` `:host` has `z-index: 1` — locks in the value the fix
   depends on being LOWER than the region control's 2.

These are string-match assertions on source files using `readFileSync`, in the style of
`bee-atlas.test.ts` ARCH tests and `bee-map.test.ts` MAP tests. They run in milliseconds
with no DOM or Mapbox involvement.

**File to add tests to:** `src/tests/bee-atlas.test.ts` (already imports and reads
`bee-atlas.ts`; a new `describe` block for STACK-01 follows the existing ARCH-03 block).

**Alternatively** `src/tests/bee-map.test.ts` for the `bee-map.ts` assertions. Splitting
across both files matches the per-file convention already established.

### Phase Requirements → Test Map

| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| SC-1 | Dropdown visible and clickable in both layouts | source-analysis | `npm test` | Wave 0 (new) |
| SC-2 | Fix addresses cross-component stacking (no z-index:0 on bee-map) | source-analysis | `npm test` | Wave 0 (new) |
| SC-3 | Architecture invariants hold (no new shared state) | existing ARCH tests | `npm test` | Exists |
| SC-4 | Regression test locks in stacking mechanism | source-analysis | `npm test` | Wave 0 (new) |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] New `describe('STACK-01: region dropdown stacking fix', ...)` block in
  `src/tests/bee-atlas.test.ts` — covers SC-1, SC-2, SC-4
- [ ] Assert `bee-map.ts` `.region-control` z-index retained (SC-4 defense-in-depth,
  can go in `src/tests/bee-map.test.ts`)

---

## Open Questions

1. **Why was `z-index: 0` added to `bee-map`?**
   - What we know: No code comment explains it. The value is present in the current source
     (line 225). The overlays that might motivate it live outside `.content`, so they
     don't require it.
   - What's unclear: Whether a now-deleted sibling element once needed `bee-map` to be
     explicitly ordered below it.
   - Recommendation: Remove it; the overlays are not affected (verified by template
     inspection). If something regresses, the test suite will catch it. If the reviewer
     has institutional context, they can add a comment.

---

## State of the Art

Not applicable — pure CSS layout correction, no evolving ecosystem patterns.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Shadow DOM shadow-root contents participate in flat-tree stacking (removing z-index from host allows children to compete in parent context) | Architecture Patterns | Low — universally documented browser behavior; if wrong, fix moves to approach (b) or (c) |
| A2 | Mapbox canvas has no dependency on the outer element's z-index in the outer document | Architecture Patterns | Low — Mapbox internals are fully inside shadow DOM; observable by running the app |
| A3 | `z-index: 0` on `bee-map` was not added for a specific remembered reason | Open Questions | Low — can be confirmed by git blame; worst case is finding the reason is still relevant |

---

## Sources

### Primary (HIGH confidence — source-verified)
- `src/bee-atlas.ts` lines 208–270 — full CSS rule set, z-index assignments, overlay placement, responsive media query
- `src/bee-map.ts` lines 94–210 — `.region-control` CSS, render template, `_onDocumentClick` composedPath handler
- `src/bee-pane.ts` lines 127–137 — `:host { position: absolute; z-index: 1 }`
- `src/bee-map.ts` lines 407–410 — comment documenting Phase 152 GeolocateControl top-left placement reason

### Secondary (MEDIUM confidence)
- CLAUDE.md architecture invariants — pure-presenter rule, state ownership
- `.planning/ROADMAP.md` lines 1349–1382 — Phase 157 goal and success criteria

### Tertiary (LOW confidence — training knowledge, not verified via spec tools)
- CSS stacking context specification: `position` + `z-index != auto` creates stacking context [A1, A3]

---

## Metadata

**Confidence breakdown:**
- Bug diagnosis: HIGH — confirmed by direct source reading
- Recommended fix: HIGH — one-line change with traced impact on all three stacking levels
- Side-effect analysis: MEDIUM — overlays confirmed safe by template inspection; Mapbox canvas assumed safe [A2]
- Test strategy: HIGH — source-analysis pattern established in existing test suite

**Research date:** 2026-06-21
**Valid until:** Until `bee-atlas.ts` CSS structure changes (stable)
