# Phase 93: Multi-Color SVG Map Generation - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `species_maps.py` to generate multi-color SVG occurrence maps for genus, subgenus, and tribe taxon groups. Each species within a group is rendered in a distinct color. Output lives under `public/data/species-maps/` (ASSETS_DIR) in subdirectories: `genus/<Genus>.svg`, `subgenus/<Genus>/<Subgenus>.svg`, `tribe/<Tribe>.svg`. The existing per-species maps in `species-maps/` are unchanged. Data source: `species.parquet` (already has `genus`, `subgenus`, `tribe`, `canonical_name`, `occurrence_count` columns) + `ecdysis_data.occurrences` for lat/lon points.

</domain>

<decisions>
## Implementation Decisions

### Color Assignment
- **D-01:** Sort species alphabetically by `canonical_name` within each group, then assign evenly-spaced HSL hues: `hue = i * 360 / n` (fixed saturation ~70%, lightness ~50%). This guarantees maximum within-group hue spread for any group size (Andrena has ~72 species). Deterministic across runs as long as the species set is stable.
- **D-02:** Coordination constraint for Phase 94: the Eleventy template's displayed species sort order must use the same alphabetical `canonical_name` key so color swatches in the HTML match the SVG point colors.

### SVG Legend
- **D-03:** No legend embedded in the SVG. Phase 94's genus/tribe HTML pages already list species with occurrence counts (per GEN-01) — color swatches go in the HTML, not the SVG. SVG maps stay clean at 600×320px. Genus/tribe maps with 50+ species (Andrena, Lasioglossum) would produce unreadable legends at this canvas size.

### Claude's Discretion
- Output paths: `species-maps/genus/<Genus>.svg`, `species-maps/subgenus/<Genus>/<Subgenus>.svg`, `species-maps/tribe/<Tribe>.svg` — all under existing `ASSETS_DIR / "species-maps"`. The D-04 wipe-and-rewrite of the full `species-maps/` directory covers the new subdirectories for idempotency.
- Color rendering: use per-species `<g fill="{hex}">` group wrapping circles, or per-element `fill` attribute — per-element fill overrides the shared `.occ` CSS class. The single-CSS-class constraint (existing D-03 for per-species maps) does not apply to multi-color group maps.
- Skip species with `occurrence_count == 0` in group maps — consistent with per-species behavior. Species with occurrences in the group but zero points after bbox clip are still rendered (zero circles drawn, no error).
- Subgenus maps: only generate where subgenus is non-null and non-empty in `species.parquet`. Subgenus output path uses parent genus as a subdirectory: `subgenus/<Genus>/<Subgenus>.svg`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §PIPE-02 — locked requirement for this phase (multi-color SVGs for genus, subgenus, tribe)

### Existing Implementation to Extend
- `data/species_maps.py` — the entire file; extend with new generation functions alongside `generate_species_maps()`
- `data/species_export.py` lines 59–65 — `SPECIES_COLUMNS` list; confirms `tribe`, `genus`, `subgenus` are in `species.parquet`
- `data/run.py` lines 88 — `("species-maps", generate_species_maps)` pipeline step; new step(s) added here

### Prior Map Decisions (from species_maps.py docstring + inline comments)
- `D-02` (species_maps.py): `state_fips` from `config.STATE_FIPS`, not hardcoded
- `D-04` (species_maps.py): wipe-and-rewrite `species-maps/` at start of each run for idempotency
- `MAP-04 + Pitfall #5`: off-bbox points clipped silently, never raise
- `STYLE_CSS` and `VIEWBOX` constants: reuse for new map type (same backdrop, same canvas)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_build_county_backdrop(county_geojsons)` — builds the SVG root with county paths; deepcopy per species already works; reuse for group maps
- `_write_species_svg(slug, points, backdrop, out_dir)` — takes `out_dir` parameter, already does `out_path.parent.mkdir(parents=True, exist_ok=True)`; can be reused or its logic extracted
- `_project(lon, lat)` → `(x, y)` — linear projection; reuse unchanged
- `_in_bbox(lon, lat)` — bbox clip; reuse unchanged
- `_load_county_geojsons(con)` — fetches WA county geometries; reuse unchanged
- `occ_by_canon` pattern (single sweep through occurrences, grouped by canonical_name in Python) — reuse for group maps; already loaded once per run

### Established Patterns
- Sorted attribute dict before `ET.tostring` (idempotency): apply to all new SVG elements
- `out_path.parent.mkdir(parents=True, exist_ok=True)` already in `_write_species_svg` — new subdirs auto-created
- `shutil.rmtree` + `mkdir` at run start: extend to cover new subdirs, or wipe entire `species-maps/` (already does)

### Integration Points
- `data/run.py` `STEPS` list: add new step(s) after `("species-maps", generate_species_maps)` or integrate into `generate_species_maps` itself
- `species.parquet` at `ASSETS_DIR / "species.parquet"`: read for group membership; already read in `generate_species_maps()`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 93-Multi-Color SVG Map Generation*
*Context gathered: 2026-05-15*
