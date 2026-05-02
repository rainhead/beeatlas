# Feature Landscape — v3.2 Species Tab

**Domain:** Biodiversity / atlas / field-guide species exploration page
**Researched:** 2026-05-02
**Confidence:** HIGH for pnwmoths-pattern (read on disk), Wiley/BeeSearch viz format (R source read on disk), and BeeAtlas data schema (DuckDB introspection); MEDIUM for WA checklist ingestion specifics (paper supplements not directly fetched); MEDIUM for ALA/iNat species-page conventions (web research only, no direct repo access)

> Scope of this research: ONLY the new Species Tab page. Existing SPA features (map, filters, drawer, feeds) are out of scope and intentionally not re-investigated.

---

## Confirmed Reference Materials

These were read directly, not just cited:

| Source | Path | What it gives us |
|--------|------|------------------|
| BeeSearch ridge plots | `~/dev/BeeSearch/analyses/ridge_plots.Rmd`, `ridge_plots.md` | Concrete x/y/encoding/threshold spec for the seasonality viz |
| BeeSearch genus plots v2 | `~/dev/BeeSearch/analyses/genus_plots_v2.Rmd` | Per-genus species-richness + proportion-abundance bar viz (interesting differentiator) |
| BeeSearch data | `~/dev/BeeSearch/data/CABS1.csv`, `Eli/EB_*.csv` | CABS schema (Date, Genus, Short.label.name, Count, Sex, Site, Station) |
| pnwmoths repo | `~/dev/pnwmoths/src/components/*.js`, `src/_data/*.js`, `src/species/species.njk`, `src/browse/index.njk`, `data/species.csv`, `data/images.csv` | Verbatim taxon-browser, phenology-chart, occurrence-map, image-slideshow, filter-bar, parquet-cache patterns; species/images CSV authoring schema |
| BeeAtlas Ecdysis schema | `data/beeatlas.duckdb` (introspected) | Confirmed taxonomy columns: family/genus/subgenus/specific_epithet/scientific_name; tribe NOT present |
| BeeAtlas iNat schema | `data/inaturalist_pipeline.py`, `data/waba_pipeline.py` | iNat v2 fields currently fetched; **photos and observation_photos NOT in DEFAULT_FIELDS** |
| BeeAtlas occurrences.parquet | `data/export.py`, `scripts/validate-schema.mjs` | Existing 32 columns; per-occurrence taxon labels (genus/family) but no tribe, no subgenus |
| Wiley paper Sugden 2025 | DOI 10.1002/ece3.72049 | Same authors / same data / same code as BeeSearch; ridge plots ARE the figure |

The Wiley paper (`10.1002/ece3.72049`) is **the published version of BeeSearch** — Riley M. Anderson, Sugden et al., "Structure of Bee Communities in Marginal Lands of the Puget Sound, USA" (2025). The "ridge plots" Rmd is the figure-generation source. We have the exact ggridges R code, so the format is fully specified.

---

## Existing Data — What's Available Per Occurrence

From `occurrences.parquet` (verified by introspecting the column list in `validate-schema.mjs` and `export.py`):

**Already populated, ready for v3.2:**
- `family`, `genus`, `scientificName` — taxonomic labels (specimen-side; iNat-side has `specimen_inat_family`, `specimen_inat_genus`, `specimen_inat_taxon_name` for provisional rows)
- `lat`, `lon` — coordinates (COALESCE of ecdysis + iNat)
- `date`, `year`, `month` — for seasonality
- `county`, `ecoregion_l3` — for geographic filtering
- `host_observation_id`, `specimen_observation_id` — link out to iNat
- `is_provisional` — distinguishes WABA-only vs Ecdysis-confirmed
- `inat_quality_grade`, `specimen_inat_quality_grade` — research-grade vs needs-id

**Available in source DB but not exported:**
- `subgenus` (Ecdysis): present but ~5% coverage globally — heavily Lasioglossum and Andrena. NOT reliable as a primary nav rung.
- `specific_epithet`, `infraspecific_epithet` — needed to display species-without-genus-prefix
- `taxon_id` (Ecdysis), `taxon__id` (iNat) — could anchor a species table

