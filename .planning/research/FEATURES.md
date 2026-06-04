# Feature Research: v4.7 Checklist Records as Point Data

**Domain:** Biodiversity occurrence atlas — historical museum/checklist specimen records as map points
**Researched:** 2026-06-03
**Milestone:** v4.7 Checklist Records as Point Data
**Confidence:** HIGH (ecosystem survey of GBIF/Symbiota/ALA/iDigBio + codebase analysis)

---

## Context

v4.7 promotes the Bartholomew et al. 2024 WA bee checklist from a county-fill presence layer to a
full `source='checklist'` peer in `occurrences.parquet` — rendered as map points, integrated into
the sidebar, CSV export, and species pages. Records span 1812–present, georeferenced at varying
precisions (GPS through county-centroid), with ~13% null dates and ~9% null coordinates.

The existing app already delivers: per-source toggle, taxon_id filtering, sidebar occurrence list,
CSV export, species/taxon pages with per-source counts, seasonality histograms, county-fill
checklist presence layer.

Audience: volunteer collectors, researchers, WA Bee Atlas coordinators — not professional
biodiversity informaticists. GBIF-level completeness is not the goal. Credibility and
interpretability for the WA bee community is.

The current `wa_bee_checklist_records.tsv` has only 4 columns: species, county, year, month.
The full-fidelity CSV source (Bartholomew et al. 2024 supplementary data) contains lat/lon,
date, recordedBy, locality, and verbatim scientific name. This CSV re-extraction is the
prerequisite for everything else in v4.7.

---

## Scope Constraints That Shape Every Feature Decision

- **Static hosting, no server runtime.** All joins and dedup logic must run at pipeline time and bake
  into `occurrences.parquet`. No runtime lookups.
- **33-column dbt contract on `marts/occurrences`.** Adding checklist-specific columns (locality,
  verbatim_name, coordinate_precision) requires a contract amendment and corresponding frontend
  column reads.
- **4th source color in Mapbox style.** Existing palette: ecdysis=blue, waba_sample=green,
  inat_obs=amber. Checklist gets a 4th distinct color. Source color is the primary visual
  differentiator on the map.
- **Dedup risk is the credibility risk.** Checklist and Ecdysis are both museum-specimen sources.
  The same physical bee plotted twice is the single most likely thing that would make an
  entomologist distrust the map.
- **The existing county-fill checklist layer stays.** It remains the fallback for the ~9%
  no-coordinate records. v4.7 adds points; it does not replace the fill layer.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these makes the map feel wrong or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Source label / dataset attribution on detail card | Checklist and Ecdysis coexist on the same map. A user clicking a point MUST be told which source it came from. A 1920 Puget Sound Museum record looks identical to a 2024 WABA collection without a label. | LOW | `source` column already in `occurrences.parquet`. Add a `_renderChecklist` branch in `bee-occurrence-detail.ts` (parallel to `_renderInatObs`). Attribution line: "Bartholomew et al. 2024, JHR 97" with DOI link. |
| Collector name on checklist detail card | Museum records without a collector feel like data errors. Users interpret absence as "unknown" only when the UI says so explicitly. | LOW | Map `recordedBy` from source CSV into `int_combined` ARM 4. Render as name or "collector unknown" hint — same pattern already used for Ecdysis `_renderCollectorGroup`. |
| Date with graceful null/partial handling | ~13% of rows have null dates; some are date-ranges or non-ISO (source spans to 1812). A point with date "null" in the sidebar feels broken. | MEDIUM | Pipeline: parse to best-effort ISO date; store verbatim date string as a separate `verbatim_date` column. UI: display formatted date when parseable, fall back to year-only, fall back to "date unknown". Do NOT drop null-date rows from point layer (only no-coordinate rows are dropped per milestone decision). |
| Locality text on detail card | For records from 1812–1960 georeferenced to a named locality or county, the locality string explains WHY the point is where it is. Its absence on a historical record signals incomplete provenance. All reference portals (GBIF, Symbiota, ALA, Big-Bee) show this field. | LOW | Add `locality` column to ARM 4 in `int_combined`. Render below collector/date in the detail card. |
| Checklist points rendered in a distinct 4th source color | Once checklist points appear on the map, users must be able to visually distinguish them from Ecdysis (blue), WABA provisional (green), and iNat expert obs (amber) at a glance — without clicking. | LOW | Assign a 4th color in `style.ts` for `source='checklist'`. The architecture already handles per-source styling via the `source` discriminator. |
| Source-selection toggle extended to checklist point layer | The county-fill layer has a `cl=1` toggle. If point records appear without a toggle, users cannot turn them off. Source filtering already uses `src=` URL param for ecdysis/inat_obs/waba_sample. | MEDIUM | Extend the source toggle row in `bee-pane.ts` to include checklist. The existing `src=` param multi-value architecture should accommodate a 4th value. |
| Per-source counts on species/taxon pages | Species pages show "N specimens · N community observations". Users will expect "N checklist records" once checklist is a first-class source. Absence looks like the data is missing. | LOW | Follows the per-source count pattern from v4.2. Add checklist arm to `species.json` export. No architectural change. |
| Dedup against Ecdysis — suppress double-plot of same physical specimen | Checklist and Ecdysis are both museum-specimen sources with significant overlap (both derived from WA bee collections). The same bee plotted twice as two overlapping points is the most likely way to lose credibility with the target audience (practicing entomologists). | HIGH | Match on catalog_number OR (collector + date + coordinate proximity fuzzy match). Mark duplicate checklist rows `dedup_status='ecdysis_duplicate'`; suppress those rows from the point layer. Do not delete them — they remain available in the county-fill mart. GBIF does not auto-dedup cross-dataset; for this app's scale (~50K checklist vs ~45K Ecdysis), pipeline-time dedup is feasible. |

