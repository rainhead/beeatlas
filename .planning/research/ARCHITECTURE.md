# Architecture Research — v3.2 Species Tab Integration

**Domain:** Species exploration page integrated with existing static-hosted BeeAtlas (Eleventy + Vite + Lit + wa-sqlite SPA)
**Researched:** 2026-05-02
**Confidence:** HIGH for integration patterns (all referenced files read end-to-end); MEDIUM for tribe/subgenus taxonomy source (no existing pipeline carries those columns yet — fill plan below)

This document focuses on **NEW capabilities and how they integrate** with the v3.1 Eleventy/Vite scaffold. The existing SPA architecture (`<bee-atlas>` coordinator, wa-sqlite + hyparquet, occurrences.parquet schema) is assumed and only referenced where the species page touches it.

---

## 1. System Overview — Species Tab Additions

```
                        ┌─────────────────────────────────────────────────┐
                        │  data/run.py (maderas nightly cron)             │
                        │                                                 │
                        │  geographies → ecdysis → ecdysis-links →        │
                        │  inaturalist → waba → projects → anti-entropy → │
                        │  checklist (NEW)  ──┐                           │
                        │                     ├─► export (UNCHANGED)      │
                        │                     │       └─► occurrences.parquet
                        │                     ├─► species_export (NEW)    │
                        │                     │       ├─► species.parquet (NEW)
                        │                     │       └─► species/<slug>.json (NEW, optional)
                        │                     ├─► species_maps (NEW)      │
                        │                     │       └─► species-maps/<slug>.svg
                        │                     └─► feeds (UNCHANGED)       │
                        └────────────────┬────────────────────────────────┘
                                         │  s3 sync (nightly.sh)
                                         ▼
              ┌─────────────────────────────────────────────────────┐
              │  CloudFront /data/                                  │
              │    occurrences.parquet                              │
              │    counties.geojson, ecoregions.geojson             │
              │    species.parquet              (NEW)               │
              │    species-maps/<slug>.svg      (NEW, ~700 files)   │
              │    species-photos.toml          (NEW, OR /data/...) │
              │    feeds/*.xml                                       │
              └────────────┬────────────────────────────────────────┘
                           │ runtime fetch
                           ▼
       ┌────────────────────────────────────────────────────────────┐
       │  Static site (Eleventy + Vite plugin, single MPA)          │
       │                                                            │
       │  /  (SPA — _pages/index.html)                              │
       │     └─ src/bee-atlas.ts → wa-sqlite + Mapbox + …           │
       │                                                            │
       │  /species/  (NEW — _pages/species.njk + layout: default)   │
       │     └─ src/entries/species.ts  (NEW Vite entry)            │
       │           └─ <bee-species-page>          (coordinator)     │
       │              ├─ <bee-taxon-nav>          (left rail)       │
       │              ├─ <bee-species-grid>       (cards)           │
       │              │    └─ <bee-species-card>                    │
       │              │         (photos, SVG map, seasonality,      │
       │              │          deep-link to /?taxon=...)          │
       │              └─ <bee-species-filter>     (geo + season)    │
       │                                                            │
       │  /_scaffold-check/  (existing diagnostic page)             │
       └────────────────────────────────────────────────────────────┘

  Build-time sources (Eleventy `_data/`):
       _data/build.js            (existing — git SHA, versions)
       _data/species.js          (NEW — reads species.parquet via hyparquet
                                   server-side; powers static taxon nav)
       _data/photos.js           (NEW — reads species-photos.toml)
```

### Integration philosophy

1. **Aggregations are nightly (build/pipeline-time), not page-load-time.** The species page must not refetch occurrences.parquet (1.2 MB) just to count rows per species — every species card would otherwise wait on a multi-second SQLite warm-up. Instead, `data/species_export.py` precomputes a small `species.parquet` (≈700 rows × ~15 cols) and Eleventy bakes the navigation tree into the static HTML at build time.
2. **The species page does NOT load wa-sqlite.** It is a separate Vite entry from `bee-atlas.ts`; loading 1.7 MB of mapbox-gl + the SQLite WASM worker on a static-photos page would defeat the purpose. Filtering on the species page operates over the pre-baked card list (DOM-level filter) plus optional fetched JSON.
3. **The SPA is a permalink target, not embedded.** Each species card links to `/?taxon=<scientificName>&taxonRank=species` to drive the existing SPA's URL-state restore (verified — see §6).
4. **Photo manifest is build-input, not runtime data.** The TOML lives in the repo (small, hand-edited), and is rendered into static HTML at Eleventy build. No fetch round-trip.

---

## 2. Component Responsibilities

