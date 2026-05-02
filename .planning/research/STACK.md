# Stack Research

**Domain:** Static species exploration page bolted onto an Eleventy + Vite + Lit MPA fed by a DuckDB-backed Python pipeline (v3.2 Species Tab additions only)
**Researched:** 2026-05-02
**Confidence:** HIGH for stdlib/well-known additions (`tomllib`, `matplotlib`, Eleventy `_data/*.js`); MEDIUM for the seasonality viz choice (depends on Wiley Fig.6 fidelity bar — see Open Questions); LOW for the WA checklist file format (paywall-lite — see Open Questions)

---

This file covers ONLY NEW stack additions for v3.2 Species Tab. Existing decisions (TypeScript, Vite, Lit, wa-sqlite + hyparquet, Mapbox GL JS v3.22.0, Eleventy 3.1.5 + `@11ty/eleventy-plugin-vite` 7.1.1, Python 3.14+, uv, `dlt[duckdb]`, DuckDB with spatial extension, AWS CDK + S3 + CloudFront OAC) are LOCKED and not re-litigated here.

The seed (`.planning/seeds/species-tab.md`) has already locked these meta-decisions: static SVG occurrence maps in Python, photo manifest as TOML in repo, taxonomy primary = Ecdysis (tribe + gaps from iNat), filter scope geography + seasonality, seasonality viz mimics Wiley `10.1002/ece3.72049`. This file picks the libraries that implement those decisions.

---

## Recommended Stack

