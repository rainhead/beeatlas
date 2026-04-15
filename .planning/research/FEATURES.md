# Feature Research: Elevation Display and Range Filtering

**Domain:** Elevation annotation in a field biology / nature observation web map (bee atlas)
**Researched:** 2026-04-15
**Confidence:** MEDIUM-HIGH (multiple authoritative sources; specific UX precedents from production apps verified)

---

## Table Stakes

Features that users of field biology observation tools expect. Absence feels like missing or broken data.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Elevation displayed in sidebar detail panels | Museum databases, iNaturalist, GBIF all surface elevation per record; collectors expect to see the full location context of a specimen or sample | LOW | Single `elevation_m` INT16 field; render as "1 234 m" with absent-state fallback (dash or omit row) |
| Meters as the display unit | Darwin Core standard uses meters; GBIF stores as meters; scientific community baseline | LOW | No unit conversion needed for WA state bees; feet would be out of place in this context |
| Elevation range filter with min and max bounds | GBIF and MCZbase both expose elevation as a filterable range; collectors targeting high-elevation populations need this | MEDIUM | Two numeric text inputs; integrates with existing DuckDB `WHERE elevation_m >= ? AND elevation_m <= ?` pattern |
| URL encoding of elevation filter state | All other filters are URL-encoded in this app; elevation must follow suit for shareable links | LOW | Follows existing `buildParams`/`parseParams` pattern in `url-state.ts` |
| Clear filters resets elevation range | Existing "clear filters" resets all active filter state; elevation must be included | LOW | Same pattern as county/ecoregion clear logic |
| Absent/null elevation gracefully handled | DEM sampling may yield null for offshore or edge points; pipeline uses INT16 nullable | LOW | Null elevation_m: omit row in sidebar, exclude from filter predicate (or treat null as "unknown", not zero) |

---

## Differentiators

Features that provide value beyond what field biology apps standardly offer; not expected, but appreciated by power users.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Elevation in table view column | Consistent with other numeric attributes; enables sorting and visual scanning by elevation | LOW | `bee-table` component; add `elevation_m` column to specimen and sample column sets |
| Elevation in CSV export | Research use; collectors analyzing elevation distribution of findings | LOW | Already exported if present in DuckDB SELECT; schema gate ensures column presence |
| Display elevation to nearest 10 m | Honest about DEM precision; GPS-derived elevations have ±10–50 m real-world accuracy; rounding avoids false precision | LOW | `Math.round(elevation_m / 10) * 10` for display; store raw INT16 in parquet for filter arithmetic |

---

## Anti-Features

Features commonly requested in nature observation tools that cause more harm than benefit here.

