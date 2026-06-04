# Phase 133: Browse Tree - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 133-browse-tree
**Areas discussed:** Rendering & expansion mechanism, Surfacing intermediate ranks, Node links

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Rendering & expansion mechanism | Full DOM vs hybrid vs client-side tree | ✓ |
| Surfacing intermediate ranks | How subfamily/tribe/subgenus are revealed | ✓ |
| Node links (page vs map) | What each node links to | ✓ |
| Filter scope & behavior | Match set, common names, count behavior | (not selected — default captured as D-09) |

---

## Rendering & expansion mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Full build-time DOM, JS toggles | Eleventy renders all ~800 nodes; client JS toggles visibility + filters. Matches today's index. | ✓ |
| Hybrid: default depth rendered, deeper built on demand | Render family→genus→species; JS splices deeper ranks from JSON on opt-in. | |
| Pure client-side tree from JSON | JS component fetches data + renders everything; not crawlable. | |

**User's choice:** Full build-time DOM, JS toggles.
**Notes:** ~800 nodes (603 species + 191 higher-rank) is light enough to ship all markup.

### Follow-up: expand/collapse primitive

| Option | Description | Selected |
|--------|-------------|----------|
| Native `<details>/<summary>` | Zero-JS expand/collapse, accessible; JS sets `open` on ancestors for filter. | ✓ |
| Custom JS-driven (role=tree/treeitem) | ARIA tree widget with arrow-key nav; requires JS. | |

**User's choice:** Native `<details>/<summary>` (progressive enhancement).

---

## Surfacing intermediate ranks

| Option | Description | Selected |
|--------|-------------|----------|
| Global rank checkboxes | Per-rank toggles insert that level tree-wide. | |
| Per-node 'group by' affordance | Contextual reveal per branch. | |
| Single 'Show all ranks' toggle | One switch flips whole tree between default and full depth. | ✓ |

**User's choice:** Single "Show all ranks" toggle.

### Follow-up: persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Session-only | Resets to OFF each load (matches today's filter). | |
| URL param | Shareable/bookmarkable view. | |
| localStorage | Remembered per device, not shareable. | ✓ |

**User's choice:** localStorage (toggle state remembered across visits).

---

## Node links

| Option | Description | Selected |
|--------|-------------|----------|
| Name → page, + map affordance | Name links to static taxon page; secondary 🗺 → descendant-filtered map. | ✓ |
| Name → taxon page only | One link; map reached from the page. | |
| Name → filtered map only | /species as a map launcher. | |

**User's choice:** Name → taxon page, plus a 🗺 map affordance.

### Follow-up: family nodes (no static page)

| Option | Description | Selected |
|--------|-------------|----------|
| Name → filtered map, + map affordance | Family name itself links to filtered map. | |
| Plain header + map affordance | Name stays a non-link header; only 🗺 links to map. | ✓ |
| Plain header, no link | No link anywhere (matches old index). | |

**User's choice:** Plain header + 🗺 map affordance (distinguishes no-page ranks).

---

## Claude's Discretion

- Filter scope & behavior (area not selected) — default captured as D-09: match
  scientific names across the displayed rank set, auto-expand ancestors, no
  vernacular matching.
- Tree data shape / hardening the placeholder `tree` builder (D-10).
- Visual chrome, count typography, mobile layout, no-JS wording — deferred to
  UI-SPEC / `/gsd:ui-phase 133` (D-11).
- Counts display format (compact "N · N" vs verbose) — planner discretion (D-08).

## Deferred Ideas

- Filter piercing the rank toggle (matching hidden ranks when toggle OFF) — D-09
  refinement; default respects the toggle.
- Per-node expansion persistence / shareable tree-view URL — not chosen; D-04
  keeps persistence to the toggle only.
