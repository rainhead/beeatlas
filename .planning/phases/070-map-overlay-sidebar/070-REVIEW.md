---
phase: 070-map-overlay-sidebar
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - frontend/src/bee-sidebar.ts
  - frontend/src/bee-atlas.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-04-21
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Phase 70 converts `bee-sidebar` from a flex sibling to an absolutely-positioned overlay. The core approach is sound: `:host` gains `position: absolute` in `bee-sidebar.ts`, and positioning offsets are supplied by the `bee-sidebar {}` rule in `bee-atlas.ts`. Two issues were found:

1. The portrait media query in `bee-atlas.ts` overrides `width` on the absolutely-positioned sidebar but does not reset `right`/`top`/`bottom`, producing an overflow layout bug in portrait orientation.
2. An unnecessary `as any` cast in `_onFilterChanged` suppresses type checking on fields that are already defined in the `FilterChangedEvent` interface.

---

## Warnings

### WR-01: Portrait sidebar overflows container — `right` offset not reset in media query

**File:** `frontend/src/bee-atlas.ts:130-135`

**Issue:** The portrait `@media (max-aspect-ratio: 1)` rule sets `bee-sidebar { width: 100% }` but does not reset `right`, `top`, or `bottom`. Because `:host` is `position: absolute`, the desktop values (`right: 0.5em`, `top: calc(...)`, `bottom: 0.5em`) cascade through unchanged. With `width: 100%` and `right: 0.5em` both active, the sidebar extends 0.5em past the left edge of the `.content` container. Additionally, `flex-grow: 1` on an absolutely-positioned element has no effect and is dead CSS.

**Fix:**
```css
@media (max-aspect-ratio: 1) {
  .content {
    flex-direction: column;
  }
  bee-sidebar {
    width: 100%;
    right: 0;
    top: 0;
    bottom: 0;
    border-left: none;
    border-top: 1px solid var(--border-input);
    /* flex-grow: 1 removed — has no effect on absolutely-positioned elements */
  }
}
```

Exact top offset may need adjustment if the header height differs in portrait — the intent from the desktop rule (`calc(0.5em + 2.5rem + 2.5rem + 0.5em)`) accounts for the header and filter toolbar; confirm whether those are present in portrait before using `top: 0`.

---

### WR-02: Unnecessary `as any` cast suppresses type checking on `FilterChangedEvent` fields

**File:** `frontend/src/bee-atlas.ts:611-612`

**Issue:** `elevMin` and `elevMax` are already declared in `FilterChangedEvent` (defined in `bee-sidebar.ts`, lines 35 and 36). Casting `detail` to `any` to access them defeats TypeScript's type checking — if those fields are renamed or removed from the interface, this code will silently produce `undefined` at runtime instead of a compile error.

```ts
// Current — suppresses type checking:
elevMin: (detail as any).elevMin ?? null,
elevMax: (detail as any).elevMax ?? null,
```

**Fix:**
```ts
// Correct — `detail` is already typed as FilterChangedEvent:
elevMin: detail.elevMin,
elevMax: detail.elevMax,
```

---

## Info

### IN-01: `console.debug` left in production path

**File:** `frontend/src/bee-atlas.ts:266`

**Issue:** `console.debug('SQLite tables ready')` fires on every page load in production. Debug log statements add noise and may leak timing information.

**Fix:** Remove the line, or gate it behind a dev-mode check:
```ts
if (import.meta.env.DEV) console.debug('SQLite tables ready');
```

---

_Reviewed: 2026-04-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