| Layer | Component / Module | Owns | Reads | Emits |
|-------|--------------------|------|-------|-------|
| Pipeline | `data/checklist_pipeline.py` (NEW) | `checklist_data.species` table in DuckDB | committed CSV/TSV at `data/checklists/wa_bee_checklist.csv` | rows: `(scientificName, family, subfamily, tribe, genus, subgenus, specific_epithet, source, notes)` |
| Pipeline | `data/species_export.py` (NEW) | `public/data/species.parquet` (one row per species) | `ecdysis_data.occurrences`, `ecdysis_data.identifications`, `inaturalist_waba_data.taxon_lineage`, `checklist_data.species`, `inaturalist_data.observations` (for tribe gap-fill) | parquet with: `scientificName`, `family`, `subfamily`, `tribe`, `genus`, `subgenus`, `specific_epithet`, `on_checklist BOOLEAN`, `occurrence_count`, `specimen_count`, `provisional_count`, `first_occurrence_date`, `last_occurrence_date`, `month_histogram` (e.g. `INT[12]`), `county_count`, `slug` |
| Pipeline | `data/species_maps.py` (NEW) | `public/data/species-maps/<slug>.svg` | `species.parquet` + `geographies.us_counties` (WA) + `occurrences.parquet` | one SVG per species |
| Authoring | `content/species-photos.toml` (NEW, repo-checked-in) | per-species photo lists | hand-edited; optional helper `scripts/seed-species-photos.mjs` for first-population from iNat | n/a (read at Eleventy build) |
| Validation | `scripts/validate-species.mjs` (NEW) | TOML schema + photo-id lookup against species.parquet | `content/species-photos.toml`, `public/data/species.parquet` | exits non-zero on schema or referential-integrity errors |
| Build (Eleventy) | `_data/species.js` (NEW) | hierarchical taxon tree exposed to all `.njk` pages | `public/data/species.parquet` (via hyparquet) | default-export: `{ tree, flat, byScientificName }` |
| Build (Eleventy) | `_data/photos.js` (NEW) | per-species photo lists keyed by scientific name | `content/species-photos.toml` | default-export: `Record<string, Photo[]>` |
| Page | `_pages/species.njk` (NEW) | the species page template; emits one card placeholder per species | `species`, `photos`, `build` from `_data/` | static HTML rendered by Eleventy |
| Frontend | `src/entries/species.ts` (NEW) | side-effect import that registers `<bee-species-page>` and children | n/a | n/a (Vite entry) |
| Frontend | `src/species/bee-species-page.ts` (NEW) | reactive state for the species page (active taxon path, geo filter, month filter) | URL search params; `<bee-species-card>` slots | URL state writes; child property pushes |
| Frontend | `src/species/bee-taxon-nav.ts` (NEW) | renders the family→…→subgenus tree; emits selection | tree as `@property` | `taxon-selected` event |
| Frontend | `src/species/bee-species-grid.ts` (NEW) | shows/hides cards for the active subgenus; applies geo + season filter | active path, filter; cards as light-DOM children | n/a |
| Frontend | `src/species/bee-species-card.ts` (NEW) | a single card: photo carousel, embedded SVG map, seasonality viz, deep-link button | per-species props passed by Eleventy as data attributes | click → navigate to `/?taxon=...` |
| Frontend | `src/species/bee-species-filter.ts` (NEW) | geography (county/ecoregion) + month/season inputs | option lists from `_data/species.js` | `species-filter-changed` event |
| Frontend | `src/species/seasonality-viz.ts` (NEW) | renders the Wiley `10.1002/ece3.72049`-style chart from `month_histogram` | per-species 12-int array | n/a |

### Coordinator state ownership (ARCH-03 invariant)

`<bee-species-page>` is the **species-page analogue of `<bee-atlas>`**. It owns:

- `_activeTaxonPath: { family, subfamily, tribe, genus, subgenus } | null`
- `_geoFilter: { counties: Set<string>; ecoregions: Set<string> }`
- `_seasonFilter: { months: Set<number> }`
- URL state (read on `connectedCallback`, written via `replaceState` on filter changes)

`<bee-taxon-nav>`, `<bee-species-grid>`, `<bee-species-card>`, `<bee-species-filter>` are **pure presenters** — they receive state via `@property` and emit `CustomEvent`s. They MUST NOT import from `bee-species-page.ts` (mirrors the existing `bee-sidebar` rule that triggered `FeedEntry` local-definition decision in v2.2).

### What the species page does NOT import

To keep bundle size sane and avoid the SQLite cold-start cost:

