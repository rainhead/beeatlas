# Phase 162: Add specific hikes as places - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning
**Source:** Interactive decisions (AskUserQuestion) + user-provided hike shortlist

<domain>
## Phase Boundary

Add a small **hand-curated proof-of-concept set of named hikes** (WTA trails) to
`content/places.toml` as `[[places]]` entries, so bee occurrences collected
**along a trail** are tagged with the hike's slug, become filterable, and render
on the map.

The defining constraint: **hikes are linear** (a trail centerline is a
LineString), but the place pipeline tags occurrences with
`ST_Within(point, polygon)` — a point is essentially never *inside* a bare line.
So every hike must be represented as a **polygon corridor** (the trail line
buffered outward) for membership to work at all.

This reuses the existing place pipeline unchanged (validate → load →
dbt-build → export → maps → frontend). The only new code is a committed curation
script that turns each hike's trail geometry into a buffered-corridor
MULTIPOLYGON WKT entry — directly analogous to Phase 161's
`data/add_wdfw_wildlife_areas.py`.

**In scope:** Acquire trail geometry for the 14 listed WTA hikes, buffer each
into a ~250 m corridor polygon (in a metric CRS), simplify for browser weight,
add as ordinary `[[places]]` entries, validate, and confirm they flow through
the pipeline and tag along-trail occurrences.

**Out of scope:** A `place_type`/category schema change (decision: reuse the
ordinary place model — see D-03); scaling beyond the 14 POC hikes; AllTrails as
a source (ToS); changing the place pipeline or the `ST_Within` join.

> **Benefits from Phase 160 (shipped).** A hike corridor will frequently overlap
> its parent place (e.g. a trail inside a WDFW area or a national forest). The
> many-to-many place model (160) means a shared-ground occurrence simply belongs
> to both the hike and the parent place — no overlap handling needed here.

</domain>

<decisions>
## Implementation Decisions

### Scope & source
- **D-01:** Scope = **14 hand-curated WTA hikes** (proof of concept; expandable
  later). Source is the user's shortlist of WTA hike pages:
  | # | Hike | WTA page |
  |---|------|----------|
  | 1 | Boulder–De Roux | https://www.wta.org/go-hiking/hikes/boulder-de-roux |
  | 2 | Fortune Creek Pass | https://www.wta.org/go-hiking/hikes/fortune-creek-pass |
  | 3 | Snoqualmie Pass to Olallie Meadow | https://www.wta.org/go-hiking/hikes/snoqualmie-pass-to-olallie-meadow |
  | 4 | Iron Peak | https://www.wta.org/go-hiking/hikes/iron-peak |
  | 5 | Naches Peak Loop | https://www.wta.org/go-hiking/hikes/naches-peak-loop |
  | 6 | Geyser Valley | https://www.wta.org/go-hiking/hikes/geyser-valley |
  | 7 | Deception Pass–Goose Rock | https://www.wta.org/go-hiking/hikes/deception-pass-goose-rock |
  | 8 | Perry Creek | https://www.wta.org/go-hiking/hikes/perry-creek |
  | 9 | Big Four Ice Caves | https://www.wta.org/go-hiking/hikes/big-four-ice-caves |
  | 10 | Umtanum Creek Canyon | https://www.wta.org/go-hiking/hikes/umtanum-creek-canyon |
  | 11 | Catherine Creek Loop | https://www.wta.org/go-hiking/hikes/catherine-creek-loop |
  | 12 | Icicle Gorge Loop | https://www.wta.org/go-hiking/hikes/icicle-gorge-loop |
  | 13 | Monte Cristo | https://www.wta.org/go-hiking/hikes/monte-cristo |
  | 14 | Tomyhoi Lake | https://www.wta.org/go-hiking/hikes/tomyhoi-lake |

### Geometry representation
- **D-02:** Represent each hike as a **~250 m corridor buffer** around the trail
  centerline (user choice — wider than a tight on-trail band, to catch
  occurrences at trailheads / meadows / parking just off the path). The buffer
  MUST be computed in a **metric CRS** (project the WGS84 line to a meter-based
  projection, `ST_Buffer` by 250 m, then transform back to EPSG:4326) — a
  degree-based buffer would be wrong and latitude-distorted. Output a valid WGS84
  Polygon/MultiPolygon WKT. **Simplify for browser weight** if needed (Phase 161
  D-05 precedent: `places.geojson` weight is guarded; corridors are far smaller
  than WDFW areas, so impact is expected to be modest — measure and report).

### Category
- **D-03:** Hikes are **ordinary `[[places]]` entries** — NO new category, NO
  schema change. There is **no `place_type` field** in `content/places.toml` or
  the pipeline/frontend (verified: 0 occurrences in toml, data/, src/), so
  "reuse place_type" means *treat hikes like any other place* — same validation,
  same filter, same sidebar. Do **not** invent a `place_type` field.

