# Phase 161: Add WDFW wildlife areas as places - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Curate Washington Department of Fish & Wildlife (WDFW) wildlife areas into
`content/places.toml` as new `[[places]]` entries, so bee occurrence records
collected inside them are tagged with a `place_slug`, become filterable, and
render as named boundaries on the map.

This is a **data/content addition**, not a code change. The existing place
pipeline auto-exposes new entries end-to-end:

```
content/places.toml
  → places_validation.py (slug/WKT/WGS84; overlap guard REMOVED in Phase 160)
  → places_load.py        (geographies.places table)
  → dbt marts/occurrences.sql (ST_Within → place_slugs[] membership, post-160)
  → places_export.py      (places.geojson + places.json with counts)
  → places_maps.py        (per-place SVG)
  → frontend auto-exposes (boundary layer + filter chip + sidebar)
```

> **DEPENDS ON PHASE 160.** This phase was split: research found 16 WDFW
> boundaries that partially overlap existing places. The legacy
> one-place-per-occurrence partition (scalar `place_slug` + `DISTINCT ON` +
> `ST_Overlaps` rejection) was an implementation artifact, not a requirement.
> **Phase 160** makes the place model overlap-capable (`place_slugs VARCHAR[]`,
> overlap guard dropped). Once 160 lands, the 16 overlaps load cleanly — a
> shared-ground point simply belongs to both places. Plan/execute Phase 160
> first. (Supersedes the original D-04 overlap-handling decision below.)

**In scope:** Add the 33 web-listed WDFW wildlife areas to `places.toml` with
correct schema, acquire/convert boundary geometry (committed curation script),
simplify for browser weight, validate, and confirm they flow through the
pipeline.

