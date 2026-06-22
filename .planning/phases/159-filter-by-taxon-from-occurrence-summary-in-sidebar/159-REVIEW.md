---
phase: 159-filter-by-taxon-from-occurrence-summary-in-sidebar
reviewed: 2026-06-22T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/bee-occurrence-detail.ts
  - src/bee-pane.ts
  - src/tests/bee-occurrence-detail.test.ts
  - src/tests/bee-pane.test.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: resolved
resolution: "WR-01 + WR-02 fixed in 6c8ffa15 (keyboard activation via _onTaxonKeydown; :focus-visible outline). IN-01 (redundant cast) left as-is — harmless."
---

# Phase 159: Code Review Report

**Reviewed:** 2026-06-22
**Depth:** standard
**Files Reviewed:** 4
**Status:** resolved (both warnings fixed in commit 6c8ffa15; see resolution note)

## Summary

Phase 159 adds a click-to-filter affordance on taxon names in the sidebar occurrence list. The core logic is correct: `_onTaxonClick` spreads all non-bounds FilterState dimensions faithfully (D-07), emits the right `filter-changed` event shape with `bubbles:true, composed:true` so it reaches `bee-atlas._onFilterChanged`, passes `row.taxon_id!` directly (D-05, no roll-up), and the guard `if (!this.filterState) return` handles the null case. Null/no-determination rows correctly get no filter trigger. Ecdysis link demotion is clean and the external destination remains reachable via the icon anchor. The `as FilterChangedEvent` cast in `_onTaxonClick` is redundant but harmless.

Two issues with the interactive `<span role="button">` pattern require attention before ship.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `<span role="button">` missing keyboard activation handler — filter unreachable via keyboard

**File:** `src/bee-occurrence-detail.ts:247-249, 295, 321, 355-357`
**Issue:** Every `.taxon-filter-link` element has `role="button" tabindex="0"` and a `@click` handler, but no `@keydown` handler. Native `<button>` elements fire a synthetic click on Enter and Space automatically; `<span role="button">` does not. Keyboard-only users who Tab to a taxon name and press Enter or Space will receive no response. This is a ARIA authoring practices violation (APG Button Pattern requires keydown Enter/Space → click dispatch).

**Fix:** Add a `@keydown` handler alongside every `@click`, or — simpler and more robust — replace all `<span class="taxon-filter-link" role="button" tabindex="0">` with `<button class="taxon-filter-link" type="button">` and reset button appearance in CSS (`background:none; border:none; padding:0; font:inherit`). The button approach eliminates the need for both `role` and manual keyboard handling.

```typescript
// Option A: add keydown inline (example for _renderCollectorGroup)
html`<span class="taxon-filter-link" role="button" tabindex="0"
  @click=${() => this._onTaxonClick(row.taxon_id!, displayName)}
  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._onTaxonClick(row.taxon_id!, displayName); } }}
>${displayName}</span>`

// Option B (preferred): use a native button
html`<button class="taxon-filter-link" type="button"
  @click=${() => this._onTaxonClick(row.taxon_id!, displayName)}
>${displayName}</button>`
```

### WR-02: `outline: none` on `:focus` suppresses keyboard focus indicator

**File:** `src/bee-occurrence-detail.ts:191-193`
**Issue:** The `:focus` rule sets `outline: none` with no replacement, making these interactive elements invisible to keyboard users even if WR-01 were fixed. The `text-decoration-style: solid` change on hover/focus is too subtle to serve as a focus indicator.

```css
/* current — removes all focus visibility */
.taxon-filter-link:hover,
.taxon-filter-link:focus {
  text-decoration-style: solid;
  outline: none;
}
```

**Fix:** Either remove `outline: none` entirely (accept the browser default), or use `:focus-visible` to suppress the outline only for pointer interactions while preserving it for keyboard:

```css
.taxon-filter-link:hover {
  text-decoration-style: solid;
}
.taxon-filter-link:focus-visible {
  text-decoration-style: solid;
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
```

## Info

### IN-01: Redundant `as FilterChangedEvent` cast in `_onTaxonClick`

**File:** `src/bee-occurrence-detail.ts:214`
**Issue:** The `detail` object literal is already checked against `FilterChangedEvent` by the `CustomEvent<FilterChangedEvent>` generic; the `as FilterChangedEvent` suffix is a redundant type assertion that adds no safety and could suppress a future type error if `FilterChangedEvent` gains a field not present in the literal.

**Fix:** Remove the cast:

```typescript
// before
} as FilterChangedEvent,

// after
},
```

---

_Reviewed: 2026-06-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
