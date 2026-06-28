# Phase 172: Accomplishment View - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-28
**Phase:** 172-accomplishment-view
**Areas discussed:** Aggregation record scope, County coverage map, Taxonomic-breadth list, Active-seasons badge + ecoregion breadth

---

## Aggregation record scope (cross-cutting)

| Option | Description | Selected |
|--------|-------------|----------|
| WABA contributions only | Specimens + samples only; exclude the collector's casual inat_obs. Matches accomplishment framing + page gate intent. | ✓ |
| All their occurrence rows | Include casual inat_obs — broadest footprint, mixes casual with curated. | |
| Specimens only | Strictest — only Ecdysis-backed specimens; excludes samples. | |

**User's choice:** WABA contributions only
**Notes:** Reuses the existing `collectors_export.py` row predicate verbatim (D-01).

---

## County coverage map

| Option | Description | Selected |
|--------|-------------|----------|
| Binary county fill, S3 .svg file | Contributed counties filled one shade; generated like species-maps (S3 stable URL, `<img>`); reuses `.checklist-county` fill class. | ✓ |
| Graduated choropleth, S3 .svg | County shaded by count + legend. | |
| Binary fill + occurrence points | Full species_maps treatment with locality dots. | |
| Inline SVG in the page | Render fills inline from a county list in collectors.json. | |

**User's choice:** Binary county fill, S3 .svg file
**Notes:** Delivery via nightly.sh species-maps mechanism — not committed to git (D-02).

---

## Taxonomic-breadth list

| Option | Description | Selected |
|--------|-------------|----------|
| Flat list, grouped by genus | Species under genus headings, each linked to /species/{slug}/. | ✓ |
| Flat alphabetical list | Alpha-sorted species names, linked. | |
| Sorted by count | Species ordered by contribution count. | |

**User's choice:** Flat list, grouped by genus
**Notes:** Species-rank determinations only (D-04).

---

## Active-seasons badge + ecoregion breadth

| Option | Description | Selected |
|--------|-------------|----------|
| YYYY=earliest, N=distinct years; ecoregions named list | Season = distinct field year; ecoregions as a named list + count. | ✓ (badge part) |
| YYYY=earliest, N=distinct years; ecoregion count only | Same badge, ecoregion as just a number. | |
| YYYY=earliest, N=year span; ecoregions named | N = max−min+1 span. | |

**User's choice:** Option 1 for the badge (earliest year + distinct-year count, no streaks) — **but** "ecoregions might as well be a map like the counties."
**Notes:** The ecoregion-as-a-map directive (D-03) overrides the named-list sub-option: ecoregion breadth becomes a second coverage SVG, parallel to the county map, with a count caption. Confirmed `marts/ecoregions_geo` / `ecoregions.geojson` supplies the L3 polygons. Badge sources from `year`/`date`, not the nonexistent `collection_date` (D-05).

---

## Claude's Discretion

- SVG file layout (two files vs layered groups, dir naming), generator module placement.
- Whether per-species counts show in the taxonomic list.
- On-page placement/order of the four elements + section CSS (UI-SPEC concern).
- Exact aggregation SQL shape, given the locked predicates.

## Deferred Ideas

- Graduated choropleth / per-occurrence points on the map (not chosen).
- Plain ecoregion named list (superseded by the map).
- Seasonality/phenology charts → Phase 166.
- Cross-collector ranking / streaks / leaderboards → out (ACCOM-04).
