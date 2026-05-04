# Phase 80: Page Scaffolding — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `080-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 080-page-scaffolding
**Areas discussed:** Initial render shape, Card content depth, SVG embedding & empty states, Light-DOM SSR + coordinator scope

---

## Initial Render Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Flat alphabetical list | All ~735 species in one long alphabetical scroll, no headers; `content-visibility: auto` handles perf; Phase 81 layers nav/filters on top | ✓ |
| Grouped by taxonomy with headers | Family > genus headers in document order; section anchors work without JS | |
| Occurrence-bearing species only | Only ~556 species with `occurrence_count > 0` ship; checklist-only species deferred to Phase 81 | |
| Everything but visually collapsed | All 735 in DOM, families collapsed via `<details>` by default; user clicks to expand | |

**User's choice:** Flat alphabetical list of all ~735 species.
**Notes:** User's preview selection confirmed inclusion of all species (occurrence-bearing + checklist-only) sorted alphabetically by `scientificName`. Phase 81 adds the taxon-nav and filter UI as overlays on the same flat DOM.

---

## Card Content Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton — wire data, defer styling | Raw slots: name + first photo + map img + description text; minimal CSS; visual design deferred | ✓ |
| Designed card — full visual fidelity | Full layout: photo carousel, sized/positioned map, designed typography, attribution chrome, link-to-SPA button; requires UI-SPEC pass | |
| Skeleton + minimal layout grid | Skeleton content with basic responsive 2-column grid (photo left, map right, name+description below) | |

**User's choice:** Skeleton — wire data, defer styling.
**Follow-up:** SPA deep-link target — chose `/?taxon=<scientificName>` (reuses existing `src/url-state.ts` URL contract). Alternatives considered: `/?canonical_name=<lowercased>` (rejected — no need for case normalization yet); defer link wiring entirely (rejected — link is part of skeleton scope).

---

## SVG Embedding & Empty States

| Option | Description | Selected |
|--------|-------------|----------|
| `<img src=...>` + skip slot if SVG missing | `<img>` reference with `loading="lazy"`; checklist-only species omit the map slot entirely | ✓ |
| `<img src=...>` + placeholder for missing | `<img>` reference; checklist-only species get a "No occurrences yet" placeholder | |
| Inline SVG via Eleventy include | Inline SVG in HTML; heavier payload but enables future JS interaction; `loading="lazy"` doesn't apply | |
| `<img src=...>` + omit checklist-only cards | Drop checklist-only species from the page — contradicts Area 1 decision | |

**User's choice:** `<img src=...>` + skip slot if SVG missing.

**Follow-up — photo missing state:**

| Option | Description | Selected |
|--------|-------------|----------|
| Skip slot (render nothing) | If no photos in TOML, emit no `<img>` — card heights vary | ✓ |
| Lightweight placeholder | Small grey box with "No photo" text | |
| iNat 'add a photo' link | Link to iNat search inviting volunteer uploads | |

**User's choice:** Skip slot.
**Notes:** Same rule for both photo and map slots — emit nothing when data is absent. Card heights vary by data presence; no placeholder visual consistency.

---

## Light-DOM SSR + Coordinator Scope

**Sub-question 1 — SSR/hydration mechanic:**

| Option | Description | Selected |
|--------|-------------|----------|
| `createRenderRoot` returns `this`; no `render()` override | Card declares `@property` fields and behavior methods only; Eleventy markup is the render output; Lit attaches on upgrade without re-rendering | ✓ |
| `createRenderRoot` returns `this`; `render()` rebuilds from props | Lit re-renders on upgrade; risk of SSR/CSR markup mismatch | |
| Pure markup — no custom-element behavior in Phase 80 | `<bee-species-card>` is plain Nunjucks HTML; Lit class deferred to Phase 81 | |

**User's choice:** `createRenderRoot()` returns `this`; no `render()` override.

**Sub-question 2 — Phase 80 component scope:**

| Option | Description | Selected |
|--------|-------------|----------|
| Card + page coordinator only | Ship `bee-species-page.ts` (skeleton with state property declarations + empty defaults) and `bee-species-card.ts`. Other three components introduced in Phase 81. | ✓ |
| All five components as stubs | Ship `bee-species-page` + `bee-species-card` + `bee-taxon-nav` + `bee-species-grid` + `bee-species-filter` + `seasonality-viz` as minimal stubs | |
| Coordinator + card; defer prop declarations to Phase 81 | Empty coordinator (no state declarations); Phase 81 introduces fields | |

**User's choice:** Card + page coordinator only.
**Notes:** Phase 81 will introduce `bee-taxon-nav`, `bee-species-grid`, `bee-species-filter`, `seasonality-viz` when their interactive UIs are designed. The coordinator declares `_activeTaxonPath`, `_geoFilter`, `_seasonFilter`, URL-state hooks now (empty defaults, no parsing logic) so Phase 81 wires events onto existing fields.

---

## Claude's Discretion

- Exact Nunjucks template structure in `_pages/species.njk` (single loop vs. macro-per-card)
- Precise types for `GeoFilter` / `SeasonFilter` placeholder fields
- Sync-vs-async data loading style in `_data/species.js` and `_data/photos.js`
- Whether the SPA "Open in atlas" link is a plain `<a>` or wrapped in any custom element
- Test layout for `src/tests/arch.test.ts` (readFileSync vs. import-graph analysis)
- Vite chunk-splitting tactics
- Slot vs. direct-child placement for attribution and SPA link
- Description handling in `_data/photos.js` (whitespace trimming, defaulting)

## Deferred Ideas

- Visual design pass for cards (responsive grid, photo carousel, designed typography, attribution chrome, styled link-to-SPA) — Phase 81 or dedicated UI-SPEC pass
- Photo carousel / multiple photos per card — Phase 81
- Empty-state placeholders for missing photo/map — explicitly rejected; revisit if variable card heights cause UX issues
- Inline SVG with interactive county/ecoregion highlighting — Phase 82 if needed
- Description Markdown rendering — defer until at least one description needs bold/italic/links
- Scaffolding the four deferred presenter components as empty stubs in Phase 80 — rejected; Phase 81 introduces them
- Description authoring workflow / preview mode — post-v3.2