### Core Additions (Python pipeline)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `tomllib` | stdlib (3.11+) | Read photo manifest TOML at pipeline time | Already in Python 3.14 stdlib (`requires-python = ">=3.14"` in `data/pyproject.toml`). Read-only is the right contract for pipeline ingestion: humans edit the TOML, pipeline reads it. No new dep. |
| `matplotlib` | `^3.10` (3.10.9 latest stable, Apr 2026) | Generate per-species static SVG occurrence maps from `counties.geojson` + filtered occurrence points | Bundled SVG backend (`backend_svg`) is the path-of-least-resistance: produces clean, well-formed SVG via `plt.savefig(..., format='svg')`; works with raw shapely/GeoJSON polygons without pulling in geopandas. Single-purpose, no Cairo, no headless browser. Already a transitive of nothing in the current pipeline (clean addition). |
| `shapely` | `^2.0` | Parse GeoJSON polygons read out of DuckDB (`ST_AsGeoJSON`) into geometry objects matplotlib can plot | Already a transitive dep of `dlt`/`pyarrow` ecosystems but NOT currently a direct dep — make it explicit. v2 has the C-fast vectorized API. Avoids GeoPandas overhead (geopandas was deliberately removed in v2.2 Phase 47 because it OOM'd on maderas). |

### Core Additions (Eleventy build)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `_data/species.js` (no new dep) | n/a | Build-time JS module that returns the species roster + per-species metadata for `.njk` page templates | `_data/build.js` (v3.1 Phase 75) established the `default-export-an-object` pattern. For v3.2, `_data/species.js` reads a static `public/data/species.json` written by the Python pipeline and exports it as a structured object. Async export is supported by Eleventy if needed. |
| `public/data/species.json` (Python-emitted) | n/a | Static JSON snapshot of the species roster (~600–700 species), per-species summary stats (count, year range, top counties, monthly histogram), and taxonomy parents | JSON is the boring-correct format for handoff between the Python pipeline and the Node-side Eleventy build. Avoids needing a JS-side parquet reader at build-time. Pipeline already writes to `public/data/`; the export step naturally fits. |

### Core Additions (Frontend bundle)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Inline SVG via Lit templates (NO new dep) | uses existing `lit ^3.2.1` | Render seasonality viz client-side from the per-species monthly histogram in `species.json` | Bundle budget is tight (current `index-pgqDAatT.js` is 1,998 KB; mapbox-gl is ~1,700 KB of that). The species page should NOT load mapbox-gl at all (occurrence maps are static SVG), but it WILL load lit + a small species component. Adding D3/uPlot/Chart.js for ridge plots is overkill — the data is twelve numbers per species; a hand-rolled inline-SVG bar/area histogram inside a Lit `html\`<svg>...\`` template is ~50 LOC and zero new bytes. See "Alternatives Considered" for why D3 lost. |
| Static SVG `<img>` for occurrence maps | n/a | `<img src="/species-maps/{slug}.svg" alt="...">` — pre-rendered by the pipeline | Browser handles SVG natively. No JS needed on the species page for maps. Cacheable, small (~10–30 KB each at WA-state scale with simplified counties). |

### Authoring tooling (deferred, NOT shipped in v3.2 unless it falls out for free)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tomlkit` | `0.13.3` | Round-trip TOML editing (preserves comments, ordering, formatting) | ONLY if the photo-manifest authoring loop grows a CLI helper that needs to mechanically rewrite the TOML (e.g. "auto-add a candidate photo for species X but keep the human's caption edits intact"). For v3.2 first delivery, plain text editing in an editor is the right authoring story — `tomllib` reads, humans write. Adding `tomlkit` later is a one-line `pyproject.toml` change. |

### Development Tools (no changes)

| Tool | Purpose | Notes |
|------|---------|-------|
| `uv` | Python dep / venv mgmt | Existing. `uv add matplotlib shapely` from `data/` — both go in the runtime deps section, NOT dev. |
| Vitest 4.x | Frontend test runner | Existing. New seasonality viz component gets a render test in `src/`. |
| `pytest` 9.x | Python pipeline tests | Existing. New SVG-map generator gets a unit test that asserts the SVG is well-formed and contains N circle elements for N occurrence points. |

---

## Installation

```bash
# Python pipeline additions (run in data/)
cd data
uv add matplotlib shapely

# Node side: NO new npm packages required for v3.2.
# `_data/species.js` is plain Node code reading public/data/species.json with fs.
```

`tomlkit` is intentionally NOT installed in v3.2 (deferred). `tomllib` is stdlib in 3.14, no install needed.

---

## Integration Points

### Pipeline (Python, runs on maderas nightly)

`data/run.py` `STEPS` list grows TWO entries between `export` and `feeds`:

```python
STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("export", export_all),
    ("species-export", export_species_json),   # NEW: emits public/data/species.json
    ("species-maps",  generate_species_svgs),  # NEW: emits public/data/species-maps/{slug}.svg
    ("feeds", generate_feeds),
]
```

- `data/species_export.py` — reads `data/beeatlas.duckdb` (occurrences + ecdysis taxonomy + iNat tribe gap-fill + photo manifest TOML), aggregates per-species (count, monthly histogram, top counties/ecoregions, photo IDs), writes `public/data/species.json`.
- `data/species_maps.py` — for each species in the roster, queries DuckDB for occurrence points, fetches WA county polygons via `ST_AsGeoJSON`, plots with matplotlib + shapely, writes `public/data/species-maps/{slug}.svg`.
- `data/photos/photos.toml` — checked-in TOML manifest. Read once at start of `species-export` via `tomllib.load(open(path, 'rb'))`.
- `scripts/validate-schema.mjs` — extended with a check that `species.json` parses and exposes the expected top-level shape (mirrors the existing parquet schema gate).

### Eleventy build (Node, runs in CI and on `npm run dev`)

- `_data/species.js` — `export default async function () { return JSON.parse(await fs.readFile(...)) }`. Pattern lifted from `_data/build.js`.
- `_pages/species.njk` (or `_pages/species/index.njk`) — declares `layout: default.njk`, iterates `{% for sp in species.roster %}` to emit the page; image references resolve to `/species-maps/{slug}.svg` at runtime (Vite passthrough copies `public/` → `_site/` so this just works).
- `src/entries/species-page.ts` — side-effect Vite entry that imports the species-page Lit components (e.g. `bee-species-card`, `bee-seasonality-viz`). Pattern lifted from `src/entries/bee-header.ts`. Add a `<script type="module" src="/src/entries/species-page.ts"></script>` line to the species page template.

### Frontend at runtime

- `<bee-species-card>` Lit component receives species data as properties from server-rendered `<bee-species-card data-species="...">` (or via a JSON island), renders the static SVG `<img>` for the map, and renders the seasonality viz inline via a `<bee-seasonality-viz months="[...]">` child component.
- `<bee-seasonality-viz>` is a ~50 LOC Lit component that produces an inline `<svg>` from a 12-element monthly count array. No external chart library.
- The species page does NOT import `mapbox-gl` or `wa-sqlite`. Bundle budget for the species-page entry should be well under 50 KB gzipped (lit + small components only).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `matplotlib` for SVG maps | `geopandas.GeoDataFrame.plot()` | If the project already used geopandas. It does NOT — geopandas was explicitly removed in v2.2 Phase 47 for OOM reasons; reintroducing it just for static map rendering is a regression. matplotlib + raw shapely covers the same surface in ~30 LOC. |
| `matplotlib` for SVG maps | `drawsvg 2.4.1` | If you needed JS-interactive SVG (animation, hover) authored from Python. We don't — these are static informational maps. matplotlib's SVG backend is well-understood and the figure axes / projections / color ramps are mature. |
| `matplotlib` for SVG maps | `svgwrite` 1.4.3 | If you needed extremely small SVG output and were willing to compute layout/projection by hand. svgwrite is **unmaintained** as of 2024–2025 (per its PyPI page); avoid for new projects. |
| `matplotlib` for SVG maps | DuckDB native `ST_AsSVG` | If maps were single-shape (one polygon → SVG fragment). For multi-layer rendering (counties basemap + occurrence dots + species name annotation), you still need a layout engine. matplotlib provides one. |
| Inline Lit SVG seasonality viz | D3.js v7 | If the seasonality viz needed brushing/zooming/transitions. The seed says "mimic Wiley Fig 6 format" — that's a static density/ridge plot. D3 adds ~70–250 KB depending on which submodules; for static output we'd be using ~5% of D3 (`d3-shape`'s `area`/`line` generators at most). Not worth the bundle hit. |
| Inline Lit SVG seasonality viz | uPlot | uPlot is canvas-based and tuned for huge time series; per-species monthly histograms are 12 points. uPlot bundle is small (~40 KB) but still adds a runtime dep we don't need. |
| Inline Lit SVG seasonality viz | Chart.js | Chart.js (200+ KB) is overkill for 12-point histograms and brings opinionated styling that won't match Wiley Fig 6. Reject on bundle size alone. |
| Inline Lit SVG seasonality viz | Observable Plot | Plot has the right semantics but pulls in D3 transitively (~80 KB+). Save for a future milestone if/when the species page grows interactive multi-variable charts. |
| Inline Lit SVG seasonality viz | Pre-render seasonality SVGs in Python (`matplotlib`) | **Plausible alternative** — generate `public/data/species-maps/{slug}-season.svg` alongside the occurrence map in the same pipeline step. Pros: zero JS, mirrors the occurrence-map approach, R/`ggridges` aesthetic translates cleanly to Python `seaborn.kdeplot`. Cons: cannot react to filter UI on the page (geography filter would not re-render seasonality). Decision criterion: does v3.2 need filter-driven seasonality reactivity? Seed says "Filter scope on the species page: geography + seasonality" — implying yes, the seasonality viz should respond to a geography filter. **If filter reactivity is dropped from MVP, switch to Python pre-render and remove `<bee-seasonality-viz>` entirely.** Mark this as the simplest-fallback path. |
| Eleventy `_data/species.js` reading static JSON | `_data/species.js` reading parquet at build-time via `@duckdb/duckdb-wasm` Node mode | Possible but adds a heavy npm dep and ~30 MB WASM init at build time for a one-shot read. Pipeline emits JSON anyway; let Eleventy stay simple. Reject. |
| `tomllib` (read) + manual TOML editing | `tomlkit` round-trip from day 1 | Defer. The authoring story is "humans edit the TOML in their editor"; we don't need round-trip preservation until/unless we build a CLI tool that mutates the manifest. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `geopandas` | Removed in v2.2 Phase 47 because it OOM'd on maderas during the geographies pipeline. Reintroducing it for a small SVG-map task is a regression of a hard-won decision. | `shapely` 2.x directly + matplotlib axes; or DuckDB `ST_AsGeoJSON` → `json.loads` → matplotlib `Polygon` patches. |
| `svgwrite` | PyPI marks it inactive; only bugfixes accepted. Don't start new code on an unmaintained library. | `matplotlib` SVG backend or `drawsvg`. |
| Headless-browser SVG capture (Playwright/Puppeteer rendering Mapbox tiles) | Explicit anti-decision in the seed: "no new headless-browser tooling". Adds CI complexity, slow render times, and runtime fragility. | Pure-Python `matplotlib` rendering. |
| `cartopy` | Powerful but heavy (proj4, GEOS, large native deps); overkill for a WA-state scale plot with one CRS. | `matplotlib` + `shapely`. The pipeline already operates in EPSG:4326 throughout (per v2.2 decision). |
| Build-time iNat API queries for photos | Explicit anti-decision in the seed: "no build-time queries". Causes flaky CI and rate-limit risk. | Authored TOML manifest in repo. |
| D3.js / Chart.js / Plotly added to the species page bundle | Bundle budget is already strained (1.998 MB main chunk). The 12-point seasonality histogram doesn't justify ANY chart library. | Inline `<svg>` inside a Lit template. |
| `@duckdb/duckdb-wasm` re-introduced for build-time parquet reads | Removed deliberately in v2.6 SQLite migration. Reintroducing for build-time use would re-add ~30 MB of node_modules. | Pipeline emits JSON; Eleventy reads JSON. |
| Vite `rollupOptions.input` configuration for the new species page | The plugin discovers entries automatically by scanning emitted `_site/*.html` (v3.1 D-05 confirmed end-to-end). Adding manual `input` config breaks the auto-discovery contract. | Drop the new `.njk` page in `_pages/`; Vite picks it up. Side-effect TS entries go in `src/entries/` and are referenced from the layout/page via `<script type="module" src="...">`. |

---

## Stack Patterns by Variant

**If filter-driven seasonality reactivity is in MVP scope:**
- Use the inline-Lit-SVG `<bee-seasonality-viz>` recommendation above.
- Per-species `species.json` carries a 12-element monthly histogram per geography slice, OR carries the raw occurrence dates and the component computes the histogram client-side. Latter is simpler and the data is small (~50–200 dates per species typical).

**If filter-driven seasonality reactivity is dropped from MVP:**
- Pre-render `{slug}-season.svg` in Python alongside the occurrence map.
- Skip `<bee-seasonality-viz>` Lit component entirely.
- Saves bundle bytes and a render path; the page becomes pure server-rendered SVG.

**If photo authoring grows a CLI tool:**
- Add `tomlkit ^0.13` to `data/pyproject.toml` runtime deps.
- Keep `tomllib` for read paths inside the pipeline (faster, stdlib).
- Use `tomlkit` only in the helper script that mutates the manifest.

**If the largest subgenus (Osmia, ~80–90 species per the seed) blows up the page:**
- The card-grid renders client-side from `_data/species.js` data; pagination/lazy-load is a Lit-component concern, not a stack concern. Defer to design phase.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `matplotlib ^3.10` | Python 3.14 | matplotlib 3.10 supports Python 3.10–3.13 officially per release notes; 3.14 just-released compatibility relies on no Python-3.14-incompatible C extension behavior. Verify on first install — if matplotlib breaks on 3.14, fall back to pre-rendering in a 3.13 container OR pin `matplotlib >=3.11` if it ships before v3.2 freeze. **Action:** install and run a smoke test as the first step of the implementation phase. |
| `shapely ^2.0` | Python 3.14 | Shapely 2.x supports Python 3.9+. 2.0 series is stable; explicit dep makes the version visible in `data/pyproject.toml`. |
| `tomllib` | Python 3.11+ | Already required by 3.14 floor. No constraint. |
| Eleventy 3.1.5 + `_data/*.js` async export | Eleventy `^3.0` | `_data/*.js` async functions are documented and stable since v2; no version concern. |
| Lit 3.2 inline SVG templates | n/a | Lit's `html` template literal handles `<svg>` content correctly when the root is `<svg>`. No SVG-specific tag function needed (Lit's `svg` tag exists but isn't required for this case). |

---

## Open Questions (flagged for downstream phases, NOT stack-blocking)

1. **WA state checklist source format** — the Bartholomew, Murray, Bossert, Gardner, Looney 2024 paper (J. Hymenoptera Research 97: 1007–1121, DOI 10.3897/jhr.97.129013) is the authoritative WA bee checklist. Pensoft journals typically publish supplementary data as CSV/XLSX under each article's "Supplementary materials" section, but the article page does not currently expose direct file download URLs in HTML scrapes — they're behind a UI affordance. **Action for the requirements gatherer:** manually inspect the article supplementary section, download the species-list file, and add the format to `_data/` ingestion. If the checklist is only available as a PDF table or a Shiny app data dump (`https://phylosolving.shinyapps.io/WA_bee_catalog/`), add `pdfplumber` (PDF) or pure-`requests` HTML scraping as a one-off ingestion step. **NOT in v3.2 stack until format is confirmed.** Confidence: LOW.

2. **Wiley Fig 6 fidelity bar** — the seed says "mimic format from Wiley `10.1002/ece3.72049`" (Sugden et al. 2025 *Ecology and Evolution*). The reference R code at `~/dev/BeeSearch/analyses/ridge_plots.Rmd` uses `ggridges::geom_density_ridges` over week-of-year, aggregating multiple genera into a stacked ridge plot. **A per-species seasonality viz on the species card is structurally simpler than a multi-species ridge plot** — it's effectively one density curve per card, not a ridge plot at all. Visualization design phase should confirm whether v3.2 wants (a) a single density area per card, or (b) a small ridge plot showing each species against its genus/tribe peers on the same card. (a) is trivially Lit-inline-SVG; (b) might justify a small kernel-density helper but still doesn't need a chart library — `simple-statistics` (~5 KB) would be enough if we needed gaussian KDE in JS. Confidence: MEDIUM.

3. **Photo manifest TOML schema** — flagged in the seed; not a stack question (any TOML is the same TOML to `tomllib`). Surface here so the schema gets designed BEFORE the manifest is populated, to avoid round-trip-rewrite work. Recommended fields (suggestion only): `[species.<scientific-name>]` table with `inat_observation_ids: [int]`, `caption: str`, `attribution: str`, `license: str`, `order: int`. Defer to requirements phase.

---

## Sources

- [Python `tomllib` stdlib docs (3.14)](https://docs.python.org/3/library/tomllib.html) — confirmed read-only stdlib parser, available since 3.11
- [`tomlkit` 0.13.3 on PyPI](https://pypi.org/project/tomlkit/) — confirmed style-preserving round-trip TOML editor
- [`tomlkit` 0.13.3 release notes on GitHub](https://github.com/python-poetry/tomlkit/releases/tag/0.13.3) — version verified
- [Matplotlib 3.10.9 release notes](https://matplotlib.org/stable/users/release_notes.html) — confirmed latest stable as of Apr 2026; SVG backend stable
- [Matplotlib `backend_svg` API](https://matplotlib.org/stable/api/backend_svg_api.html) — confirmed `print_svg` and metadata support
- [`svgwrite` 1.4.3 on PyPI](https://pypi.org/project/svgwrite/) — confirmed unmaintained status
- [`drawsvg` 2.4.1 on PyPI](https://pypi.org/project/drawsvg/) — confirmed alternative; not needed for v3.2
- [GeoPandas mapping user guide](https://geopandas.org/en/stable/docs/user_guide/mapping.html) — confirms GeoPandas would be a regression vs. v2.2 Phase 47 decision
- [DuckDB spatial functions (`ST_AsGeoJSON`, `ST_AsSVG`)](https://duckdb.org/docs/current/core_extensions/spatial/functions) — confirmed the SQL surface for extracting geometry into Python
- [Eleventy JavaScript Data Files docs](https://www.11ty.dev/docs/data-js/) — confirms async export-default pattern matches `_data/build.js`
- [Bartholomew et al. 2024, "An annotated checklist of the bees of Washington state", J. Hym. Res. 97](https://jhr.pensoft.net/article/129013/) — confirmed authoritative WA checklist source; supplementary data format requires manual inspection (Open Question 1)
- [Sugden et al. 2025, "Structure of Bee Communities in Marginal Lands of the Puget Sound" *Ecology and Evolution*, DOI 10.1002/ece3.72049](https://onlinelibrary.wiley.com/doi/10.1002/ece3.72049) — confirms the seed's seasonality-viz reference
- BeeSearch repo at `~/dev/BeeSearch/analyses/ridge_plots.Rmd` — confirms ridge-plot uses `ggridges` over week-of-year (HIGH confidence, direct file inspection)
- [Casey Primozic's notes on uPlot](https://cprimozic.net/notes/posts/my-thoughts-on-the-uplot-charting-library/) — confirms uPlot is canvas-based and ill-suited to 12-point static SVG output
- BeeAtlas internal: `.planning/PROJECT.md` Key Decisions table (rows on `geopandas` removal, EH bundle, mapbox-gl bundle size, `_data/build.js` pattern) — HIGH confidence, primary source

---
*Stack research for: v3.2 Species Tab additions only*
*Researched: 2026-05-02*
