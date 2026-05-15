# Phase 93: Multi-Color SVG Map Generation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 93-multi-color-svg-map-generation
**Areas discussed:** Color assignment, SVG legend

---

## Color Assignment

| Option | Description | Selected |
|--------|-------------|----------|
| Sorted rank → even hues | Sort species alphabetically within group, assign hues evenly spaced across HSL 360° (i * 360 / n). Best legibility for large genera, no new deps. Colors shift only when species are added to a group. | ✓ |
| Hash name → hue | Hash each species canonical_name to a hue. Globally stable across all group map types. Poor hue spread for large groups (clustering). | |
| colorcet Glasbey palette | Pre-generated max-perceptual-distance palette. Best colorblind support. Requires new colorcet dependency. | |

**User's choice:** Sorted rank → even hues
**Notes:** Selected the recommended option. Advisory research confirmed that groups like Andrena (~72 species) and Lasioglossum (~55) need guaranteed hue spread that hash-based assignment cannot provide. Color stability risk (shifts on species additions) accepted as low-probability given infrequent WA checklist additions.

---

## SVG Legend

| Option | Description | Selected |
|--------|-------------|----------|
| No legend in SVG | Phase 94 HTML genus page already lists species per GEN-01. Color swatches go in HTML, not SVG. Maps stay clean at 600×320px. | ✓ |
| Embedded legend in SVG | Render colored rect swatches + species name text inside each SVG. Self-contained but crowded for large genera. | |
| Hybrid tooltip approach | SVG `<title>` tooltips + HTML swatches. Requires `<object>` embed, inconsistent browser behavior. | |

**User's choice:** No legend in SVG
**Notes:** Selected the recommended option. Advisory research confirmed that embedding a legend for 50-72 species in a 600×320px SVG would be unreadable. Phase 94's species list per GEN-01 is the natural home for the legend. Coordination constraint noted: Phase 94 Eleventy template must sort species by canonical_name (same key as color assignment) so HTML swatches match SVG colors.

---

## Claude's Discretion

- **Output directory layout** (not discussed — user skipped): Decided autonomously to use `species-maps/genus/`, `species-maps/subgenus/<Genus>/`, `species-maps/tribe/` under the existing `ASSETS_DIR/species-maps/` directory. Consistent with current D-04 wipe-and-rewrite scope.
- **Color rendering approach**: Per-species `<g fill="{hex}">` group or per-element fill attribute — overrides shared `.occ` CSS class. Single-CSS-class constraint from per-species maps doesn't apply here.
- **Subgenus path format**: `subgenus/<Genus>/<Subgenus>.svg` using parent genus as a directory (mirrors per-species slug pattern).
- **Zero-occurrence species**: Skip in group maps, consistent with per-species behavior.

## Deferred Ideas

None.