### Claude's Discretion
- **`land_owner` value (RESOLVE in research/planning):** `places_export.py`
  reads `meta["land_owner"]` with a hard key access, so the field is effectively
  **required** even though `places_validation.py` does not check it. Trails cross
  multiple managers, so there is no single clean owner. Planner's discretion:
  set per-hike `land_owner` to the **primary managing agency** (most of these are
  USFS national-forest trails — e.g. Okanogan-Wenatchee NF, Mt. Baker-Snoqualmie
  NF; Naches Peak Loop is NPS/USFS; Deception Pass is WA State Parks) if readily
  determinable, else a clear documented fallback. Do not block the POC on perfect
  owner attribution.
- **Slug convention:** WTA URL slugs are already `[a-z0-9-]` and unique — natural
  base (e.g. `boulder-de-roux`, `naches-peak-loop`). Planner ratifies whether to
  append a `-trail`/`-hike` disambiguation suffix (slugs are immutable after
  first publish; `monte-cristo`, `iron-peak`, `perry-creek` could later collide
  with area-style places). Recommend a suffix like `-trail` for safety.
- **`permits[]`:** optional, validated-but-never-persisted. Hikes don't need
  per-trail collecting permits in the POC — omit unless trivially available.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Strong template (Phase 161 — just shipped)
- `data/add_wdfw_wildlife_areas.py` — the committed curation-script pattern this
  phase mirrors: fetch geometry → DuckDB-spatial transform → simplify → emit
  `[[places]]` TOML blocks via the reused `toml_block()` writer; escape strings;
  round-trip-validate with `tomllib`; explicit raises; no overlap handling.
- `.planning/phases/161-add-wdfw-wildlife-areas-as-places/161-CONTEXT.md` and
  `161-RESEARCH.md` — the place-pipeline mechanics and weight (D-05) precedent.

### Place data model (code is the spec — no formal ADR)
- `content/places.toml` — schema (header comment): slug immutable `[a-z0-9-]`,
  `geometry_wkt` = WGS84 WKT polygon/multipolygon, `permits[].type`. No
  `place_type` field exists.
- `data/places_validation.py` — checks: slug regex, dup slug, permit fields (if
  present), WKT validity, WGS84 bounds. (Overlap guard removed in Phase 160.)
  Does NOT require `land_owner`.
- `data/places_load.py` / `data/places_export.py` — load + export; export reads
  `meta["land_owner"]` (effectively required). Permits not persisted.
- `data/dbt/models/marts/occurrences.sql` + `marts/occurrence_places.sql` —
  `ST_Within` point-in-polygon join → many-to-many `occurrence_places` bridge
  (post-160). A buffered corridor polygon participates here; a LineString cannot.
- `data/run.py` — STEPS order (places-validation → places-load → dbt-build → …
  → generate-sqlite → … → places-export → places-maps). NOTE: the browser loads
  `public/data/occurrences.db` produced by `generate-sqlite`; see
  [[project_local_uat_stale_occurrences_db]] for the local-UAT regeneration step.

</canonical_refs>

<open_questions>
## Open Questions for Research

1. **Trail geometry acquisition (CENTRAL).** How to obtain each WTA hike's trail
   centerline as a WGS84 LineString. WTA pages render a map and *may* offer a GPX
   download, but programmatic/licensed access is unconfirmed. Evaluate, in order
   of license-safety: (a) **OpenStreetMap** named-trail matching (open license —
   match each hike to its OSM way/relation by name + WTA's stated trailhead/region
   and length), (b) WTA GPX if a clean, permitted path exists, (c) hand-traced
   GPX as a fallback. Recommend the most reliable license-clean path and document
   per-hike how the line is identified.
2. **Metric buffering in DuckDB spatial.** Confirm `ST_Transform` + the right
   meter-based CRS (UTM zone 10N/11N or WA State Plane) are available, buffer
   250 m, transform back to 4326, `ST_Multi`/`ST_AsText`. Provide a verified
   code chain (mirror 161's RESEARCH code-examples section).
3. **Weight impact + simplification tolerance** of 14 corridors on
   `public/data/places.geojson` (current baseline ~896 KB after Phase 161 — the
   ~1 MB guard is now tighter). Measure and recommend a tolerance.
4. **Validation architecture** section (so a `162-VALIDATION.md` can be created):
   which existing place tests cover this, and whether the new curation script
   warrants a golden-fixture test (it should — buffer correctness is the risk).

</open_questions>

<specifics>
## Specific Ideas

- Worked example: a hike like **Umtanum Creek Canyon** likely overlaps the
  **L.T. Murray / Wenas** WDFW area added in Phase 161 — post-160 the occurrence
  belongs to both; confirm this multi-membership works end-to-end as a test.
- The curation script should be **list-driven** (the 14 hikes as input data) so
  expanding the set later is a data edit, not a code change.

</specifics>

<deferred>
## Deferred Ideas

- **Scaling beyond the 14 POC hikes** — once the corridor approach is validated,
  more hikes are a data addition.
- **Display-vs-join dual geometry** (simplified line for display, full corridor
  for ST_Within) — only if weight or edge-accuracy forces it.
- **AllTrails as a source** — ToS-restricted; excluded.
- **A dedicated hike category / `place_type` field** — rejected for the POC
  (D-03); revisit only if hikes should be visually distinct from area-places.

</deferred>

---

*Phase: 162-add-specific-hikes-as-places*
*Context gathered: 2026-06-23 via interactive decisions + user hike shortlist*