### Differentiators (Competitive Advantage)

Features that distinguish BeeAtlas from just re-implementing a GBIF occurrence card.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Verbatim-vs-accepted name display in detail card | Checklist records from 1920–1990 may use names that are now synonyms (e.g., "Anthophora urbana" → current accepted name). Showing the current accepted name prominently WITH a secondary note "originally recorded as X" makes the reconciliation auditable and educates volunteers about taxonomy. No major portal surfaces this distinction prominently in occurrence cards. | MEDIUM | Store `verbatim_name` (original checklist name) alongside `canonical_name`. In `_renderChecklist`, show accepted name (from taxon cache via `taxon_id`) as primary, add "originally identified as [verbatim_name]" as secondary line ONLY when the two differ after reconciliation. |
| Coordinate-precision note in detail card (not uncertainty circles) | Records georeferenced to a county centroid vs. GPS-precise coordinates differ by 30+ km. ALA-style uncertainty circles (optional; opt-in checkbox; caps at 30 km) are the GBIF/ALA approach. For a volunteer atlas map with 50K points, circles are rendering-expensive and visually cluttered. A simple text note ("approximate location — county level") in the detail card communicates the key fact at zero rendering cost. | MEDIUM | Add `coordinate_precision` enum column to ARM 4: `'gps'`, `'locality'`, `'county'`. Derive at pipeline time from whether source record has decimal-degree coords that appear GPS-precise vs. geocoded centroids. Render as a parenthetical note in the detail card only. |
| Year-excluded note on seasonality histogram | Historical records with only year (1902) or date ranges ("summer 1921") cannot contribute to month-level seasonality histograms. Silently excluding them loses real presence data without explanation. No portal currently makes this distinction explicit for users. | LOW | On species page histogram, add "N records excluded from seasonality (date resolution below monthly)" as a footnote. Count those records separately. Honest about data completeness. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Coordinate uncertainty circles on map (ALA-style) | ALA and GBIF support a circle of radius = coordinateUncertaintyInMeters per point. Looks analytically thorough. | For a Mapbox-rendered map with 50K checklist points plus ~90K other occurrences, per-point varying-radius circles require a separate fill-circle layer with per-feature data-driven radius — rendering intensive and visually disastrous (county-level records produce identical overlapping 30-50 km carpet). ALA caps uncertainty display at 30 km and acknowledges that "many records do not have a value." | Show precision category as text in detail card: "Location: county-level approximation." Zero rendering cost; communicates the key fact to users who clicked a point. |
| Merging checklist + Ecdysis into a single deduplicated occurrence | Seems cleaner — one point per specimen, no double-plot. | Loses audit trail. If the dedup match is wrong (two different collectors named "J. Smith" in the same county in the same year), a merged record is incorrect and uncorrectable without separate provenance. GBIF explicitly does not auto-merge cross-dataset duplicates precisely because match errors are hard to detect post-merge. | Mark duplicate checklist rows with `dedup_status`; suppress from point layer; keep in county-fill mart; make dedup status visible in detail card as a secondary note for power users. |
| Verbatim date free-text field in the sortable table | Data completeness — "Spring 1901" is more accurate than null. | "Spring 1901" in a sortable date column breaks sort order, breaks date-range filter comparisons, confuses volunteers expecting YYYY-MM-DD. | Show verbatim_date only in the occurrence detail card as secondary informational context. The `date` column in parquet and the table uses best-effort ISO date or year-only for sortability and filtering. |
| Catalog number as primary display field | Power users want to track back to original museum record. | Institution catalog codes (e.g., "USNM:ENT:1001108") are opaque to the volunteer audience. They add cognitive load to the detail card without payoff for non-specialists. | Include catalog number as a small secondary field in the detail card (following the Big-Bee/Symbiota pattern) for power users, hidden behind normal visual hierarchy. Link to source collection page if a URL is derivable. Do not elevate to primary display. |
| Coordinate precision as a filter control | Power users want to exclude county-level records from analysis. | Adding another filter control to the already-complex filter panel increases UI surface area for the volunteer audience. Researchers can use the CSV export. | Document that `coordinate_precision` column is available in CSV export for post-export filtering. Do not add a filter control in v4.7. |
| Showing all 50,646 checklist rows including ~9% with no coordinates | "Don't lose data." | Points with no coordinates have no map placement. Placeholders ("record exists but location unknown") in the sidebar without a corresponding map point are confusing — the user clicked something on the map. | Drop no-coordinate rows from the point layer (already decided in milestone scope). They are retained in the county-fill layer via the existing `checklist.parquet` mart. |