**Out of scope:** The place-model change itself (that's **Phase 160**); adding
*hikes* (linear features — Phase 162); persisting/exporting `permits[]` (the
pipeline already drops them); other deferred land managers (Columbia Land
Trust, Bureau of Reclamation); "Jackman Creek" (in the GIS layer but not on the
public list — excluded per scope decision D-01).

</domain>

<decisions>
## Implementation Decisions

### Scope & selection
- **D-01:** Add the **33 web-listed WDFW wildlife areas** (per
  https://wdfw.wa.gov/places-to-go/wildlife-areas). The authoritative GIS layer
  also contains a 34th area, **"Jackman Creek"**, absent from the public list —
  **excluded** (user decision 2026-06-23). Match the public list exactly.
- **D-02:** `land_owner = "Washington Department of Fish & Wildlife"` (full
  form, not "WDFW") for every entry — matches the existing `land_owner`
  convention of spelling out the managing agency.

### Granularity
- **D-03:** **One entry per wildlife area.** Each of the ~33 wildlife areas is
  a single `[[places]]` entry whose `geometry_wkt` is a **MultiPolygon
  combining all of that area's non-contiguous units** (e.g., Oak Creek WA's
  Cowiche / Cleman Mountain / Naches units roll into one MultiPolygon). This
  mirrors the existing `rattlesnake-ledge` entry (one MultiPolygon) and keeps
  the filter list short. `ST_Within` still tags a point inside any sub-polygon.
  Do **not** create one entry per unit.

### Overlap resolution
- **D-04 (SUPERSEDED by the split / Phase 160):** The original decision was
  "assume no overlaps; if `ST_Overlaps` validation fails, STOP and raise it."
  Research then found **16 real WDFW↔existing-place partial overlaps**, and the
  user determined the one-place-per-occurrence rule was an implementation
  artifact, not a requirement. **Resolution moved upstream to Phase 160**, which
  makes place membership many-to-many and drops the overlap guard. So in this
  phase there is **no overlap handling at all** — no clip, no skip, no triage.
  The 16 overlaps simply load once Phase 160 has shipped. (If Phase 161 is
  somehow attempted before 160, validation will reject the 16 — that's the
  signal to do 160 first, not to clip.)

### Geometry fidelity
- **D-05:** **Simplify for browser weight (now confirmed required).** Research
  measured full fidelity at **~+3.0 MB** on top of the current ~346 KB
  `places.geojson` (~3.4 MB total) — too heavy for the browser-shipped artifact
  (page weight is why DuckDB-WASM was rejected). So simplification is no longer
  conditional. Apply Douglas–Peucker (DuckDB `ST_SimplifyPreserveTopology`);
  measured options: `0.0002°` (~22 m) → ~716 KB, `0.0005°` (~55 m) → ~549 KB,
  both still valid. **Default `0.0002°`, threshold total ≤ ~1 MB**; report
  before/after size and the chosen tolerance. (Planner to ratify the final
  tolerance; user leaned toward the lighter end being acceptable for large
  wildlife-area boundaries.)

### Claude's Discretion
- **`permits[]` population** — WDFW is a known permit issuer
  (`reference_permits_box.md`). The `permits[]` array is optional and is
  **validated but never persisted or exported** (places_load.py inserts only
  slug/name/land_owner/geom; places_export.py omits permits). So populating it
  is low-stakes documentation only. Planner's discretion: populate
  `permits[] = [{ issuing_authority = "Washington Department of Fish &
  Wildlife", type = "project-level" }]` (optionally `permit_number` /
  `expiry_date` read from the WDFW permit in Box) if readily available, else
  leave the array off. Either is acceptable; do not block on it.
- **Slug naming** — derive from the wildlife-area name, lowercase, `[a-z0-9-]`
  only (validation enforces the charset). Planner picks the exact convention
  (e.g., `oak-creek-wildlife-area` vs `oak-creek`); slugs are immutable after
  first publish, so choose deliberately.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### WDFW source data
- https://wdfw.wa.gov/places-to-go/wildlife-areas — the authoritative list of
  wildlife areas (names + units). RESEARCHER TASK: locate the authoritative
  **boundary GIS layer** (WDFW publishes "Wildlife Area" boundaries; likely on
  the WA Geospatial Open Data Portal / geo.wa.gov ArcGIS REST service or
  data.wa.gov) and a path to convert each area's polygons to **WGS84
  (EPSG:4326) MultiPolygon WKT**.

### Place data model (code is the spec — no formal ADR)
- `content/places.toml` — schema + documented rules in the header comment
  (slug immutability, `geometry_wkt` = WGS84 WKT polygon/multipolygon,
  `permits[].type` ∈ {project-level, site-level}). 134 entries currently.
- `data/places_validation.py` — the 6 validation checks (slug regex, dup slug,
  permit field presence, WKT validity, WGS84 bounds, **`ST_Overlaps`
  pairwise**). This is the sole gatekeeper — there is no dbt contract on
  `geographies.places`.
- `data/places_load.py` — TOML → `geographies.places` (columns: slug, name,
  land_owner, geom). Confirms permits are NOT persisted.
- `data/dbt/models/marts/occurrences.sql` §~72–82,97 — `ST_Within`
  point-in-polygon join that adds `place_slug` to the occurrences mart.
- `data/places_export.py` — writes `public/data/places.geojson` (slug+name+geom)
  and `public/data/places.json` (slug, name, land_owner, specimen_count,
  sample_count). Permits omitted.
- `data/run.py` §6–11 — STEPS order:
  places-validation → places-load → dbt-build → … → places-export → places-maps.
- `data/add_new_places.py` — existing helper/template for appending entries.
- `data/tests/test_places_validation.py`, `test_places_load.py`,
  `test_places_export.py` — the contract tests to keep green.

### Project memory (background, not instructions)
- `reference_permits_box.md` — WDFW permit lives in the Box Permits directory
  (`~/Library/CloudStorage/Box-Box/Volunteer Resources/Permits/`); source for
  optional permit metadata.
- `project_deferred_places.md` — why overlaps matter (Columbia Land Trust was
  deferred for overlapping Klickitat Trail) — the same overlap problem Phase 160
  now solves at the model level instead of by deferral.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/add_new_places.py` — existing script that constructs `[[places]]`
  entries (sets permit_number/expiry_date too). Strong template for bulk-adding
  the WDFW entries.
- The entire downstream pipeline (validate → load → join → export → maps →
  frontend) is reused unchanged. No new code paths.

### Established Patterns
- `rattlesnake-ledge` is the canonical example of a single entry whose
  `geometry_wkt` is a MultiPolygon — direct precedent for D-03 (one MultiPolygon
  per wildlife area).
- Validation is the ONLY contract; if it passes, the entry flows automatically.
  Adding entries is "edit TOML + run pipeline," nothing more.

### Integration Points
- `ST_Within` in `marts/occurrences.sql` is the sole place an occurrence
  acquires `place_slug` — geometry must be Polygon/MultiPolygon (a LineString
  would never match; that constraint is Phase 162's problem, not this one).
- `places.geojson` is the browser-shipped artifact whose weight D-05 guards.

</code_context>

<specifics>
## Specific Ideas

- Worked example for granularity: **Oak Creek Wildlife Area** = one entry,
  MultiPolygon over its Cowiche / Cleman Mountain / Naches units.
- Overlap note (historical): research found 16 WDFW↔existing partial overlaps;
  the original `ST_Overlaps` rejection guard is **removed in Phase 160**, so this
  phase does no overlap handling — the 16 just load as multi-place membership.

</specifics>

<deferred>
## Deferred Ideas

- **Linear "hikes" as places (Phase 162)** — `ST_Within` can't tag points on a
  LineString; that phase must solve geometry representation separately. Out of
  scope here.
- **Per-unit granularity** — splitting wildlife areas into one entry per unit
  was considered and rejected (D-03). Could revisit if filtering at unit
  resolution is later desired.
- **Display-vs-join dual geometry** (simplified for browser, full for ST_Within)
  — considered under geometry fidelity; not adopted unless D-05's measurement
  forces simplification AND join accuracy near edges then matters.
- **Other deferred land managers** — Columbia Land Trust (per-property),
  Bureau of Reclamation (permit renewal pending) remain out of scope
  (`project_deferred_places.md`).

</deferred>

---

*Phase: 161-add-wdfw-wildlife-areas-as-places*
*Context gathered: 2026-06-22*
