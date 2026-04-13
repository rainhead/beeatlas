# Phase 52: Header Component - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 52-header-component
**Areas discussed:** Header architecture, View toggle icons, Hamburger menu approach

---

## Header architecture

| Option | Description | Selected |
|--------|-------------|----------|
| New `<bee-header>` Lit component | Receives layerMode/viewMode as @property, emits layer-changed/view-changed events | ✓ |
| Inside bee-atlas shadow DOM | Part of bee-atlas render(), no new element | |
| Plain HTML in index.html | Vanilla JS, breaks Lit pattern | |

**User's choice:** New `<bee-header>` Lit component

| Option | Description | Selected |
|--------|-------------|----------|
| Props only; hamburger state internal | layerMode/viewMode from bee-atlas; open/close is local @state | ✓ |
| All external — bee-atlas owns everything | Even hamburger state lifted to bee-atlas | |

**User's choice:** Props only for layer/view mode; hamburger open/close is internal state

---

## View toggle icons

| Option | Description | Selected |
|--------|-------------|----------|
| Inline SVG — heroicons or similar | Hand-pick 2 SVG paths, paste inline. Zero dependency | ✓ |
| Unicode characters | e.g. 🗺️ 🗃️ — platform rendering varies | |
| Icon font (CDN) | External dependency, network request | |

**User's choice:** Inline SVG — heroicons or similar

| Option | Description | Selected |
|--------|-------------|----------|
| Two icon buttons, side by side, active highlighted | Map icon \| Table icon — active gets accent color | ✓ |
| Single toggle button that switches icon | One button, switches on click | |

**User's choice:** Two icon buttons, side by side, active one highlighted

---

## Hamburger menu approach

| Option | Description | Selected |
|--------|-------------|----------|
| Native `<details>/<summary>` | Zero JS, browser-native, accessible by default | ✓ |
| Custom button + @state() toggle | More control, needs keyboard/focus handling | |
| Popover API | Modern, accessible, baseline 2024, overkill for simple nav | |

**User's choice:** Native `<details>/<summary>`

| Option | Description | Selected |
|--------|-------------|----------|
| 640px / 40rem | Common mobile breakpoint | ✓ |
| Aspect ratio (match existing) | max-aspect-ratio: 1 used elsewhere in bee-atlas | |
| 768px / 48rem | More conservative tablet breakpoint | |

**User's choice:** 640px / 40rem

---

## Claude's Discretion

- Placeholder tab styling for Species/Plants (user skipped this area) — greyed out, pointer-events: none, no tooltip
- Exact Heroicons paths to use for Map and Table icons

## Deferred Ideas

- Animated hamburger transition — polish phase
- "Coming soon" tooltip on placeholder tabs