---

## Feature Dependencies

```
[Full CSV re-extraction (lat/lon, date, recordedBy, locality, verbatim_name)]
    └──required by──> [checklist ARM 4 in int_combined]
    └──required by──> [All detail card features]
    └──required by──> [Dedup against Ecdysis]

[checklist ARM 4 in int_combined + occurrences.parquet]
    └──required by──> [Checklist points on map]
    └──required by──> [_renderChecklist detail card branch]
    └──required by──> [Per-source counts on species pages]
    └──required by──> [CSV export includes checklist rows]
    └──required by──> [Dedup pipeline step]

[Dedup pipeline step (dedup_status column)]
    └──required by──> [Suppress ecdysis_duplicate rows from point layer]
    └──enhances──>    [Detail card (show dedup status note)]

[4th source color in Mapbox style (checklist = distinct color)]
    └──required by──> [Visual distinction on map]

[Source-selection toggle extension]
    └──required by──> [User can turn off checklist points]
    └──depends on──>  [ARM 4 in parquet (source='checklist' value exists)]
```

### Dependency Notes

- **ARM 4 requires full CSV re-extraction first.** The current `wa_bee_checklist_records.tsv`
  has only species/county/year/month. ARM 4 cannot be built until the full-fidelity CSV replaces
  it as the pipeline input. This is strictly the first implementation task.
- **Dedup key depends on CSV field availability.** If the checklist CSV lacks catalog numbers for
  most records, dedup must fall back to (collector + date + coordinate proximity) fuzzy match —
  a moderately complex implementation. Inspect the CSV first; dedup strategy branches on this.
- **`_renderChecklist` branch is blocked on parquet schema confirmation.** The detail card
  renderer cannot be finalized until ARM 4 columns (locality, verbatim_name, coordinate_precision)
  are confirmed in the parquet, since those are nullable fields Ecdysis rows do not have.
- **Source color and toggle extension are independent of each other** and can be shipped before
  or after the detail card work.
- **Per-source species page counts are blocked on ARM 4** (need `source='checklist'` rows to count).

---

## MVP Definition for v4.7

### Must Ship

- [ ] Full CSV re-extraction into pipeline (lat/lon, date, recordedBy, locality, verbatim_name)
- [ ] Checklist ARM 4 in `int_combined` + `occurrences.parquet` (`source='checklist'`)
- [ ] Drop no-coordinate rows; retain null-date rows with year-only fallback in `date` column
- [ ] `verbatim_date` column preserved alongside normalized `date`
- [ ] Checklist points rendered on map with distinct 4th source color
- [ ] Source-selection toggle extended to include checklist point source
- [ ] `_renderChecklist` branch in `bee-occurrence-detail.ts`: collector, date + verbatim_date,
      locality, dataset attribution ("Bartholomew et al. 2024, JHR 97" with DOI link)
- [ ] Verbatim-vs-accepted name secondary note in detail card when they differ
- [ ] Dedup against Ecdysis: `dedup_status` column; suppress `ecdysis_duplicate` rows from
      point layer
- [ ] Per-source counts on species pages (checklist arm)
- [ ] dbt 33-column contract extended for ARM 4 columns

### Add If Straightforward After Core

- [ ] `coordinate_precision` enum and detail card note — add after confirming what precision
      metadata is actually present in the source CSV
- [ ] Year-excluded-from-seasonality note on species pages — low complexity, honest UX improvement

### Defer

- [ ] Link from detail card to source collection catalog page — requires knowing which
      institutions contributed records and whether they have stable record URLs
