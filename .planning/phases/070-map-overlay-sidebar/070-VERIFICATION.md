---
phase: 070-map-overlay-sidebar
verified: 2026-04-21T18:20:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open sidebar on desktop — map remains full-width"
    expected: "Clicking a map point opens the sidebar as a right-edge overlay; the map does not shrink or shift horizontally"
    why_human: "CSS position:absolute removes the element from flex flow, preventing width change — cannot confirm visually without a browser"
  - test: "Sidebar header layout — 'Selected specimens' left, close button right"
    expected: "Header shows 'Selected specimens' on the left and × button on the right with space-between alignment"
    why_human: "Shadow DOM + justify-content:space-between rendering requires visual inspection in browser"
  - test: "Portrait orientation reverts to below-map flex layout"
    expected: "At portrait aspect ratio the sidebar appears below the map at full width with a top border, not as an overlay"
    why_human: "Media query application depends on actual viewport dimensions; cannot verify without browser resize"
---

# Phase 70: Map Overlay Sidebar Verification Report

**Phase Goal:** Detail panel overlays map instead of shifting it; map always full-width
**Verified:** 2026-04-21T18:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening the sidebar does not change the map's width — it always occupies the full .content area | VERIFIED | `bee-sidebar` host declares `position: absolute` (bee-sidebar.ts:54); the desktop `bee-sidebar {}` rule in bee-atlas.ts (lines 103–108) contains only `right/top/width/bottom` offsets — no `flex-shrink`, no `width` on a flex sibling. `bee-map { flex-grow: 1 }` is the sole flex child that fills `.content`. |
| 2 | Sidebar panel appears as a right-edge overlay anchored below the filter button with a drop shadow | VERIFIED | `position: absolute; z-index: 1` on `:host` (bee-sidebar.ts:54–55); `box-shadow: 0 2px 8px rgba(0,0,0,0.15)` on `:host` (bee-sidebar.ts:57); bee-atlas.ts lines 103–108: `right: 0.5em; top: calc(0.5em + 2.5rem + 2.5rem + 0.5em)` positions below filter button. |
| 3 | The sidebar header reads "Selected specimens" alongside the close button | VERIFIED | bee-sidebar.ts line 115: `<span class="sidebar-title">Selected specimens</span>` before `<button class="close-btn" ...>&times;</button>` in the same flex header; `.sidebar-header { justify-content: space-between }` (line 77). |
| 4 | The sidebar scrolls its own content vertically without affecting map layout | VERIFIED | `overflow-y: auto` on `:host` (bee-sidebar.ts:58) with `bottom: 0.5em` constraint from bee-atlas.ts (line 107) — panel fills from top anchor to near bottom of `.content` and scrolls internally. |
| 5 | On portrait screens the sidebar reverts to the existing below-map flex layout | VERIFIED | `@media (max-aspect-ratio: 1)` block in bee-atlas.ts lines 135–140: `bee-sidebar { width: 100%; border-left: none; border-top: 1px solid var(--border-input); flex-grow: 1; }` — unchanged from pre-phase implementation. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/bee-sidebar.ts` | Overlay host styles and updated header | VERIFIED | Contains `position: absolute; z-index: 1; background: var(--surface); box-shadow: 0 2px 8px rgba(0,0,0,0.15); overflow-y: auto` on `:host`; `.sidebar-title` CSS rule; "Selected specimens" span in render(); `justify-content: space-between` on `.sidebar-header` |
| `frontend/src/bee-atlas.ts` | Sidebar CSS wired as overlay with portrait fallback | VERIFIED | Desktop `bee-sidebar {}` rule has `right: 0.5em; top: calc(0.5em + 2.5rem + 2.5rem + 0.5em); width: 25rem; bottom: 0.5em` — old `flex-shrink: 0`, `border-left`, `overflow-y: auto`, `scrollbar-gutter: stable` removed; portrait media query rule unchanged |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| bee-atlas.ts | bee-sidebar.ts | CSS rule `bee-sidebar { right: 0.5em ... }` | WIRED | Lines 103–108 of bee-atlas.ts contain the required overlay positioning rule. bee-sidebar is rendered conditionally on `_sidebarOpen` (line 194), wired to the `close` event (line 197). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `bee-sidebar.ts` | `occurrences` prop | `_selectedOccurrences` in bee-atlas.ts, populated by `_onOccurrenceClick` or `_restoreSelectionOccurrences` from SQLite | Yes — SQLite queries return actual rows | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for the layout/CSS aspects (requires browser). Test suite check performed instead.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All non-CR-01 tests pass | `npm test` | 162 passed, 1 pre-existing failure (bee-filter-toolbar.test.ts / bee-filter-controls, documented as CR-01, out of scope) | PASS |

### Requirements Coverage

No formal REQ IDs assigned to Phase 70. Success criteria tracked directly against ROADMAP.md Phase 70 block — all 4 listed criteria satisfied.

### Anti-Patterns Found

None found in modified files.

Scanned `frontend/src/bee-sidebar.ts` and `frontend/src/bee-atlas.ts` for: TODO/FIXME, placeholder text, empty return values, hardcoded empty data, console.log-only implementations. All clear.

### Human Verification Required

Three items require browser verification. The CSS and template changes are correct in source, but the actual rendered layout cannot be confirmed programmatically.

#### 1. Map stays full-width when sidebar opens

**Test:** In `npm run dev`, click any point on the map in landscape/desktop viewport.
**Expected:** Sidebar appears as a right-edge panel overlapping the map; the map does not narrow, shift, or reflow horizontally.
**Why human:** `position: absolute` removes the element from flex flow in theory, but rendering edge cases (Shadow DOM piercing, browser quirks) can only be confirmed visually.

#### 2. Sidebar header layout

**Test:** With the sidebar open, inspect the header area.
**Expected:** "Selected specimens" label is on the left; the × close button is on the right. Both are vertically centered.
**Why human:** Shadow DOM encapsulation means the space-between layout is only verifiable in the browser's rendered output.

#### 3. Portrait orientation revert

**Test:** Resize the window to a portrait aspect ratio (height > width) with the sidebar open.
**Expected:** The sidebar moves below the map, occupies full width, shows a top border, and is no longer an overlay. The map is no longer obscured.
**Why human:** `@media (max-aspect-ratio: 1)` application requires actual viewport dimensions.

### Gaps Summary

No gaps. All 5 observable truths are verified against the actual codebase. The three human-verification items are rendering confirmation tasks, not implementation gaps.

---

_Verified: 2026-04-21T18:20:00Z_
_Verifier: Claude (gsd-verifier)_