| Feature | Why Requested | Why to Avoid | What to Do Instead |
|---------|---------------|---------------|--------------------|
| Feet / meters toggle | US users may prefer feet | BeeAtlas targets field collectors and researchers; Darwin Core, GBIF, and entomological databases all use meters; adding a toggle multiplies UI surface for a feature whose scientific audience expects SI units | Use meters throughout; a single parenthetical conversion in a tooltip ("≈ 4 000 ft") is acceptable if user-testing reveals confusion, but do not default to feet |
| Range slider for elevation filter | Sliders are visually intuitive for continuous ranges | WA elevation spans 0–4 392 m (Mt. Rainier); a dual-thumb slider cannot achieve meaningful precision at that scale without either huge pixel width or tiny target zones. NN/G and Baymard research both identify sliders as problematic when the range is very wide or precise values matter. Apache Superset documented this as a known UX defect (issue #15605). | Min/max number inputs; low implementation cost, exact precision, keyboard-accessible, consistent with existing year/month filter input patterns in this codebase |
| Elevation as a map visual encoding (color or size) | Elevation-colored points would surface clustering patterns | Recency-based cluster coloring is the core visual encoding; adding elevation color conflicts with the existing legend and would make the map harder to read for its primary use case (where are records?) | Elevation remains a filter/display attribute, not a visual encoding |
| Fetching live elevation from external API at runtime | Ensures freshness; avoids pipeline complexity | Violates the static-hosting constraint; adds a runtime dependency on an external elevation API; the USGS 3DEP DEM approach already in scope is the correct architecture | Pipeline-sourced DEM elevation stored in parquet is sufficient |
| Displaying elevation uncertainty or range | GPS elevation has ±10–50 m accuracy; honest to show uncertainty | Adds UI complexity; collectors do not need to reason about DEM accuracy; the DEM provides consistent inferred elevation, not GPS-measured | Treat elevation as a derived attribute with implicit ±10 m precision; no uncertainty range needed in the UI |
| Filtering on verbatim (original) elevation | Some specimens have hand-recorded elevation in feet or ambiguous units | BeeAtlas computes elevation_m uniformly from the DEM; there is no verbatim elevation in scope for this milestone | elevation_m is the sole elevation field; verbatim elevation is not in Ecdysis DarwinCore export |

---

## UX Pattern: Elevation Range Filter

**Recommendation: Two labeled number inputs (min/max), not a slider.**

Rationale:
- WA elevation range is 0–4 392 m. A slider spanning this range cannot represent values like "800 m" without pixel-perfect dragging.
- Existing codebase filter patterns use text/number inputs for year and month. Elevation range inputs follow the same pattern.
- NN/G slider guidance states: "Use a slider only when the precise value won't matter to the user." Elevation filtering for targeted collecting trips requires precision.
- Baymard's research confirms numeric inputs alongside sliders improve accuracy; in a toolbar-constrained layout, inputs alone are the correct trade-off.

Input design:
- Two `<input type="number">` fields labeled "Min elev." and "Max elev."
- Placeholder text: "0" and "4 400" (or "any" / "any") to communicate the full WA range.
- Unit suffix "m" adjacent to each input (non-interactive text).
- Either bound optional: min-only or max-only filter is valid SQL (`elevation_m >= ?` or `elevation_m <= ?`).
- Validation: max must be >= min when both are set; invalid state clears or resets the offending field.

---

## UX Pattern: Elevation Display in Sidebar

**Recommendation: Single line in the existing key/value detail layout.**

Format: `1 230 m` (integer, thin-space thousands separator, "m" unit, no decimal places).

Rationale:
- DEM precision is ±10 m or worse; decimal meters convey false precision (GBIF elevation guide recommends rounding to nearest 10 m for honest representation).
- Museum specimen labels use format "1219m" (no space); GBIF displays integer meters. Using a thin space before "m" improves readability at 4-digit values.
- Display rounded to nearest 10 m for UI; raw INT16 stored in parquet for filter arithmetic to avoid rounding artifacts.
- Null elevation_m: omit the elevation row entirely (same absent-state pattern as other nullable sidebar fields). Do not show "0 m" — zero is a valid elevation (sea level) and must not be used as a null sentinel.

---

## Feature Dependencies

```
Pipeline: USGS 3DEP DEM download + elevation sampling
    └──required by──> ecdysis.parquet + samples.parquet: add elevation_m (INT16, nullable)
                          └──required by──> Schema gate: validate-schema.mjs enforces column presence
                          └──required by──> Sidebar: bee-specimen-detail + bee-sample-detail display
                          └──required by──> Filter toolbar: elevation range inputs + DuckDB WHERE clause
                          └──required by──> URL state: elev_min / elev_max params
                          └──required by──> CSV export: elevation_m in downloaded columns
```

Filter integration follows the existing DuckDB WHERE clause pattern in `filter.ts`. No new query architecture needed — elevation range is two optional numeric comparisons appended to the existing WHERE clause builder.

---

## MVP Definition

### Launch with (v2.5)

- Pipeline: DEM download/cache + elevation sampling → `elevation_m` INT16 nullable in both parquet files
- Schema gate: `validate-schema.mjs` enforces `elevation_m` column
- Sidebar: `bee-specimen-detail` and `bee-sample-detail` render elevation with absent-state fallback
- Filter toolbar: min/max number inputs, URL-encoded, DuckDB SQL integration, clear-filters reset

### Add After Validation (v2.5+)

- Table view elevation column (low effort once parquet column exists)
- CSV export already picks up new columns automatically via DuckDB SELECT *

### Out of Scope for This Milestone

- Feet/meters toggle
- Elevation as map visual encoding
- Elevation uncertainty display
- Rounding to nearest 10 m for display (may add; raw integer is acceptable)

---

## Sources

- [GBIF Guide to Elevation Issues](https://discourse.gbif.org/t/a-guide-to-elevation-issues/4375) — precision guidance, GPS inaccuracy, recommendation to round to nearest 10 m
- [Darwin Core Quick Reference: minimumElevationInMeters](https://dwc.tdwg.org/terms/) — standard field definitions, meters as unit
- [Mississippi Entomological Museum Label Guidelines](https://mississippientomologicalmuseum.org.msstate.edu/Specimen_labels/Specimen_labels.html) — "1219m" format, no space, no decimal
- [iNaturalist Community Forum: Altitude on observations](https://forum.inaturalist.org/t/altitude-on-observations/1476) — user expectations, GPS accuracy caveats, searchability requests
- [NN/G Slider Design: Rules of Thumb](https://www.nngroup.com/articles/gui-slider-controls/) — "use slider only when precise value won't matter"
- [Baymard: Improve Form Slider UX](https://baymard.com/blog/slider-interfaces) — numeric inputs alongside or instead of sliders for precision
- [Apache Superset issue #15605](https://github.com/apache/superset/issues/15605) — documented production failure of slider for wide-range numeric filters
- [GBIF Occurrence API](https://techdocs.gbif.org/en/openapi/v1/occurrence) — elevation as decimal in metres, filterable parameter

---
*Feature research for: BeeAtlas v2.5 — DEM Elevation Annotation*
*Researched: 2026-04-15*