- [ ] County-fill layer retirement/consolidation — remains valid fallback for no-coordinate
      records; consolidation is a future milestone decision

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Full CSV re-extraction + ARM 4 in parquet | HIGH — prerequisite for everything | HIGH | P1 |
| Checklist points on map (4th color) | HIGH — core milestone payoff | LOW | P1 |
| Source attribution + collector + locality in detail card | HIGH — credibility | LOW | P1 |
| Date handling (null → year-only, verbatim_date fallback) | HIGH — data integrity | MEDIUM | P1 |
| Dedup against Ecdysis | HIGH — credibility risk | HIGH | P1 |
| Source toggle extension | MEDIUM — usability | LOW | P1 |
| Per-source counts on species pages | MEDIUM — consistency | LOW | P1 |
| Verbatim-vs-accepted name note in detail card | MEDIUM — trust/education | LOW | P2 |
| Coordinate precision note in detail card | MEDIUM — interpretability | MEDIUM | P2 |
| Year-excluded-from-seasonality note | LOW — honesty nicety | MEDIUM | P3 |
| Uncertainty circles on map | LOW — overkill for volunteers | HIGH | anti-feature |
| Cross-dataset record merge | LOW — correctness risk | HIGH | anti-feature |

---

## Portal Comparison

| Feature | GBIF | Symbiota / Big-Bee | ALA | BeeAtlas v4.7 Approach |
|---------|------|--------------------|-----|------------------------|
| Basis-of-record distinction | Filter only; no visual badge on point | `PreservedSpecimen` shown in record detail | Filter + record detail | Source color on point + attribution line in detail card |
| Verbatim vs accepted name | Stored in API; not prominently surfaced in occurrence card | Verbatim date shown; one scientific name shown (accepted) | Shows both in record detail | Accepted name primary; "originally identified as X" secondary note when they differ |
| Coordinate uncertainty | Optional filter at CSV download; no map circles by default | `coordinateUncertaintyInMeters` field present; not displayed as circle | Optional circle overlay (opt-in, capped at 30 km); acknowledges many records lack value | Precision category as text note in detail card; no map circles |
| Dedup across datasets | No auto-dedup; researcher-facing clustering tool | No auto-dedup cross-portal | No auto-dedup | Pipeline-time dedup: `dedup_status` column; suppress duplicate points from layer |
| Collector display | `recordedBy` in record detail | `recordedBy` in record detail | `recordedBy` in record detail | Same: collector name in detail card; "collector unknown" if null |
| Dataset attribution | Dataset name + publisher in record detail | Institution code + collection in record detail | Data resource link in record detail | Citation line in detail card ("Bartholomew et al. 2024") |
| Locality text | `locality` in record detail | `locality` in record detail | `locality` in record detail | `locality` in detail card |
| Catalog number | Shown in record detail; part of triplet ID | Shown in record detail | Shown in record detail | Secondary field in detail card; not primary display |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes features | HIGH | Grounded in existing detail card code + ecosystem survey of 4 major portals |
| Anti-features (uncertainty circles, merge) | HIGH | Directly confirmed by GBIF/ALA design decisions and rendering cost analysis |
| Dedup approach | MEDIUM | Strategy confirmed; key depends on whether checklist CSV has catalog_number — inspect CSV first |
| Coordinate precision metadata | LOW | Not yet confirmed whether full checklist CSV contains coordinateUncertaintyInMeters or only lat/lon |
| Verbatim name availability | MEDIUM | Checklist CSV is expected to have original verbatim scientific names; confirm on re-extraction |

---

## Sources

- GBIF Basis of Record: https://docs.gbif.org/course-data-use/en/basis-of-record.html
- GBIF Duplicate/Clustering: https://docs.gbif.org/course-data-use/en/duplicates.html
- GBIF Geospatial Issues: https://docs.gbif.org/course-data-use/en/geospatial-filters-issues.html
- Symbiota Occurrence Data Fields: https://symbiota.org/symbiota-occurrence-data-fields-2/
- Big-Bee Symbiota portal specimen detail: https://library.big-bee.net/portal/collections/individual/index.php?occid=1615893
- ALA Spatial Portal (uncertainty circles): https://www.ala.org.au/spatial-portal-help/species-add-to-map/
- Bartholomew et al. 2024 checklist: https://jhr.pensoft.net/article/129013/
- Codebase: `data/dbt/models/intermediate/int_combined.sql` (existing ARM structure)
- Codebase: `src/bee-occurrence-detail.ts` (existing detail card; `_renderChecklist` does not yet exist)
- Codebase: `data/checklist_pipeline.py` (existing 4-column checklist loader; SOURCE_CITATION defined)
- Codebase: `data/checklists/wa_bee_checklist_records.tsv` (confirms only 4 columns in current derivation)

---
*Feature research for: v4.7 Checklist Records as Point Data (BeeAtlas)*
*Researched: 2026-06-03*