**NOT in either source — must be added or sourced separately:**
- **Tribe** — neither Ecdysis DC export nor `inaturalist_waba_data.taxon_lineage` has it. The seed says "Tribe (and other gaps) filled from iNaturalist" — that gap-fill IS NOT YET BUILT. Currently `taxon_lineage` only has `(taxon_id, genus, family)`. Adding tribe means re-fetching iNat `/v2/taxa/{ids}` with `ancestors.rank` and extracting tribe from the lineage.
- **Photos** — neither pipeline includes photo fields. Current `DEFAULT_FIELDS` in `inaturalist_pipeline.py` and `waba_pipeline.py` have no `taxon.default_photo`, no `photos.url`, no `observation_photos`. Adding photos requires a fields change AND new dlt resources for the nested photo arrays.
- **WA state checklist** (which species exist in the state list independent of occurrences) — must be ingested from Bartholomew, Murray, Bossert, Gardner, Looney 2024 (Journal of Hymenoptera Research, [https://jhr.pensoft.net/article/129013/](https://jhr.pensoft.net/article/129013/)). Paper indicates 565 high-confidence species + 102 likely, with family/subfamily/tribe/genus hierarchy. Supplement format unconfirmed; likely XLSX/CSV.

**Genus species-richness ground truth** (top genera by distinct `scientific_name` in current DB):

| Genus | Family | Specimens | Distinct species |
|-------|--------|-----------|------------------|
| Andrena | Andrenidae | 3,354 | **72** |
| Lasioglossum | Halictidae | 2,878 | **55** |
| Osmia | Megachilidae | 2,435 | **50** |
| Megachile | Megachilidae | 1,634 | 26 |
| Bombus | Apidae | 1,984 | 21 |
| Melissodes | Apidae | 1,431 | 19 |
| Hylaeus | Colletidae | 769 | 14 |
| Coelioxys | Megachilidae | 123 | 13 |
| Colletes | Colletidae | 643 | 12 |
| Eucera | Apidae | 464 | 11 |

Andrena (72), Lasioglossum (55), and Osmia (50) are the rendering-stress cases. Sub-genus rendering would split Andrena and Lasioglossum into manageable bins, but only IF subgenus is populated — which it isn't for most records. **Most species cards will appear directly under their genus, not under a subgenus.**

---

## Capability 1 — Hierarchical Taxonomic Nav (Left Rail)

**The pnwmoths reference is the closest match to v3.2 ambitions** — `~/dev/pnwmoths/src/components/pnwm-taxon-browser.js` is a Lit component with expand-on-click family→subfamily→genus→species, image strips at each level, and a state filter that mutes (rather than hides) taxa with zero records in the selected state. It IS the pattern.

### Findings (cross-site)

- **Atlas of Living Australia, GBIF, iNaturalist** — none of these have a single-page hierarchical browser comparable to pnwmoths. They all use search-first / faceted-search interfaces; species pages are reached by name search or taxon-ID URL. Not a direct pattern match.
- **BugGuide** — the canonical model for an always-visible taxonomic tree, but the UX is widely considered creaky (scroll-heavy, never-ends pages). Not worth emulating.
- **pnwmoths** — expand-on-click tree, image strips visible at collapsed-genus level, click-image-to-jump-into-tree. Volunteer-friendly.

### Tribe handling — concrete proposal

Ecdysis has no tribe column; current `taxon_lineage` has no tribe column. Two options:

1. **Hard-code a tribe table** (Apidae has Bombini, Eucerini, Anthophorini, etc.) — small lookup, ~30 tribes for WA, can be a CSV checked into `_data/`. LOW complexity, immediate.
2. **Re-fetch iNat taxa with full ancestor lineage and extract tribe** — extends `enrich_taxon_lineage` in `waba_pipeline.py` to walk `ancestors[]` for `rank == 'tribe'`. MEDIUM complexity (touches pipeline + export). Higher fidelity going forward; reusable for any future ranks.

Recommendation: **option 1 (hard-coded CSV) for v3.2**, gate on whether the WA checklist supplement already contains tribe (it does, per pensoft TOC — "Andrenidae: Andreninae: Andrenini"). If yes, the checklist IS the tribe table — single source of truth.

### Recommendation for v3.2 nav

| Aspect | Recommendation | Rationale |
|--------|----------------|-----------|
| Layout | Vertical left rail, expand-on-click (not always-expanded) | pnwmoths-pattern; 6 families × ~30 tribes × ~50 genera doesn't fit always-expanded |
| Levels | family → subfamily → tribe → genus → (subgenus when populated) → species cards | Matches the seed's locked decision; subgenus level only renders when records have subgenus filled |
| Image strips | Show 3–4 thumbnails per collapsed level | pnwmoths' `pickNavImages()` pattern; visual orientation for non-experts |
| Filter-as-you-type | Defer to differentiator | Adds JS complexity; v3.2 ships with click-to-expand only |
| Click image in strip | Jump to expanded-genus view of that species | pnwmoths' `_expandToSpecies()` pattern; volunteers can browse by photo |
| Mute-not-hide | Apply 0.35 opacity to filtered-out branches | pnwmoths D-06; preserves orientation when geo/season filters narrow results |

### Table stakes vs differentiators vs anti-features

**Table stakes (v3.2 must ship):**
- Family / tribe / genus / species hierarchy, expand-on-click — COMPLEXITY: MEDIUM. Depends on tribe data.
- Tribe rung populated for all WA bee genera — COMPLEXITY: LOW (CSV from checklist) or MEDIUM (iNat ancestor re-fetch).
- Subgenus level visible only where data supports it — COMPLEXITY: LOW. Conditional rendering.
- Static fallback (no-JS noscript with all species linked) — COMPLEXITY: LOW. Eleventy renders the tree at build time. pnwmoths-verbatim pattern.

**Differentiators (worth doing if cheap):**
- Image strips at collapsed levels — MEDIUM complexity (depends on photo manifest existing). Strong pedagogical value for volunteers building "what's in this group" mental models.
- Click-image-to-jump — LOW once strips exist.
- Filter-as-you-type by genus/species name — LOW-MEDIUM. Useful but the tree fits on one screen at family level.
- Mute-not-hide on filtered taxa — LOW. Critical for orientation; recommend treating as table-stakes-adjacent.

**Anti-features (do NOT build for v3.2):**
- Identification key / dichotomous key UI — out of scope; deserves its own milestone.
- Drag-and-drop tree reordering — solves nothing.
- Favoriting / collections — community-feature territory; cold-start risk per `project-goals-liveness-community.md`.
- Per-tribe detail pages — seed locks species detail pages OUT; same logic applies to higher ranks.

---

## Capability 2 — Species Cards (Grid Layout)

### Findings

The pnwmoths species browser renders species as a 2-column responsive grid (`grid-template-columns: 1fr 1fr` at >=600px) where each card is `<a class="pnwm-tb-species-card">` containing one cropped hero image (`aspect-ratio: 376/249; object-fit: cover`) and italic genus + species + optional common name. Clicking the card navigates to a species detail page — but our seed locks detail pages OUT of v3.2. So v3.2 cards must be self-contained: the card IS the surface.

Per-card content load for v3.2 (locked in seed):
- Photo(s)
- Short ID-helpful description (authored, not extracted)
- Static SVG occurrence map
- Seasonality viz

### Concrete recommendations

| Element | Recommendation | Complexity |
|---------|---------------|-----------|
| Photo treatment | Single cropped hero on the card; click-to-expand to gallery | Hero is LOW; gallery (slideshow with prev/next/dots/lightbox per pnwmoths) is MEDIUM |
| Description length | 1–3 sentences, ID-cue focused (e.g. "male hind femur width >= height") | LOW (pure authoring) |
| Static map | Inline SVG, ~300×200px, WA outline + ecoregions in faint gray + dots for occurrences | MEDIUM (Python SVG generation in export.py); volunteers familiar with WA shape recognize ecoregions |
| Seasonality viz | Small inline chart, ~300×80px, see Capability 4 | MEDIUM |
| Frequency / rarity | Specimen count + WA-checklist status badge ("WSDA 2024 verified" / "likely-to-occur" / "first state record") | LOW once checklist is ingested |
| Link to SPA | "View N occurrences →" or photo-overlay button → `/collection?taxon=...` | LOW |
| Cards-per-row | 1 column on mobile, 2 columns on tablet, 3 on desktop wide | LOW (CSS grid) |
| Per-genus pagination | NOT NEEDED for genera ≤30 species; needed for Andrena (72), Lasioglossum (55), Osmia (50) | See below |

### Big-genus rendering — concrete options

**Andrena 72, Lasioglossum 55, Osmia 50.** A 3-column grid with ~360px-tall cards yields ~24 cards per scroll-screen. Andrena would be 3 scrolls. Options:

1. **No pagination, just scroll** — simplest. Anchor offset behavior matters (browser back-button must restore scroll position). LOW complexity.
2. **Subgenus collapse-by-default with "expand all" toggle** — Andrena has 6+ subgenera in WA; collapse each. Works only where subgenus is populated; fragile for partial data. MEDIUM.
3. **Lazy-render with IntersectionObserver** — render visible cards eagerly; defer SVG map / phenology chart until scrolled into view. MEDIUM. Performance win for big genera.
4. **Alphabetical in-page index** — ribbon of letters at top of genus, jump-to-letter. LOW.

Recommendation: **(1) + (3)**: render all cards but defer the map/chart rendering to first-paint when each card scrolls into view. This is straightforward with IntersectionObserver and matches what large-genus browsers (e.g. iNat taxon page galleries) do.

### Table stakes vs differentiators vs anti-features

**Table stakes:**
- Single hero photo per card — LOW once manifest exists.
- 1–3 sentence ID description — LOW (authored).
- Static SVG occurrence map per species — MEDIUM (Python codegen in export.py; one SVG per species per export).
- Inline seasonality viz per species — MEDIUM (see Capability 4).
- "View N occurrences in map" link to `/collection?taxon=...` — LOW.
- Specimen count badge — LOW.
- WA checklist status badge (verified / likely / new record) — LOW once checklist ingested.

**Differentiators:**
- Photo gallery with prev/next/lightbox (vs. single hero) — MEDIUM. Pnwmoths' `pnwm-image-slideshow.js` is portable.
- Lazy SVG/chart rendering via IntersectionObserver for big genera — MEDIUM. Worth it for Andrena/Lasioglossum/Osmia.
- "First WA record" / "rediscovered after N years" callouts on cards — LOW once checklist + first-record dates ingested. Strong narrative payoff (matches the WSDA news angle: "26 new or rare species").
- Sort cards by frequency (most-collected first) within a genus — LOW. Volunteers can build "what to expect" intuition faster.
- Click-photo-to-lightbox — LOW.

**Anti-features:**
- Per-card filtering UI (filter scope is page-level, not card-level) — would multiply state.
- Card flipping / 3D effects — fluff.
- Auto-playing image carousel — accessibility regression.
- Per-card comments / community discussion — cold-start.
- Embedding the SPA map inside a card — performance death; the link to `/collection?taxon=...` is the right affordance.

---

## Capability 3 — Photo Manifest Authoring Loop

### Findings

The pnwmoths repo authors photos via a flat CSV checked into the repo:

```csv
species_slug,filename,photographer,weight,license,view,specimen,navigational
abagrotis-apposita,Abagrotis apposita-A-D.jpg,Merrill A. Peterson,1,CC BY-NC-SA 4.0,dorsal,A,
abagrotis-apposita,Abagrotis apposita-A-V.jpg,Merrill A. Peterson,2,CC BY-NC-SA 4.0,ventral,A,
```

Files are hosted on a CDN (`https://pnwmoths.b-cdn.net/<slug>/<filename>`) — manifest entries are pure metadata. `weight` is sort order, `navigational: true` flags images suitable for the strips at collapsed levels. The species CSV is the source of truth for the taxonomic structure as well; both are joined at build time in `_data/species.js` and `_data/images.js` via in-memory DuckDB CSV reads.

**Implications for BeeAtlas** — the seed locks "TOML manifest checked into repo, photos via CDN, populated by query/algorithm at species-add time then manually editable, WABA + non-WABA CC-licensed acceptable." Pnwmoths confirms this is a working pattern at 1,348-species scale. TOML vs CSV is taste; CSV has the advantage that pnwmoths' DuckDB-backed `_data/*.js` pattern is directly portable.

### Photo source in the BeeAtlas world

- **WABA observations** (already in `inaturalist_waba_data.observations`): 1,374 observations, but the dlt pipeline does NOT currently capture photo arrays. `DEFAULT_FIELDS` in `waba_pipeline.py` has no `photos.*` or `observation_photos.*`. Adding them = field-list change + new dlt resource for the nested array. License is per-observation in `license_code` and per-photo (different field).
- **Generic iNat WA observations**: `inaturalist_data.observations` likewise has no photos. Same fix.
- **iNat default-photo for taxon**: `taxa/{id}` returns `default_photo` with attribution and url. This is the cheapest way to get one curated thumbnail per species (used by Atlas of Living Australia, GBIF and iNat species pages).

### License handling

- Default iNat license is **CC BY-NC**. Many users use CC BY, CC BY-SA, CC BY-NC-SA. All-rights-reserved is not usable.
- iNat photo URL pattern: `https://inaturalist-open-data.s3.amazonaws.com/photos/<photo_id>/<size>.<ext>` where size ∈ `square` (75px), `small` (240px), `medium` (500px), `large` (1024px), `original`.
- Attribution requirement (per iNat help): "© [name], some rights reserved (CC-BY-NC-SA)" plus link to license. Compositionally per-photo on the card.
- BeeAtlas constraint per seed: "WABA + non-WABA CC-licensed photos acceptable" — the manifest must accept BOTH sources. Photos external to iNat (e.g., specimen photos taken by Looney's lab) are also in scope.

### Concrete manifest schema (proposal)

```toml
# .planning/ or _data/species_photos/Andrena_milwaukeensis.toml — one file per species
species_slug = "andrena-milwaukeensis"
notes = "Optional. Internal-only authoring notes."

[[photo]]
source = "inat"            # one of: "inat", "external"
inat_observation_id = 12345678
inat_photo_id = 87654321   # specific photo within the observation
size = "medium"            # which size to use (square/small/medium/large/original)
caption = "Female on Salix sp., King Co., May 2024"
attribution = "© rainhead, some rights reserved (CC-BY-NC)"
license = "CC BY-NC 4.0"
order = 1                  # sort key
navigational = true        # show in collapsed-tree strips

[[photo]]
source = "external"
url = "https://example.org/path/to/specimen.jpg"
caption = "Pinned specimen, dorsal view"
attribution = "Photo: Joel Gardner"
license = "CC BY 4.0"
order = 2
navigational = false
```

Per-species TOML files (vs one giant manifest) keep diffs small and tractable for human edits.

### Authoring loop

1. **Auto-populate**: Python script (`scripts/seed_photos.py` or pipeline step) iterates each species in the WA checklist, queries iNat `/v2/taxa/{id}` for `default_photo` (1 image) plus `/v2/observations?taxon_id=X&quality_grade=research&photo_license=cc-by,cc-by-sa,cc-by-nc,cc-by-nc-sa&order=desc&order_by=votes&per_page=8` (top-voted research-grade photos), writes a baseline TOML per species.
2. **Manual edit**: maintainers open the TOML, reorder, swap, add captions, drop photos that don't help with ID.
3. **Build-time validation**: an Eleventy `_data/photos.js` reader (DuckDB-CSV pattern from pnwmoths, or just `@iarna/toml` since the manifest is small) loads all TOMLs, validates required fields, fails the build on missing license.
4. **Render**: `_data/photos.js` exposes a `bySpeciesSlug` map; the species card template reads `photos[slug]` and emits the hero + slideshow markup.

### Table stakes vs differentiators vs anti-features

**Table stakes:**
- TOML-per-species manifest checked into repo — LOW complexity for the schema; depends on photo provisioning.
- Build-time validation (required fields, license non-empty) — LOW.
- Attribution rendered on every photo display — LOW.
- License field captured per photo — LOW.

**Differentiators:**
- Auto-seed script that populates a starter manifest from iNat queries — MEDIUM. Saves enormous time for 565+ species.
- Per-photo `view` (dorsal/lateral/face) and `specimen` (live/pinned/in-flight) tags — LOW. Lets the gallery group "ID-helpful angles" first.
- "Best photo for ID" flag separate from `navigational` — LOW. Pnwmoths conflates the two.
- Caching the iNat thumbnails to S3 / CloudFront so the site doesn't depend on iNat uptime — MEDIUM. Mirrors what we already do for parquet + GeoJSON; consistent with static-hosting constraint.

**Anti-features:**
- Build-time iNat fetch (locked OUT in seed) — would create rate limits and flaky builds.
- Photo upload UI on the live site — community-feature territory; cold-start risk.
- Auto-rotating photo selection by popularity — non-determinism breaks reproducible builds and is not what curation means.
- Embedding the iNat photo via iframe — performance + reliability + license-display headaches.

---

## Capability 4 — Seasonality Viz (Wiley / BeeSearch Format)

### What the BeeSearch ridge plots actually do (verbatim from `ridge_plots.Rmd`)

```r
geom_density_ridges(aes(height = stat(density)),
                    scale = 5,
                    rel_min_height = 0.01,
                    stat = "density",
                    bw = "bcv")  # biased cross-validation
```

**Concrete spec:**

| Aspect | Value |
|--------|-------|
| **X-axis** | `week = lubridate::week(Date)` — week of year, 1–53 |
| **X-axis labels** | "3 March" (week 10), "15 May" (week 20), "24 July" (week 30), "3 October" (week 40) |
| **Y-axis** | Stat density (kernel-smoothed proportion of records). NOT raw count. |
| **Grouping** | One ridge per genus (or species, or subgenus) |
| **Ordering** | Sorted by `peak = Mode(week)` descending — earliest-peaking taxa at top |
| **Encoding** | Density ridges via `ggridges::geom_density_ridges` — overlapping translucent areas, like a stacked phenology |
| **Smoothing** | Genus-level: `bw = "bcv"` (biased cross-validation; better for multi-modal multivoltine species). Species-level: Silverman's rule of thumb (Gaussian-assumption default). The paper uses "Scott's method for univoltine, bcv for multivoltine"; the published Rmd unconditionally uses bcv at genus level. |
| **Sample size threshold** | Genus-level: `n > 19` (i.e. ≥20 records per genus). Species-level: `n >= 20`. Below threshold = exclude. |
| **Sample size annotation** | Right-margin text label: "*" 20–49, "**" 50–99, "***" 100–999, "****" ≥1000, plus the raw `n`. |
| **Season markers** | Vertical dashed lines at week 12.6 (~21 March), 25.3 (~21 June), 38.4 (~21 September) — equinoxes/solstices. Annotations: "Winter / Spring / Summer / Fall." |
| **Y-axis style** | Italic text (`element_text(face = "italic")`) for genus/species names. |
| **Color** | Per-genus color palette (`c24` 24-color qualitative). Phenology-by-phylogeny variant uses family color instead. |

### How this maps to v3.2 species cards

The BeeSearch ridge plot is a **multi-taxon comparative chart** (one figure with 19 genera). On a species CARD, we have one taxon. So the per-card seasonality viz is closer to **a single ridge** or, equivalently, **a kernel-smoothed area chart**:

- X-axis: week of year, 1–53 (or month, if simpler)
- Y-axis: density (smoothed proportion) OR raw count
- Encoding: filled area under a smoothed line (Bezier or kernel density)
- Sample size guard: do not render if `n < 20`; show "Insufficient data (n=4)" instead

For the per-card use, simpler may be better than ridges:

| Encoding option | Pros | Cons |
|-----------------|------|------|
| Monthly bar chart (12 bars) | Simple, no smoothing decisions, pnwmoths-pattern (`pnwm-phenology-chart.js` does exactly this with Chart.js) | Lower resolution; smooths over sub-month timing |
| Weekly bar chart (53 bars) | Higher resolution | Visually noisy at card scale (~300×80px) |
| Kernel-density area (BeeSearch ridge w/o ridges) | Captures bimodal multivoltine species elegantly | Needs density estimation in JS or pre-computed at build |
| Heatmap strip (single row, 52 cells) | Compact, comparable across cards | Low pop-out for peaks |
| Cumulative emergence curve | Highlights early/late species | Less intuitive for "when do I find this?" |

Recommendation: **kernel-density area chart** for v3.2 cards (matches the seed's "mimic Wiley format" ask) with **monthly bars as a fallback when n < 20 and ≥5** — the bar form survives small samples; the smoothed area becomes meaningless. Below n=5, render text only ("3 records, May–June").

### Computation strategy

Two options for computing the density per species:

1. **Pre-compute at export time in Python** — `data/export.py` generates a `seasonality.json` with `{species_slug: { density: [53 floats], n: int }}`. KDE in scipy or numpy. Static JSON loaded once on the species page. Build-time cost; simple frontend. **Recommended for v3.2.**
2. **Compute in-browser** — load occurrences, filter by species, KDE in JS. Reuses existing in-browser SQLite. Higher CPU; lazy-render-on-scroll mitigates cost. Defer to a future milestone.

The same `seasonality.json` powers both (a) per-card single-species charts and (b) a future cross-genus ridge plot (a-la BeeSearch) if added later.

### Filter interaction

When the page-level geographic filter narrows occurrences (e.g. King County only), per-species seasonality should re-compute against the filtered subset. **This forces option 2 (in-browser KDE)** unless we accept that v3.2 ships with seasonality only over the full WA dataset, ignoring geo filters. Per the seed's emphasis on "Which species of *Eucera* are present in this ecoregion?" — geographic filtering is core, so seasonality SHOULD respond. But interactive re-KDE per filter change for 565 species is an emerging performance concern.

Tractable middle ground: **pre-compute seasonality per species per ecoregion-l3 (≤11 ecoregions)** as well as per-county (≤39 counties) at export time. Storage cost: 565 species × (1 + 11 + 39) × 53 weeks × 4 bytes ≈ 6 MB. Fine. Filter logic looks up the right pre-computed bin. NO in-browser KDE.

### Table stakes vs differentiators vs anti-features

**Table stakes:**
- Per-species seasonality chart on each card — MEDIUM complexity (export-time JSON + Lit chart component).
- Sample-size guard (n<20: bars; n<5: text only) — LOW.
- Compatible with page-level geographic filter (full WA, per ecoregion, per county pre-computed) — MEDIUM.
- X-axis labels with month names (or BeeSearch-style "3 March / 15 May / ...") — LOW.

**Differentiators:**
- Kernel-density smoothed area encoding (true Wiley/BeeSearch mimicry) — MEDIUM. Bars are the safer fallback.
- Season-band background tinting (winter/spring/summer/fall) — LOW. Strong visual orientation per BeeSearch.
- Per-card sample-size badge with star ratings (`***` 100+, etc., per BeeSearch) — LOW. Conveys data quality at a glance.
- Cross-species ridge plot at the genus level (when a genus is expanded) — MEDIUM. Direct BeeSearch parity; volunteers can compare congeners.
- Sex-disaggregated seasonality (males emerge first in many genera) — LOW data, MEDIUM viz complexity. Defer.
- Year-over-year overlay or year filter — defer.

**Anti-features:**
- 3D temporal heatmap — overkill.
- Animated phenology over years — fluff at this scale.
- Phylogenetic tree alongside the timeline — out of scope; pretty in BeeSearch but a research output, not a volunteer affordance.
- Comparing all 565 species on one chart — useless density.

---

## Capability 5 — WA State Checklist Integration

### Findings

The authoritative source is **Bartholomew, Murray, Bossert, Gardner & Looney (2024). An annotated checklist of the bees of Washington state. *Journal of Hymenoptera Research*.** [https://jhr.pensoft.net/article/129013/](https://jhr.pensoft.net/article/129013/). 565 high-confidence species + 102 likely. Pensoft TOC indicates family / subfamily / tribe / genus structure, plus a "likely to occur" appendix. Supplementary data downloads listed as XML / PDF (CSV unconfirmed but commonly available on Pensoft articles).

The Washington Bee Atlas project itself (WSDA) is the volunteer-collection effort; it does NOT publish a separate checklist — it cites the 2024 paper. So the checklist source is unambiguous: **the 2024 paper supplement.**

### Inclusion semantics — proposal

| Case | Treatment |
|------|-----------|
| On checklist (verified) AND has occurrences | Card rendered. Default state. |
| On checklist (verified) AND no occurrences in our data | Card rendered with "WA-listed; not yet in atlas" badge. Map blank or shows ecoregion-suitability silhouette. Phenology says "no records yet." |
| On checklist (likely-to-occur) AND has occurrences | Card rendered with "Range expansion / first state record" badge. High-narrative-value (matches WSDA news framing). |
| On checklist (likely-to-occur) AND no occurrences | Card rendered with "Possible in WA" badge; deprioritized in sort order. |
| NOT on checklist AND has occurrences | Card rendered with "Unverified — not in 2024 checklist" warning. Alert maintainers via build report. |
| NOT on checklist AND no occurrences | Not rendered. (Trivially true.) |

This treats the checklist as the **set of cards** and occurrence data as the **content of cards**, NOT the other way around. The seed implicitly endorses this: "selecting a subgenus shows all species under it (with specimen data **or** in the WA state checklist)."

### Ingestion

- Add a fifth dlt-or-sql data source: `data/checklist_pipeline.py` reads the supplement (CSV or XLSX from Pensoft), populates `beeatlas.duckdb.checklist.species(family, subfamily, tribe, genus, subgenus, specific_epithet, status, first_state_record_year, source_url)`.
- `export.py` joins occurrences against the checklist and produces `species.parquet` (or JSON) with one row per checklist species, plus aggregates: `n_occurrences`, `n_counties`, `n_ecoregions`, `first_observed_date`, `most_recent_date`.
- Eleventy `_data/species.js` loads `species.parquet` (DuckDB-CSV pattern from pnwmoths, but with parquet) → exposes hierarchical tree to templates and Lit components.

### Table stakes vs differentiators vs anti-features

**Table stakes:**
- Ingest the 2024 checklist as a structured table — MEDIUM complexity (depends on supplement format; XLSX needs a parser; CSV is trivial).
- "WA-listed, no records yet" cards rendered — LOW once ingested.
- "First state record" / "rediscovered" badges — LOW once status field exists.
- Hierarchy from checklist (family/subfamily/tribe/genus) feeds the left-rail nav — LOW once ingested.

**Differentiators:**
- Phenology badges on checklist-only cards (silhouette suitability based on neighboring-state data) — out-of-scope speculation; defer.
- Auto-flag occurrence records with species missing from checklist — LOW. Build report only; valuable for data hygiene.
- Show "next likely species" recommendations on the page (likely-to-occur not-yet-found) — LOW; matches the WSDA "27 new records" narrative; high engagement value.

**Anti-features:**
- Manual species-list editing in the repo (i.e., bypassing the checklist) — would diverge from authoritative source; introduces drift.
- Per-volunteer custom checklists — community feature; cold-start risk.

---

## Capability 6 — Filter UX on a Single Page

### Constraints

- Up to 565 cards rendered (all WA species). Realistically ~100–200 visible at any time once a tribe or genus is expanded.
- Existing filter infrastructure: 250K+ specimens already in SQLite WASM in-browser (`v2.6 SQLite WASM Migration`); occurrence data available; geographic + temporal filtering already implemented in the SPA.
- Seed locks filter scope to **geography + seasonality only** for v3.2. Attribute filters (eye color, ID character) deferred.

### Findings

Single-page filter UX patterns from biodiversity sites:

1. **Filter bar at top, cards reflow below** — most common (ALA, GBIF, BugGuide). Simple. No URL-anchoring complexity.
2. **Sticky left rail nav + sticky top filter bar** — pnwmoths uses the inline rail-as-content pattern (filter is in the rail, not a separate bar). Works because pnwmoths filters by state only.
3. **Breadcrumb trail** — for "Andrena → spring → King County" trail visibility. Low complexity.
4. **Mute-not-hide** — pnwmoths' D-06; preserves orientation.

### Recommendation

| Aspect | Recommendation | Complexity |
|--------|---------------|-----------|
| Filter scope | Geographic (county OR ecoregion-l3) + seasonality (month range) | LOW (matches existing SPA idioms) |
| Filter placement | Sticky top bar on the species page (separate from left rail) | LOW |
| Filter result encoding | URL-encoded params: `?county=King&ecor=Cascades&m0=4&m1=8` (subset of existing SPA URL grammar) | LOW |
| Cards behavior | Mute-not-hide (opacity 0.35 on cards with zero records under filter) | LOW |
| Counts on cards | Always show "N records" (filtered count, not total) | LOW |
| Breadcrumb | "Andrena · April–August · King County" pill row above the cards, dismissable per-pill | LOW |
| Empty state | If 0 species match, show "No bee species recorded in [filter]. Try broadening." | LOW |
| In-browser performance | Pre-computed per-county / per-ecoregion / per-month aggregates per species; filter = lookup, not query | LOW–MEDIUM |
| Scroll behavior | Anchor preserved on filter change | LOW (browser default if no DOM removal; mute-not-hide guarantees this) |

### Why no in-browser SQLite query for the species-page filter

The SPA filter uses SQLite WASM because it queries 250K rows. The species page renders 565 cards; each card needs `n_records_under_filter`. If we pre-compute aggregates as `species_counts.parquet` with keys `(species_slug, county, ecoregion_l3, month)` or as a JSON flattened lookup, the filter becomes a Map lookup at ~5ms total — no SQLite needed. This is a cleaner separation: the species page's data needs are fundamentally smaller, and re-using the SQLite layer would over-engineer it.

That said, **for the per-species seasonality chart re-rendering under filter** (Capability 4), the same pre-computed lookup table covers the case if we pre-bin by week-of-year across ecoregion / county dimensions.

### Table stakes vs differentiators vs anti-features

**Table stakes:**
- County multi-select OR ecoregion-l3 multi-select — LOW (existing SPA filter idioms).
- Month range — LOW (existing SPA filter).
- URL round-trip — LOW (existing SPA URL grammar to extend).
- Mute-not-hide cards — LOW.
- Per-card filtered record count — LOW.
- Pre-computed aggregates — MEDIUM (export.py extension).

**Differentiators:**
- Breadcrumb pill trail — LOW. High UX value.
- "Snapshot" share button (copy filtered URL) — already an SPA capability; portable. LOW.
- Sort-by-frequency under current filter — LOW.
- Group-by-tribe toggle (vs. flat by genus) — LOW.

**Anti-features (per seed lock):**
- Attribute filters (eye color, ID character, ease of photo ID) — DEFERRED to a later milestone. Deserves its own design activity per the seed.
- Cross-table joins to floral hosts — out of scope for v3.2 (cool but feature creep).
- Year filter — out of scope (the species page is about "where + when of year"; year filtering is for the SPA).
- Free-text search (already in SPA via taxon datalist) — duplicating the SPA.

---

## Cross-Cutting: Dependencies on Existing BeeAtlas Data

### Already available — use as-is

- `occurrences.parquet`: family, genus, scientificName, lat, lon, year, month, county, ecoregion_l3, host_observation_id, specimen_observation_id, is_provisional, inat_quality_grade — directly usable.
- `counties.geojson`, `ecoregions.geojson`: usable for static SVG occurrence-map generation.
- iNat WABA observations (`inaturalist_waba_data.observations`): available; could be primary photo source via re-fetched photo arrays.
- iNat WABA `taxon_lineage`: has `(taxon_id, genus, family)` only — needs tribe added.

### Must be added in v3.2

| Dependency | What's needed | Complexity | Impact if not done |
|------------|---------------|-----------|-------------------|
| WA checklist ingestion | `checklist_pipeline.py` reads Bartholomew et al. 2024 supplement; populates checklist table | MEDIUM (paper supplement parsing + schema mapping) | No way to render "listed but not collected" cards; tree is incomplete |
| Tribe data | Hard-coded CSV from checklist OR iNat ancestor-walk in `enrich_taxon_lineage` | LOW or MEDIUM | Tree skips a level; volunteers can't browse by tribe |
| Photo manifest schema | TOML files in `_data/species_photos/` + Eleventy `_data/photos.js` reader | LOW | No photos on cards; cards are text-only |
| Photo provisioning | `scripts/seed_photos.py` populates baseline manifest from iNat | MEDIUM | Authoring 565 manifests by hand is a job; auto-seed is the MVP unblocker |
| iNat photo capture in pipeline | Add `taxon.default_photo`, `photos`, `observation_photos` to `inat_pipeline.py` and `waba_pipeline.py` DEFAULT_FIELDS | MEDIUM | If photos are ONLY external-CDN, no fallback; site uptime depends on iNat |
| Photo CDN strategy | S3 mirroring (a-la pnwmoths' bunny.net) OR direct iNat URLs OR mix | LOW–MEDIUM | iNat URLs work but couple to iNat uptime; mirroring matches our data-pipeline static-asset pattern |
| Per-species aggregate parquet | `species.parquet` with n_occurrences, n_counties, n_ecoregions, first/last dates, per-(county,ecoregion,month) counts | MEDIUM | Filter UX has to query SQLite per-card (slow) instead of doing Map lookups |
| Per-species seasonality JSON | `seasonality.json` with KDE arrays per species per geography slice | MEDIUM | No phenology viz on cards (deal-breaker per seed) |
| Static SVG occurrence maps | `data/export_species_maps.py` or extension of `export.py` generates one SVG per species | MEDIUM | No per-species map (deal-breaker per seed) |
| Subgenus completion | Either (a) iNat-driven gap-fill, (b) checklist-driven (Bartholomew supplement has it), or (c) skip the subgenus level | LOW–MEDIUM | If skipped, big-genus rendering relies on scroll only (acceptable per Capability 2 recommendation) |

### Pipeline ordering

The `data/run.py` STEPS sequence currently is `geographies → ecdysis → inat → projects → export`. v3.2 inserts:
1. `checklist` (after geographies) — independent of occurrences; can run early.
2. `enrich_taxon_lineage` for tribe — extends WABA pipeline; runs after waba.
3. Photo seed/refresh — separate manual-trigger script; not on the nightly cron path.
4. `export_species_artifacts` (species.parquet, seasonality.json, per-species SVG maps) — runs in `export.py` after `export_occurrences_parquet`.

---

## MVP Recommendation

For v3.2, ship in this order:

1. **Checklist ingestion + WA species table** (P1 — gates everything).
2. **Tribe data** (CSV from checklist supplement, fast path).
3. **Left-rail taxon browser** (pnwmoths-pattern, expand-on-click, no-JS fallback).
4. **Species cards with hero photo + 1–3 sentence description** (text-and-photo MVP).
5. **Photo manifest** (TOML schema + auto-seed script + manual-edit loop).
6. **Static SVG per-species occurrence maps** (Python-generated, embedded inline).
7. **Per-species seasonality chart** (monthly bars first, kernel-density area as upgrade).
8. **Page-level filter** (county + ecoregion + month range; URL round-trip; mute-not-hide).
9. **Per-card link to SPA pre-filtered** (`/collection?taxon=...`).

**Defer to v3.3+:**
- Photo lightbox/slideshow (single hero is fine for MVP).
- Photo S3 mirroring (direct iNat URLs are acceptable initially).
- Cross-genus ridge plot at genus level (single-species seasonality is the MVP).
- Sex-disaggregated phenology.
- "First state record" callouts (data is there; LOW polish; trivially additive in v3.3).
- Subgenus tree level (rendering only when populated; most genera don't qualify).
- Lazy-render-on-scroll for big genera (only needed if Andrena page perf is bad).
- Year filter / year-over-year overlay.

**Explicitly deferred per seed (do NOT build in v3.2):**
- Attribute filters (eye color, ID character, ease of photo ID).
- Species detail pages.
- Build-time iNat photo fetch.
- Identification key.

---

## Sources

Direct on-disk reads:
- `~/dev/BeeSearch/analyses/ridge_plots.Rmd`, `analyses/ridge_plots.md`, `analyses/genus_plots_v2.Rmd`
- `~/dev/pnwmoths/src/components/{pnwm-taxon-browser.js,pnwm-phenology-chart.js,pnwm-occurrence-map.js,pnwm-image-slideshow.js,pnwm-filter-bar.js,parquet-cache.js}`
- `~/dev/pnwmoths/src/_data/{species.js,images.js,taxon.js}`
- `~/dev/pnwmoths/src/{species/species.njk,browse/index.njk}`
- `~/dev/pnwmoths/data/{species.csv,images.csv}`
- `~/dev/beeatlas/data/{export.py,ecdysis_pipeline.py,inaturalist_pipeline.py,waba_pipeline.py,beeatlas.duckdb}` (DuckDB introspected)
- `~/dev/beeatlas/scripts/validate-schema.mjs`

Web research:
- [PNW Moths field guide](https://pnwmoths.biol.wwu.edu/) — site front-end
- [An annotated checklist of the bees of Washington state (Bartholomew, Murray, Bossert, Gardner, Looney 2024)](https://jhr.pensoft.net/article/129013/) — 565 species + 102 likely; family/subfamily/tribe/genus hierarchy in supplement
- [Structure of Bee Communities in Marginal Lands of the Puget Sound, USA (Sugden 2025)](https://onlinelibrary.wiley.com/doi/10.1002/ece3.72049) — published BeeSearch paper; ridge plot is Figure 3 / 4 / etc.
- [Atlas of Living Australia](https://www.ala.org.au/) — species-page conventions (occurrence map + classification tabs + spatial-layer overlays)
- [WSDA Bee Atlas](https://agr.wa.gov/departments/insects-pests-and-weeds/insects/apiary-pollinators/pollinator-health/bee-atlas) — context for project framing
- [iNaturalist photo licensing & API](https://www.inaturalist.org/posts/10306-creative-commons-licensing-on-images) and [iNat help on photo reuse](https://help.inaturalist.org/en/support/solutions/articles/151000169918-can-i-use-the-photos-and-sounds-that-are-posted-on-inaturalist-) — license codes, attribution format, photo URL patterns
- [Discover Life bee species guide and world checklist (Ascher & Pickering, 2024)](https://www.discoverlife.org/mp/20q?guide=Apoidea_species) — bee species browser conventions