- ❌ no `mapbox-gl`
- ❌ no `wa-sqlite`
- ❌ no `hyparquet` (runtime — it's used only build-time in `_data/species.js`)
- ❌ no `src/sqlite.ts`, `src/filter.ts`, `src/bee-map.ts`, `src/bee-atlas.ts`

These are enforced by:
1. Vite's automatic per-entry chunking (separate entry → separate vendor chunk graph).
2. A new ARCH-04 source-analysis test (`src/tests/arch.test.ts` already uses `readFileSync` to enforce import contracts; extend it to assert that `src/species/**.ts` doesn't import `mapbox-gl`, `wa-sqlite`, or `bee-atlas.ts`).

---

## 3. Data Flow — Per-Species Aggregations

### 3.1 Recommendation: **Python build step** (option A)

Aggregation is performed in `data/species_export.py` running on the maderas nightly cron. It writes `public/data/species.parquet` alongside `occurrences.parquet`. Trade-off ladder:

| Option | Where aggregation runs | Pros | Cons | Verdict |
|--------|------------------------|------|------|---------|
| **A. Python pipeline (`species_export.py`)** | maderas nightly | Reuses existing DuckDB connection; trivial joins to checklist + taxon_lineage; freshness guaranteed (same cron as occurrences); single artifact in S3 cache pattern | New module to maintain | **CHOSEN** |
| B. Eleventy build via duckdb-node | CI build (every push to `main`) | Always-fresh aggregation regardless of pipeline timing | Requires duckdb npm dep in CI; aggregation re-runs even when occurrences don't change; pulls 1.2 MB parquet over network for each CI build | Rejected — CI cost, new dep |
| C. Client-side via wa-sqlite at page load | browser | No new pipeline step | Defeats the whole point of the species page being lightweight; 1.2 MB parquet + SQLite warm-up on a "browse photos" page; redundant with SPA | Rejected — UX regression |

### 3.2 `species_export.py` SQL sketch

```python
# data/species_export.py
"""Export per-species aggregations.

Produces public/data/species.parquet — one row per species.
"""
def export_species_parquet(con):
    out = str(ASSETS_DIR / "species.parquet")
    con.execute(f"""
    COPY (
      WITH wa_observed AS (
        SELECT
          o.scientific_name,
          o.family,
          o.genus,
          regexp_extract(o.scientific_name, '^[^ ]+ +([^ ]+)', 1) AS specific_epithet,
          o.id          AS ecdysis_id,
          o.event_date,
          o.month::INT  AS month,
          -- county already joined upstream in occurrences.parquet, but we re-join
          -- here so species.parquet doesn't depend on the export ordering.
          c.county
        FROM ecdysis_data.occurrences o
        LEFT JOIN ...   -- spatial join mirroring export.py county logic
        WHERE o.scientific_name IS NOT NULL AND o.scientific_name != ''
      ),
      agg AS (
        SELECT
          scientific_name AS scientificName,
          ANY_VALUE(family) AS family,
          ANY_VALUE(genus)  AS genus,
          ANY_VALUE(specific_epithet) AS specific_epithet,
          COUNT(*)                      AS occurrence_count,
          COUNT(DISTINCT ecdysis_id)    AS specimen_count,
          MIN(event_date)               AS first_occurrence_date,
          MAX(event_date)               AS last_occurrence_date,
          COUNT(DISTINCT county)        AS county_count,
          -- 12-element month histogram (NULL months filtered)
          [
            COUNT(*) FILTER (WHERE month=1), COUNT(*) FILTER (WHERE month=2),
            ... -- 3..12
          ] AS month_histogram
        FROM wa_observed
        GROUP BY scientific_name
      ),
      checklist AS (
        SELECT scientificName, family, subfamily, tribe, genus, subgenus,
               specific_epithet, TRUE AS on_checklist
        FROM checklist_data.species
      ),
      tribe_lookup AS (
        -- iNat fills tribe / subfamily / subgenus gaps for species observed but not on checklist
        SELECT taxon__name AS scientificName,
               -- ancestors-derived columns; see waba_pipeline.enrich_taxon_lineage
               -- but extended for tribe/subfamily/subgenus
               subfamily, tribe, subgenus
        FROM inaturalist_data.taxon_lineage_extended  -- NEW table; see §5
      )
      SELECT
        COALESCE(a.scientificName, c.scientificName) AS scientificName,
        COALESCE(c.family, a.family)                 AS family,
        COALESCE(c.subfamily, t.subfamily)           AS subfamily,
        COALESCE(c.tribe, t.tribe)                   AS tribe,
        COALESCE(c.genus, a.genus)                   AS genus,
        COALESCE(c.subgenus, t.subgenus)             AS subgenus,
        COALESCE(c.specific_epithet, a.specific_epithet) AS specific_epithet,
        COALESCE(c.on_checklist, FALSE)              AS on_checklist,
        COALESCE(a.occurrence_count, 0)              AS occurrence_count,
        COALESCE(a.specimen_count, 0)                AS specimen_count,
        a.first_occurrence_date,
        a.last_occurrence_date,
        a.month_histogram,
        COALESCE(a.county_count, 0)                  AS county_count,
        -- URL slug: lowercase scientific name, spaces → hyphens
        regexp_replace(lower(COALESCE(a.scientificName, c.scientificName)), '\\s+', '-', 'g') AS slug
      FROM agg a
      FULL OUTER JOIN checklist c ON a.scientificName = c.scientificName
      LEFT  JOIN tribe_lookup t ON t.scientificName = COALESCE(a.scientificName, c.scientificName)
    ) TO '{out}' (FORMAT PARQUET, CODEC 'SNAPPY')
    """)
```

**FULL OUTER JOIN with the checklist** — preserves both (a) species observed but not on the WA list (e.g. introduced/wandering records) so they still appear in the nav as "observed only," and (b) checklist species with zero observations so volunteers see "expected here, not yet collected."

### 3.3 Build-time consumption (`_data/species.js`)

```javascript
// _data/species.js — build-time read of species.parquet
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const parquetPath = join(here, '..', 'public', 'data', 'species.parquet');

export default async function () {
  const file = await asyncBufferFromFile(parquetPath);
  const rows = await parquetReadObjects({ file });

  // Build hierarchical tree: family → subfamily → tribe → genus → subgenus → species[]
  const tree = {};
  for (const r of rows) {
    const path = [r.family, r.subfamily ?? '(no subfamily)', r.tribe ?? '(no tribe)',
                  r.genus, r.subgenus ?? '(no subgenus)'];
    let node = tree;
    for (const seg of path) node = (node[seg] ??= {});
    (node._species ??= []).push(r);
  }

  // Index by scientific name for photos.js cross-reference
  const byScientificName = Object.fromEntries(rows.map(r => [r.scientificName, r]));

  return { tree, flat: rows, byScientificName };
}
```

This default-export-an-async-function pattern is supported by Eleventy's data cascade. The same hyparquet dev-dep already in `package.json` is reused — no new build dependency.

**Caveat (LOW confidence):** Default-async data files only run at build start in Eleventy 3.x. If the parquet is missing locally, this throws; it should fall back gracefully to an empty tree (with a warning) so devs without the pipeline output can still iterate on layout. Mirror `validate-schema.mjs`'s "fall back to CloudFront" pattern: try local file → else `asyncBufferFromUrl({ url: 'https://beeatlas.net/data/species.parquet' })`.

---

## 4. WA State Checklist Integration

### 4.1 Source ingestion

Open question from the seed: *"WA state checklist source — which authoritative list, and how is it ingested?"* — **architecturally**, the answer is:

- **Format:** TSV/CSV checked into the repo at `data/checklists/wa_bee_checklist.csv`. One row per species. Editable by the maintainer; small (~700 rows). **Not** a remote API fetch — checklists change rarely (annually at best) and a reproducible build needs a pinned source.
- **Schema:** `scientificName, family, subfamily, tribe, genus, subgenus, specific_epithet, source_citation, notes`
- **Loader:** `data/checklist_pipeline.py` — analogous to `geographies_pipeline.py` (one-shot DuckDB load, not dlt). `load_checklist()` reads the CSV and writes to `checklist_data.species` via `CREATE OR REPLACE TABLE`. No incremental cursor; every run is full-refresh because the input is small and rare.

### 4.2 `data/checklist_pipeline.py` skeleton

```python
"""Load WA bee checklist into checklist_data.species."""
import os
from pathlib import Path
import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
CSV_PATH = Path(__file__).parent / 'checklists' / 'wa_bee_checklist.csv'

def load_checklist() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")
    con.execute("""
        CREATE OR REPLACE TABLE checklist_data.species AS
        SELECT * FROM read_csv_auto(?, header=true)
    """, [str(CSV_PATH)])
    n = con.execute("SELECT COUNT(*) FROM checklist_data.species").fetchone()[0]
    print(f"checklist: {n} species loaded")
    con.close()

if __name__ == "__main__":
    load_checklist()
```

### 4.3 Tribe / subfamily / subgenus gap fill

Ecdysis DarwinCore has only family + genus + scientificName. The checklist (when present) supplies tribe/subfamily/subgenus. For species observed but not on the checklist, we extend `waba_pipeline.enrich_taxon_lineage` — currently it derives only genus/family from iNat ancestors — to a new table `inaturalist_data.taxon_lineage_extended` that pulls the full chain (`subfamily`, `tribe`, `subgenus`).

This sits inside `inaturalist_pipeline.py` rather than waba_pipeline, because the gap-fill applies to **all** species in occurrences, not just WABA-photographed ones. It runs as a post-step inside `load_observations()` (similar to how `enrich_taxon_lineage` runs at the end of `waba_pipeline.load_observations`).

`source_priority` in `species_export.py`: **checklist first, iNat ancestors second** (already coded as `COALESCE(c.col, t.col)` in §3.2).

---

## 5. Photo Manifest TOML

### 5.1 Schema

```toml
# content/species-photos.toml

[species."Andrena anograe"]
description = "Diminutive specialist on Onagraceae; female face densely yellow-haired."

  [[species."Andrena anograe".photos]]
  observation_id = 123456789       # iNat observation id (BIGINT; loadable via API for full provenance)
  photo_id = 987654321             # iNat photo id (BIGINT; permits direct CDN URL)
  caption = "Female on Camissonia"
  attribution = "© Jane Photographer"  # required even for CC0; human-readable
  license = "CC-BY-NC"             # required: SPDX-style licence identifier
  ordering = 1                     # int; lower = shown first

  [[species."Andrena anograe".photos]]
  observation_id = ...
  photo_id = ...
  caption = "Male, lateral"
  attribution = "© Other Person"
  license = "CC-BY"
  ordering = 2

[species."Bombus vosnesenskii"]
# description optional; species-card falls back to "" (no description shown)

  [[species."Bombus vosnesenskii".photos]]
  ...
```

**Key points:**

- **Top-level table is `species.<scientificName>`** (binomial, exact match against `species.parquet`). Quoted because of the embedded space.
- **Photo URL not stored.** Constructed at render time as `https://inaturalist-open-data.s3.amazonaws.com/photos/<photo_id>/medium.jpg` (iNat's photo CDN). Centralizing the URL pattern in `_data/photos.js` lets us swap to `original.jpg`, `large.jpg`, etc. without re-editing the TOML.
- **No bundled photos.** Photos remain on iNat's CDN. Saves S3 storage + complexity, and credit/license is automatically tied to the source.

### 5.2 Validation step

New `scripts/validate-species.mjs` (parallels `validate-schema.mjs`). Runs as part of `npm run build` BEFORE Eleventy:

```javascript
// scripts/validate-species.mjs
import { readFileSync } from 'node:fs';
import { parse } from '@iarna/toml';        // small dep, well-maintained
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';

const toml = parse(readFileSync('content/species-photos.toml', 'utf-8'));
const speciesRows = await parquetReadObjects({
  file: await asyncBufferFromFile('public/data/species.parquet'),
});
const knownSpecies = new Set(speciesRows.map(r => r.scientificName));

let failed = false;
for (const [name, entry] of Object.entries(toml.species ?? {})) {
  // Schema:
  if (!knownSpecies.has(name)) {
    console.warn(`! ${name}: not in species.parquet (will not be displayed)`);
    // WARN not FAIL — TOML may include retired names temporarily
  }
  for (const photo of entry.photos ?? []) {
    for (const required of ['observation_id', 'photo_id', 'attribution', 'license']) {
      if (photo[required] == null) {
        console.error(`x ${name}: photo missing ${required}`);
        failed = true;
      }
    }
  }
}
if (failed) process.exit(1);
```

Wire into `package.json`:

```json
"build": "npm run validate-schema && npm run validate-species && npm run typecheck && eleventy"
```

### 5.3 Authoring workflow

1. **Initial population:** one-time `scripts/seed-species-photos.mjs` (NOT run in CI) walks `species.parquet`, hits the iNat API per species (rate-limited to 1 req/sec to respect their guidance), picks the top-N WABA-licensed photos by quality_grade + faves, and writes a starting `species-photos.toml`. The maintainer then hand-curates.
2. **Subsequent edits:** the maintainer hand-edits the TOML in their editor. `npm run dev` re-renders cards on save (Eleventy data file change triggers full rebuild — there is no HMR for `_data/`).
3. **CI guards:** `validate-species.mjs` catches schema errors and unknown species names before Eleventy runs.

### 5.4 Build-time consumption (`_data/photos.js`)

```javascript
// _data/photos.js
import { readFileSync } from 'node:fs';
import { parse } from '@iarna/toml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tomlPath = join(here, '..', 'content', 'species-photos.toml');

export default function () {
  const toml = parse(readFileSync(tomlPath, 'utf-8'));
  const out = {};
  for (const [scientificName, entry] of Object.entries(toml.species ?? {})) {
    out[scientificName] = {
      description: entry.description ?? '',
      photos: (entry.photos ?? [])
        .sort((a, b) => (a.ordering ?? 999) - (b.ordering ?? 999))
        .map(p => ({
          ...p,
          url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${p.photo_id}/medium.jpg`,
        })),
    };
  }
  return out;
}
```

---

## 6. Static SVG Occurrence Maps

### 6.1 Generation: `data/species_maps.py`

- Runs **after** `species_export.py` and **after** `export.py` (both are inputs).
- For each species in `species.parquet` with `occurrence_count > 0`:
  1. Query lat/lon points from `ecdysis_data.occurrences` (and optionally provisional WABA + samples — open question; recommend specimens-only initially to keep visual signal sharp).
  2. Render an SVG using the **WA state county outlines** as a backdrop and dots for occurrence points.
  3. Write to `public/data/species-maps/<slug>.svg`.

### 6.2 SVG generation library choice

**Recommendation: pure Python, no external SVG library.** The required output is so simple (one `<svg>` with `<path>` elements for counties + `<circle>` elements for points) that direct string templating is the cleanest fit, and avoids adding a Cairo/svgwrite dependency to the maderas environment. The existing `geographies.us_counties` table already exposes WGS84 polygons via `ST_AsGeoJSON(...)`. Sketch:

```python
def render_species_svg(con, species_row, out_path):
    # Project WA bbox: roughly lon [-124.85, -116.92], lat [45.54, 49.0].
    BBOX = (-124.85, 45.54, -116.92, 49.0)
    W, H = 600, 320  # fixed; cards are uniform width

    def project(lon, lat):
        x = (lon - BBOX[0]) / (BBOX[2] - BBOX[0]) * W
        y = H - (lat - BBOX[1]) / (BBOX[3] - BBOX[1]) * H  # flip y
        return x, y

    counties = con.execute("""
        SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))
        FROM geographies.us_counties WHERE state_fips = '53'
    """).fetchall()

    points = con.execute("""
        SELECT lon, lat FROM read_parquet(?) WHERE scientificName = ?
    """, ['public/data/occurrences.parquet', species_row['scientificName']]).fetchall()

    paths = '\n'.join(geojson_to_svg_path(c, project) for (c,) in counties)
    dots = '\n'.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2" />'
                     for lon, lat in points for x, y in [project(lon, lat)])

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}"
                  role="img" aria-label="Occurrence map for {species_row['scientificName']}">
      <g class="counties" fill="#f3f3ee" stroke="#ccc" stroke-width="0.5">{paths}</g>
      <g class="points" fill="#9d4d4d" fill-opacity="0.6" stroke="none">{dots}</g>
    </svg>'''
    out_path.write_text(svg)
```

- **Fixed `viewBox` and styling across all species** — guaranteed consistent card visuals.
- **CSS is inline** (fill/stroke as attributes, not classes) so the `<img src=".svg">` in the card can render even without external CSS — works as a regular `<img>` not just inline `<svg>`.
- Estimated output: ~700 species × ~8–15 KB each = ~7–10 MB total. Acceptable on S3; CloudFront cached.

### 6.3 Cache invalidation

**Defensible approach:** regenerate every nightly run. Most species occurrence sets change rarely; the alternative (hashing the per-species point list and writing only when changed) saves S3 PutObject costs but adds a per-species comparison step. The current `data/nightly.sh` does an `aws s3 sync` to S3 — `sync` already skips identical files (size + mtime), so unchanged SVGs do NOT get re-uploaded. No code change needed.

If S3 PUT charges become noticeable at scale (unlikely for 700 small files): add `--exact-timestamps` flag, or compute a stable hash of point list + write only when the hash differs from the previous run's hash file in `public/data/species-maps/.hashes.json`.

### 6.4 Serving + DOM wiring

```html
<!-- inside _pages/species.njk, per-species card render: -->
<bee-species-card scientific-name="{{ s.scientificName }}">
  <img class="occ-map"
       src="/data/species-maps/{{ s.slug }}.svg"
       alt="WA occurrence map for {{ s.scientificName }}"
       width="600" height="320"
       loading="lazy" />
  ...
</bee-species-card>
```

`loading="lazy"` lets the browser defer the HTTP request until the card scrolls near the viewport. Critical for the all-species page where Osmia alone might mean ~80 cards under one subgenus.

---

## 7. Eleventy + Vite Multi-Entry Build

### 7.1 New page: `_pages/species.njk`

```nunjucks
---
layout: default.njk          # gets <bee-header> automatically (v3.1 pattern)
permalink: /species/index.html
title: BeeAtlas — Species
---
<bee-species-page>
  <bee-taxon-nav slot="nav"></bee-taxon-nav>

  <bee-species-grid slot="grid">
  {%- for s in species.flat -%}
    {%- set photoEntry = photos[s.scientificName] -%}
    <bee-species-card
      scientific-name="{{ s.scientificName }}"
      family="{{ s.family }}"
      genus="{{ s.genus }}"
      subgenus="{{ s.subgenus or '' }}"
      tribe="{{ s.tribe or '' }}"
      occurrence-count="{{ s.occurrence_count }}"
      first-date="{{ s.first_occurrence_date or '' }}"
      last-date="{{ s.last_occurrence_date or '' }}"
      slug="{{ s.slug }}"
      on-checklist="{{ s.on_checklist }}"
      month-histogram="{{ s.month_histogram | json }}"
    >
      <p class="desc" slot="desc">{{ photoEntry.description or '' }}</p>
      {%- for p in photoEntry.photos -%}
        <figure slot="photos">
          <img src="{{ p.url }}" alt="{{ p.caption or s.scientificName }}" loading="lazy" />
          <figcaption>{{ p.caption }} — {{ p.attribution }} ({{ p.license }})</figcaption>
        </figure>
      {%- endfor -%}
      <img slot="map"
           src="/data/species-maps/{{ s.slug }}.svg"
           alt="Occurrence map for {{ s.scientificName }}"
           loading="lazy" />
    </bee-species-card>
  {%- endfor -%}
  </bee-species-grid>

  <bee-species-filter slot="filter"></bee-species-filter>
</bee-species-page>

<script type="module" src="/src/entries/species.ts"></script>
```

**Why server-render the cards (light DOM)** instead of fetching JSON and rendering client-side: text-search engines, accessibility, and "view-source"–friendliness. ~700 cards × ~2 KB HTML = ~1.4 MB raw HTML, gzipped to ~150–250 KB. That ships in roughly the same time as a JSON payload of the same data. The Lit components (`<bee-species-card>`) **decorate** the existing DOM rather than replace it.

### 7.2 New Vite entry: `src/entries/species.ts`

Mirrors `src/entries/bee-header.ts`:

```typescript
// Side-effect entry registers <bee-species-page> and children.
// Vite's MPA auto-discovery picks this up via the <script src=...> in
// _pages/species.njk and produces a hashed bundle.
import '../bee-header.ts';            // header is on this page too (default.njk layout)
import '../species/bee-species-page.ts';
import '../species/bee-taxon-nav.ts';
import '../species/bee-species-grid.ts';
import '../species/bee-species-card.ts';
import '../species/bee-species-filter.ts';
import '../species/seasonality-viz.ts';
```

### 7.3 Bundle budget

Verified shared-chunk dedup behavior from v3.1: `bee-header.ts` is imported by both this entry and (transitively) `bee-atlas.ts` from `index.html`. Rollup hoists it into a shared chunk automatically. Estimates:

| Entry | Vendor pulled | Estimate |
|-------|---------------|----------|
| `bee-atlas.ts` (existing SPA) | lit, mapbox-gl, wa-sqlite, hyparquet, temporal-polyfill | ~2,018 KB (existing) |
| `species.ts` (new) | lit (shared), bee-header (shared), new species components | **~50–80 KB gzipped** (no mapbox, no wa-sqlite) |

**Verification needed in implementation phase:** run `npm run build` and inspect `_site/assets/` to confirm Vite produces a `species-*.js` chunk and a small shared `lit-*.js` chunk, NOT a duplicate of the SPA's main chunk. If shared-chunking fails (it did once during v3.1 RFCs, but Phase 75 confirmed it works), explicit `rollupOptions.output.manualChunks` becomes necessary — file as a research flag.

### 7.4 Lit component file layout

```
src/
├── species/                              (NEW directory, isolated from SPA code)
│   ├── bee-species-page.ts               coordinator (state owner)
│   ├── bee-taxon-nav.ts                  presenter (left rail tree)
│   ├── bee-species-grid.ts               presenter (filter-aware container)
│   ├── bee-species-card.ts               presenter (single card)
│   ├── bee-species-filter.ts             presenter (geo + month inputs)
│   ├── seasonality-viz.ts                presenter (month-histogram chart)
│   └── url-state.ts                      (NEW, separate from SPA url-state.ts)
└── entries/
    ├── bee-header.ts                     (existing)
    └── species.ts                        (NEW)
```

The species page gets **its own `src/species/url-state.ts`** because the URL params it owns (`fam=`, `gen=`, `sub=`, etc.) are disjoint from the SPA's (`x`, `y`, `z`, `taxon`, `o`, `bm`, …). Sharing `src/url-state.ts` would import `FilterState`, `CollectorEntry`, and other types that have no business on the species page.

---

## 8. Pre-Filtered SPA Link `/?taxon=...`

### 8.1 Verified URL contract

From `src/url-state.ts:35-38`:

```typescript
if (filter.taxonName !== null) {
    params.set('taxon', filter.taxonName);
    params.set('taxonRank', filter.taxonRank!);
}
```

And `src/url-state.ts:83-89` (parser):

```typescript
const taxonName = p.get('taxon') ?? null;
const rawRank   = p.get('taxonRank') ?? null;
const taxonRank = (['family', 'genus', 'species'] as const).includes(rawRank as any)
  ? rawRank as 'family' | 'genus' | 'species' : null;
const resolvedTaxonName = (taxonName && taxonRank) ? taxonName : null;
const resolvedTaxonRank = (taxonName && taxonRank) ? taxonRank : null;
```

**Both `taxon` AND `taxonRank` are required** — if either is absent, both are dropped silently. The species page deep-link must include both.

### 8.2 SPA route is `/`, not `/collection/`

The seed mentions `/collection?taxon=...`. Verified: the SPA root is `/` (`_pages/index.html`). The species card deep-link should be:

```
/?taxon=Andrena%20anograe&taxonRank=species
```

NOT `/collection/?taxon=...`. Either fix the seed, or move the SPA to `/collection/` (a much larger change — affects every shared link in the wild). **Recommend keeping `/` and updating the seed.**

### 8.3 Deep-link from card

```typescript
// inside src/species/bee-species-card.ts
@property() scientificName!: string;

private _onOpenInMap() {
  const params = new URLSearchParams({
    taxon: this.scientificName,
    taxonRank: 'species',
  });
  // Same-origin navigation; SPA's parseParams reads on connectedCallback
  window.location.href = `/?${params}`;
}
```

Genus/family-level deep-links from the nav rail (e.g. "show me all *Andrena* in the SPA") use `taxonRank=genus` or `taxonRank=family` respectively.

---

## 9. Build Order in `data/run.py`

### 9.1 Recommended sequence

```python
STEPS: list[tuple[str, Callable]] = [
    ("ecdysis",         load_ecdysis),
    ("ecdysis-links",   load_links),
    ("inaturalist",     load_inaturalist_observations),
    ("waba",            load_waba_observations),
    ("projects",        load_projects),
    ("anti-entropy",    run_anti_entropy),
    ("checklist",       load_checklist),         # NEW — must precede species_export
    ("export",          export_all),              # UNCHANGED
    ("species-export",  export_species_parquet),  # NEW — must follow checklist + export
    ("species-maps",    generate_species_maps),   # NEW — must follow species-export
    ("feeds",           generate_feeds),          # UNCHANGED
]
```

### 9.2 Dependency rationale

- `checklist` is **independent** of all other steps (CSV → DuckDB; no joins). Position determined only by needing to precede `species-export`. Inserting it just before `export` is convenient — same "deterministic transformation" phase of the pipeline.
- `species-export` depends on:
  - `ecdysis_data.occurrences` (populated by `ecdysis`)
  - `inaturalist_data.taxon_lineage_extended` (populated as a tail step inside `inaturalist`)
  - `inaturalist_waba_data.taxon_lineage` (populated by `waba`)
  - `checklist_data.species` (populated by `checklist`)
  - It does NOT depend on `export.py`'s outputs in DuckDB; both read the same source tables. They run in either order. **Recommend: `species_export` AFTER `export`** so a failure in `export.py` (the heavier query) fails fast and the smaller `species_export` doesn't waste time on a doomed run. Both steps share the same `con = duckdb.connect(...)` pattern (each opens its own).
- `species-maps` depends on `species.parquet` (newly written by the previous step) AND on `geographies.us_counties` (independent). Must follow `species-export`.
- `feeds` is unaffected — it queries Atom-feed data from `ecdysis_data.identifications`. Position unchanged.

### 9.3 Failure isolation

The existing `run.py` raises on the first failing step. Adding three new steps after `export` extends the cron run by ~30–90 s (rough estimate: ~1 s for checklist load, ~3–10 s for species_export query, ~30–90 s for 700 SVG generations). All three are pure transformations of already-present data — they CAN be re-run idempotently if the cron failed mid-way.

---

## 10. Project Structure Diff (NEW vs MODIFIED vs UNCHANGED)

```
beeatlas/
├── _data/
│   ├── build.js                     UNCHANGED
│   ├── species.js                   NEW (build-time hyparquet read)
│   └── photos.js                    NEW (build-time TOML read)
├── _layouts/
│   ├── base.njk                     UNCHANGED
│   └── default.njk                  UNCHANGED (already auto-applies <bee-header>)
├── _pages/
│   ├── index.html                   UNCHANGED (SPA at /)
│   ├── scaffold-check.njk           UNCHANGED
│   └── species.njk                  NEW (species page at /species/)
├── content/                         NEW directory (repo-checked-in editorial content)
│   └── species-photos.toml          NEW (hand-edited photo manifest)
├── data/
│   ├── checklists/                  NEW directory
│   │   └── wa_bee_checklist.csv     NEW (committed, hand-edited)
│   ├── checklist_pipeline.py        NEW
│   ├── species_export.py            NEW
│   ├── species_maps.py              NEW
│   ├── ecdysis_pipeline.py          UNCHANGED
│   ├── inaturalist_pipeline.py      MODIFIED (extend taxon_lineage_extended for tribe/subfamily/subgenus)
│   ├── waba_pipeline.py             UNCHANGED
│   ├── geographies_pipeline.py      UNCHANGED
│   ├── projects_pipeline.py         UNCHANGED
│   ├── anti_entropy_pipeline.py     UNCHANGED
│   ├── export.py                    UNCHANGED
│   ├── feeds.py                     UNCHANGED
│   ├── run.py                       MODIFIED (add 3 steps to STEPS list)
│   └── tests/
│       ├── test_export.py           UNCHANGED
│       ├── test_species_export.py   NEW
│       └── test_species_maps.py     NEW
├── public/data/
│   ├── occurrences.parquet          UNCHANGED
│   ├── counties.geojson             UNCHANGED
│   ├── ecoregions.geojson           UNCHANGED
│   ├── species.parquet              NEW (output of species_export.py)
│   └── species-maps/                NEW directory
│       └── <slug>.svg               NEW (~700 files)
├── scripts/
│   ├── validate-schema.mjs          UNCHANGED (occurrences.parquet only)
│   ├── validate-species.mjs         NEW (species.parquet + photos.toml)
│   └── seed-species-photos.mjs      NEW (one-shot helper, NOT in CI)
├── src/
│   ├── bee-atlas.ts                 UNCHANGED
│   ├── bee-map.ts, bee-sidebar.ts,
│   │   bee-occurrence-detail.ts,
│   │   bee-table.ts, bee-filter-*,
│   │   bee-header.ts, sqlite.ts,
│   │   filter.ts, url-state.ts,
│   │   features.ts, style.ts        UNCHANGED
│   ├── species/                     NEW directory
│   │   ├── bee-species-page.ts      NEW (coordinator)
│   │   ├── bee-taxon-nav.ts         NEW
│   │   ├── bee-species-grid.ts      NEW
│   │   ├── bee-species-card.ts      NEW
│   │   ├── bee-species-filter.ts    NEW
│   │   ├── seasonality-viz.ts       NEW
│   │   └── url-state.ts             NEW (species-page URL params, disjoint from SPA's)
│   ├── entries/
│   │   ├── bee-header.ts            UNCHANGED
│   │   └── species.ts               NEW (Vite entry)
│   └── tests/
│       ├── arch.test.ts             MODIFIED (add ARCH-04: src/species/** does not import mapbox-gl, wa-sqlite, or bee-atlas.ts)
│       ├── (existing tests)         UNCHANGED
│       └── species/                 NEW directory
│           ├── bee-species-card.test.ts  NEW
│           ├── seasonality-viz.test.ts   NEW
│           └── url-state.test.ts         NEW (species-page URL round-trip)
├── eleventy.config.js               UNCHANGED (no new pages config needed; auto-discovery)
├── vite.config.ts                   UNCHANGED (no new entries config; MPA auto-discovery)
└── package.json                     MODIFIED (add @iarna/toml dev-dep; modify "build" script to include validate-species)
```

---

## 11. Architectural Risks & Coupling Concerns

### Risk 1: Tribe/subfamily/subgenus accuracy from iNat ancestors

**What:** The seed says "Ecdysis primary, iNat fills tribe and gaps." iNat's taxonomy is community-curated and occasionally diverges from peer-reviewed monographs for fine-grained ranks (subgenera especially). For a learning-oriented audience, an incorrect subgenus assignment is more harmful than missing data.

**Mitigation:** When `checklist_data.species` provides a value, prefer it always (already encoded as `COALESCE(c.col, t.col)` in §3.2). Treat iNat ancestors as **fallback only** for species that are NOT in the WA checklist (i.e. waifs/strays). Surface "from iNaturalist taxonomy" provenance in the card UI for those species so volunteers know the source.

### Risk 2: Photo manifest drift from iNat

**What:** A photographer can delete or relicense an iNat photo. A `<img>` tag in a static card pointing at the iNat CDN will silently 404 / hotlink-fail without rebuild signals.

**Mitigation:** Add an optional CI step `scripts/check-photo-availability.mjs` that HEADs each photo URL once a week (cron, not every build). Failed URLs are listed in a CI artifact for manual TOML cleanup. Out of scope for the v3.2 ship; flag it as a follow-up.

### Risk 3: Eleventy build time blowing up

**What:** Reading a 1.2 MB parquet at every Eleventy build (via `_data/species.js`) plus rendering ~700 cards into HTML adds latency to `npm run dev` HMR cycles. v3.1 measured Eleventy + Vite at ~5 s for a near-empty `_pages/`. This could push to 10–20 s.

**Mitigation:**
- `_data/species.js` reads parquet ONCE per Eleventy run; the parsed result is held by the data cascade for the whole build.
- Consider an Eleventy option to mark `species.njk` as not requiring a re-render on `_data/build.js` changes (it doesn't reference `build` directly). Eleventy 3.x has `addGlobalData` granularity but not per-template invalidation; live with the longer dev cycle.
- If still painful, fall back to fetching JSON at runtime from `/data/species.json` (a flat version of `species.parquet` produced by `species_export.py`). Ship trade-off discussion as a research flag for the implementation phase.

### Risk 4: ARCH-03 violation in coordinator

**What:** `<bee-species-page>` holds state and emits to/from children. If a child component (e.g. `<bee-species-card>`) imports `bee-species-page.ts` to read state directly (instead of receiving it via `@property`), the invariant breaks the same way the v2.2 `FeedEntry` issue would have if not caught.

**Mitigation:** Extend `src/tests/arch.test.ts` (existing readFileSync source-analysis pattern) with ARCH-04 invariants:
- `src/species/bee-taxon-nav.ts`, `bee-species-grid.ts`, `bee-species-card.ts`, `bee-species-filter.ts`, `seasonality-viz.ts` MUST NOT contain the substring `from './bee-species-page` (or `bee-species-page.ts`).
- `src/species/**.ts` MUST NOT import `mapbox-gl`, `wa-sqlite`, `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, or `../bee-atlas.ts`.

### Risk 5: Largest subgenus rendering (Osmia ~80–90 species)

**What:** The seed flags this. From an architecture POV, we need a story for the case where a single subgenus has dozens of cards. Pagination on the species page complicates URL state and breaks "ctrl-F search the page."

**Mitigation:** Lazy-load images via `loading="lazy"` on `<img>` (both photos and SVG maps) and `content-visibility: auto` CSS on each `<bee-species-card>`. The browser then only paints cards that approach the viewport, keeping the initial paint time bounded. No pagination; "all cards present, deferred render." Validated UX in implementation phase.

### Risk 6: Static SVG ↔ live data drift

**What:** SVG maps regenerate nightly (when occurrences.parquet does). Between the cron run and when the user loads the page, an SVG and the SPA could agree exactly. But if someone manually re-runs `data/export.py` without re-running `species_maps.py`, the SVG would show stale points relative to the SPA.

**Mitigation:** `data/run.py`'s STEPS list is the single execution path. Don't expose individual `export_all` / `generate_species_maps` as standalone scripts in `package.json`. Document in `data/README.md` that ad-hoc re-runs must use `python run.py`, not call individual modules.

### Risk 7: Coupling concerns at the SPA boundary

**What:** The species page deep-links to `/?taxon=X&taxonRank=species`. If the SPA changes its URL contract (renames `taxon` → `tax_name`, or drops `taxonRank`), every species card link breaks.

**Mitigation:** Document `taxon` + `taxonRank` URL params as a stable contract in `src/url-state.ts` (comment header). Add a Vitest URL round-trip test in `src/tests/url-state.test.ts` (already exists for buildParams/parseParams) that asserts `taxon=Andrena anograe&taxonRank=species` parses correctly. **Ship the URL-stability commitment as part of v3.2's contract** — surface in PROJECT.md Key Decisions.

---

## 12. Sources

- [PROJECT.md](/Users/rainhead/dev/beeatlas/.planning/PROJECT.md) — full milestone context, including v3.1 patterns established for v3.2 (Key Decisions D-01..D-07 from Phase 75)
- [seeds/species-tab.md](/Users/rainhead/dev/beeatlas/.planning/seeds/species-tab.md) — locked decisions and open questions
- [eleventy.config.js](/Users/rainhead/dev/beeatlas/eleventy.config.js) — `dir.input = "_pages"`, layouts at `../_layouts`, MPA mode
- [vite.config.ts](/Users/rainhead/dev/beeatlas/vite.config.ts) — `optimizeDeps.exclude: ['wa-sqlite']`, vitest config
- [_data/build.js](/Users/rainhead/dev/beeatlas/_data/build.js) — pattern for `_data/species.js` and `_data/photos.js` (default-export-an-object/function)
- [_layouts/default.njk](/Users/rainhead/dev/beeatlas/_layouts/default.njk) — auto-injection of `<bee-header>` via `src/entries/bee-header.ts` side-effect import
- [src/entries/bee-header.ts](/Users/rainhead/dev/beeatlas/src/entries/bee-header.ts) — pattern for `src/entries/species.ts`
- [src/url-state.ts](/Users/rainhead/dev/beeatlas/src/url-state.ts:35-89) — verified `taxon` + `taxonRank` URL contract; both required
- [src/bee-atlas.ts](/Users/rainhead/dev/beeatlas/src/bee-atlas.ts:16-72) — coordinator pattern reference (state ownership for `<bee-species-page>`)
- [data/run.py](/Users/rainhead/dev/beeatlas/data/run.py:31-40) — STEPS list extension point
- [data/export.py](/Users/rainhead/dev/beeatlas/data/export.py) — DuckDB+spatial join template for `species_export.py`
- [data/geographies_pipeline.py](/Users/rainhead/dev/beeatlas/data/geographies_pipeline.py) — pattern for `checklist_pipeline.py` (one-shot DuckDB load, not dlt)
- [data/waba_pipeline.py:109-160](/Users/rainhead/dev/beeatlas/data/waba_pipeline.py) — `enrich_taxon_lineage` pattern; extend to `taxon_lineage_extended` with subfamily/tribe/subgenus
- [data/feeds.py](/Users/rainhead/dev/beeatlas/data/feeds.py) — post-export step pattern (writing to `public/data/<subdir>/`)
- [scripts/validate-schema.mjs](/Users/rainhead/dev/beeatlas/scripts/validate-schema.mjs) — pattern for `validate-species.mjs`
- [src/sqlite.ts:63-123](/Users/rainhead/dev/beeatlas/src/sqlite.ts) — confirms wa-sqlite is heavyweight; species page must NOT pull it
