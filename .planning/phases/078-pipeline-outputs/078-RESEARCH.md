# Phase 78: Pipeline Outputs — Research

**Researched:** 2026-05-03
**Domain:** DuckDB pipeline outputs (per-species parquet/JSON aggregation + per-species static SVG occurrence maps)
**Confidence:** HIGH (live DB queried; INT[12] parquet round-trip verified end-to-end through hyparquet; geometry bbox + sparsity measured)

<user_constraints>
## User Constraints (from REQUIREMENTS.md + ROADMAP.md + CLAUDE.md)

> No CONTEXT.md exists yet for Phase 78 — this section captures the load-bearing constraints from REQUIREMENTS.md (AGG-01..07, MAP-01..06), ROADMAP.md success criteria, and CLAUDE.md. The discuss-phase step (if run) may add a CONTEXT.md whose decisions section supersedes this list.

### Locked by REQUIREMENTS.md / ROADMAP success criteria

- **Output artifacts** at `public/data/`: `species.parquet`, `species.json`, `seasonality.json`, `species-maps/<slug>.svg` (one per species with `occurrence_count > 0`).
- **`species.parquet` columns (AGG-02)**: `scientificName`, `canonical_name`, `family`, `subfamily`, `tribe`, `genus`, `subgenus`, `specific_epithet`, `on_checklist BOOL`, `status`, `occurrence_count INT`, `specimen_count INT`, `provisional_count INT`, `first_occurrence_date DATE`, `last_occurrence_date DATE`, `month_histogram INT[12]`, `county_count INT`, `ecoregion_count INT`, `slug`.
- **Join shape (AGG-01)**: `ecdysis_data.occurrences` FULL OUTER JOIN `checklist_data.species` LEFT JOIN `inaturalist_data.taxon_lineage_extended`. Checklist-only species (zero occurrences) AND occurrence-only species (not on checklist) MUST both render.
- **`canonical_name` is the join key** (Phase 76 D-04, materialized on both `checklist_data.species` and `ecdysis_data.occurrences`).
- **`COALESCE(checklist, inat)` precedence (TAX-02)** for tribe/subfamily/subgenus values populated on the species row.
- **Slug invariant (AGG-03)**: SVG filename, `species.parquet.slug` column, and any future URL slug MUST agree byte-for-byte. Source: reuse `data/feeds.py::_slugify` (path-traversal-safe per v2.1).
- **`seasonality.json` (AGG-05)**: per-species × per-county × per-ecoregion-l3 monthly histograms, ~6 MB total budget. Powers filter-driven seasonality lookup without in-browser KDE.
- **SVG (MAP-01..06)**: viewBox `"0 0 600 320"`, inline fill/stroke (so plain `<img src=".svg">` works), one `<circle>` per occurrence point, off-WA-viewBox coordinates clipped silently with a non-zero null/clipped count logged but not raised.
- **WA county polygons (MAP-03)**: `geographies.us_counties` filtered `state_fips = '53'`, simplified via `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))`.
- **STEPS placement (AGG-01 / MAP-05)**: `("species-export", export_species_parquet)` and `("species-maps", generate_species_maps)` land in `data/run.py STEPS` AFTER `export` and BEFORE `feeds`, in that order.
- **Idempotency (success criterion 4)**: re-running the pipeline twice in a row produces identical artifacts.
- **Schema gate (AGG-06)**: `scripts/validate-schema.mjs` extended to verify `species.parquet` column set and `species.json` top-level shape.
- **Test command (AGG-07 / MAP-06)**: `cd data && uv run pytest test_species_export.py test_species_maps.py` covers FULL OUTER fixture (checklist-only / occurrence-only / matched) and SVG well-formedness.

### Locked by CLAUDE.md (project invariants)

- Static hosting only — pipeline writes files at build time; runtime never touches parquet.
- Python 3.14+ (data/pyproject.toml).
- The `speicmenLayer` typo in `bee-map.ts` is intentionally deferred — do NOT fix incidentally. (No frontend work in Phase 78 anyway.)

### Claude's Discretion (open at research time — recommendations below)

- Where the new modules live (`data/species_export.py`, `data/species_maps.py` recommended).
- How to bridge from `canonical_name` → `taxon_lineage_extended.taxon_id` for family/subfamily/tribe/genus/subgenus on the species row (lineage table is keyed by iNat `taxon_id`, NOT by `canonical_name`). This is a load-bearing planning decision — see §Pitfalls.
- Whether to use a Python SVG library or hand-roll via stdlib `xml.etree.ElementTree` (recommendation: ET — matches `data/feeds.py` precedent and zero new deps).
- Internal shape of `seasonality.json` (recommendation: nested dict with `species → {county|ecoregion → INT[12]}`; see §Architecture Patterns).
- How `run.py` STEPS de-duplicates occurrences for FULL OUTER inputs (recommendation: read from the just-written `public/data/occurrences.parquet` rather than re-running the export query).
- Lineage-bridge approach for non-WABA-observed checklist species (recommendation: layered fallback — see §Don't Hand-Roll).

### Deferred (OUT OF SCOPE for Phase 78)

- Photo manifest (Phase 79).
- Page scaffolding, taxon-nav UI, filter UX, seasonality viz rendering (Phases 79-80).
- Performance hardening, Lighthouse, accessibility (Phase 82).
- Multi-state generalization (`state_fips = '53'` is hard-coded for WA; future deferral noted).
- Consolidating the two iNat lineage tables (`inaturalist_waba_data.taxon_lineage` narrow vs. `inaturalist_data.taxon_lineage_extended` wide) — Phase 76 D-03 deferred to v3.3+.
- DuckDB WASM frontend direction (separate v1.7+ track per project memory).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGG-01 | `data/species_export.py::export_species_parquet` joins `ecdysis_data.occurrences` (FULL OUTER) with `checklist_data.species` and (LEFT) with `taxon_lineage_extended`; output → `public/data/species.parquet` | FULL OUTER on `canonical_name` verified — current data: 348 matched + 179 checklist-only + 208 occurrence-only = 735 total (queried live DB). Lineage LEFT JOIN bridge requires a name-to-taxon-id step (see §Pitfalls #1). |
| AGG-02 | 19-column `species.parquet` schema including `month_histogram INT[12]` and `slug` | DuckDB writes `INTEGER[12]` to parquet as a LIST (not a fixed-length array) — verified. Validator must check column presence + element type, not constraint. |
| AGG-03 | Slug from `data/feeds.py::_slugify` (path-traversal-safe) — agrees byte-for-byte across SVG filename, parquet `slug`, URL slug | `_slugify` reads as a pure function (`str -> str`); ASCII-fold + lowercase + non-alphanumeric strip + collapse hyphens; deterministic and safe. Compute ONCE in `species_export.py`, then `species_maps.py` reads it back from the parquet — never recomputes. |
| AGG-04 | `public/data/species.json` (flat array of species rows) emitted alongside `species.parquet` | Plain `json.dumps(rows_list, indent=2)` from the same in-memory DataFrame/list used to write the parquet. Must drop `month_histogram` column to keep JSON small (or rename `histogram` if needed for nav). Recommended: include all parquet cols; array column lands in JSON as a 12-element list — small. |
| AGG-05 | `public/data/seasonality.json` per-species × per-county × per-ecoregion-l3 monthly histograms, ~6 MB budget | Live data: 3,633 non-empty (species, county, ecoregion) cells, 556 species, 39 counties, 66 ecoregion_l3 (only ~13 dominate WA). Rough size estimate: 3,633 cells × ~120 bytes/row ≈ 450 KB pre-gzip — well under 6 MB. Sparsity is real; nested dict layout is natural. |
| AGG-06 | `scripts/validate-schema.mjs` extended to verify `species.parquet` columns + `species.json` top-level shape | Existing validator uses `hyparquet` for schema introspection. Pattern: append a new entry to the `EXPECTED` map; for JSON, add a small fetch-and-shape-check block. |
| AGG-07 | pytest synthetic fixture w/ checklist-only / occurrence-only / matched species; assert FULL OUTER produces correct card counts and zero-record species render | conftest.py already seeds 3 checklist rows + 2 ecdysis rows that exercise this — extend with one occurrence-only species (no checklist row) for the third arm. |
| MAP-01 | `data/species_maps.py::generate_species_maps` writes one SVG per species with `occurrence_count > 0` | Reads species.parquet (slug column) + occurrences with `canonical_name`. Filters to species where occurrence count > 0. |
| MAP-02 | viewBox `"0 0 600 320"` + inline fill/stroke so plain `<img src=".svg">` works | `<img>` does NOT execute scripts or external CSS — every style attribute MUST be inline. ET-based generation handles this naturally. |
| MAP-03 | WA county polygons via `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))`; per-occurrence `<circle>` with consistent radius + fill-opacity | Verified: 39 WA counties, bbox `(-124.85, 45.54) → (-116.92, 49.00)`. Linear lon→x and lat→y projection (no Mercator) for a 320-tall WA bbox is acceptable visually. Tolerance 0.005 (vs. existing 0.001 in `export.py`) yields chunkier polygons — fine for 600×320. |
| MAP-04 | Off-viewBox coords clipped silently; clipped count LOGGED but doesn't fail run | All 46,090 plotted occurrences have lat/lon — but real production data has off-WA outliers (CA collections etc.). Drop point + increment counter; emit `print(f"  species-maps/<slug>: clipped N points")`. NEVER raise. |
| MAP-05 | STEPS contains `("species-maps", generate_species_maps)` after `species-export` and before `feeds` | Current STEPS at run.py:33-44; insert at index 9 (after `export`, before `feeds`). |
| MAP-06 | pytest covers SVG XML well-formedness, `<circle>` count, viewBox attribute | `xml.etree.ElementTree.fromstring(content)` parses or raises — clean assertion. Count matches occurrences inside WA bbox for the fixture species. |
</phase_requirements>

## Summary

Phase 78 is a **two-step pipeline addition** that turns the canonical-name spine landed by Phase 76 into per-species artifacts the static-hosted Eleventy build can consume directly:

1. **`data/species_export.py::export_species_parquet`** runs a single multi-CTE DuckDB query that aggregates `ecdysis_data.occurrences` to a per-species row, FULL OUTER joins with `checklist_data.species`, LEFT joins with `inaturalist_data.taxon_lineage_extended` for taxonomic context, computes `slug` via `_slugify`, and writes three artifacts: `public/data/species.parquet`, `public/data/species.json`, `public/data/seasonality.json`.
2. **`data/species_maps.py::generate_species_maps`** reads the parquet (for the canonical slug list) plus occurrences (for `<circle>` points) and the WA county polygons (drawn once, reused per file), and writes one `<slug>.svg` per species with `occurrence_count > 0` using stdlib `xml.etree.ElementTree` — the same idiom `data/feeds.py` uses for Atom XML.

The two new STEPS land between `export` and `feeds` in `run.py` STEPS. Pure-pipeline work — no frontend touched. Idempotency comes from sorted iteration, deterministic slug computation, fixed JSON ordering (`sort_keys=True`), and ET's stable element ordering.

**Three load-bearing planning concerns** (each unpacked below):
1. **Lineage join is non-trivial.** `taxon_lineage_extended` is keyed by iNat `taxon_id`, NOT by `canonical_name`. The bridge from `canonical_name` to `taxon_id` is via `inaturalist_waba_data.observations.taxon__name` (canonicalized) → `taxon__id`. Live coverage check: only **227 / 738 (≈31%)** of species in the FULL OUTER union have a WABA observation linking them to the lineage table; the other ~70% will get NULL family/subfamily/tribe/subgenus from the iNat side and rely on `COALESCE(checklist, inat)` — but the checklist also leaves these NULL for the bulk-loaded rows (Phase 76 design). This means many species will render with no taxonomic context. **Phase 81's nav tree depends on these values** — Phase 78 must produce them, but the gap is real and either (a) needs a layered fallback (genus from canonical_name's first token; family from a small static genus→family map), or (b) is accepted as "expected NULL for ~500 species" with a CONTEXT.md acknowledgment.
2. **`INT[12]` parquet representation is a LIST, not a fixed-size array.** DuckDB declares `INTEGER[12]` syntactically but writes it as a parquet `LIST<INT32>` with no element-count constraint. Both `DESCRIBE SELECT * FROM read_parquet(...)` and `hyparquet`'s parsed schema show it as `INTEGER[]`. The validator must check structural shape (column exists, element type is `INT_32` / parent is `LIST`), NOT a `[12]` suffix. This was verified end-to-end with a live round-trip.
3. **The slug-equals-filename invariant is not enforced by code today.** `_slugify` is currently called only in `data/feeds.py` (collector + genus feeds, with collision-detection logic). For Phase 78 the planner MUST decide where slug computation lives: recommended is to compute it ONCE in `species_export.py` from `scientificName`, write it to the parquet's `slug` column, and have `species_maps.py` read `slug` from the parquet (never recompute it from `scientificName`). Drift here would silently 404. Pytest must assert this byte-for-byte invariant.

**Primary recommendation:** Land the work in 4 plans:
- **Plan 1** — `data/species_export.py` skeleton (DB query + parquet write only); validator extension for parquet columns; conftest extension for the third FULL OUTER arm; pytest fixture for column set.
- **Plan 2** — `species.json` + `seasonality.json` emission (extends `species_export.py`); validator extension for JSON shape.
- **Plan 3** — `data/species_maps.py` (SVG generation, off-WA clipping with logged count); pytest for XML well-formedness, `<circle>` count, viewBox.
- **Plan 4** — `run.py` STEPS wiring + integration tests (idempotency assertion: run twice, byte-compare artifacts) + UAT-grade smoke run.

Wave 0 is satisfied by the pytest fixture extensions in Plans 1 and 3 (extend `data/tests/conftest.py` first, then implement against the failing tests).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-species aggregation SQL (FULL OUTER + LEFT) | Database / Pipeline | — | DuckDB does the heavy join + group-by in one CTE chain; no Python row-loops. |
| Compute `slug` for each species row | Backend (Python utility) | Database | `_slugify` is pure-Python; called once per species during the parquet-emit step in Python land. Cannot live in SQL because the path-traversal-safe regex set lives in `feeds.py`. |
| Write `species.parquet` (incl. `INT[12]` array column) | Database / Pipeline | — | Written via DuckDB's `COPY ... TO '*.parquet' (FORMAT PARQUET)` — the existing export idiom. |
| Write `species.json` and `seasonality.json` | Backend (Python) | — | Plain `json.dumps(..., sort_keys=True, indent=2)`. Sorted dict ordering = idempotent. |
| Generate per-species SVG | Backend (Python) | Database | Read points + polygons from DuckDB; emit XML via stdlib `xml.etree.ElementTree`. Mirrors `data/feeds.py` Atom precedent. |
| WA county polygon simplification | Database / Pipeline | — | `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))` — DuckDB spatial extension, mirrors `export.py:280-283`. |
| Off-WA clipping + counter | Backend (Python) | — | Coordinate filter `lon ∈ [-124.85, -116.92] AND lat ∈ [45.54, 49.00]` applied in Python during SVG emission; non-zero clipped count printed to stdout. |
| Schema validation (parquet + JSON shape) | Build (Node) | — | `scripts/validate-schema.mjs` runs in CI before Eleventy. Pure read-only; no DuckDB. |
| Test (pytest) | Test | — | Two new test files (`test_species_export.py`, `test_species_maps.py`); shared session-scoped fixture in `data/tests/conftest.py`. |

**Why this matters:** All work is pipeline-side / build-side. Zero frontend changes. The map is included so the planner can sanity-check that no task accidentally lands a `src/` edit.

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `duckdb` | `>=1.4,<2` | Embedded analytical DB; runs FULL OUTER JOIN, writes parquet, returns geometry GeoJSON via `spatial` extension | Already the project's data store. [VERIFIED: data/pyproject.toml] |
| `xml.etree.ElementTree` | stdlib | SVG emission via append-and-serialize element tree | Already used by `data/feeds.py` for Atom XML — same idiom transfers cleanly. [VERIFIED: data/feeds.py:21] |
| `json` | stdlib | `species.json` + `seasonality.json` emission with `sort_keys=True` for idempotency | [VERIFIED: stdlib] |
| `csv`, `re`, `unicodedata` | stdlib | Already used by `data/feeds.py::_slugify` (re-exported in Phase 78 unchanged) | [VERIFIED: data/feeds.py:18-21] |
| `pytest` | `>=9.0.2` | Test runner | Already in dev deps. [VERIFIED: data/pyproject.toml] |
| `hyparquet` | (Node, in `package.json`) | Read parquet schema in `validate-schema.mjs` for AGG-06 column check | Already a dep — used by the existing schema gate. [VERIFIED: scripts/validate-schema.mjs:15] |

**Verified availability** (Bash probe in env): `xml.etree.ElementTree` present; `svgwrite`, `drawsvg`, `lxml` NOT installed. [VERIFIED 2026-05-03 in `cd data && uv run python -c "import …"`]

### Supporting

None. **Phase 78 ships zero new dependencies.**

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stdlib `xml.etree.ElementTree` for SVG | `svgwrite`, `drawsvg`, or `lxml` | Adds a new dep for ~20 LOC of element building; `feeds.py` already uses ET for XML and is the closer-to-home precedent. SVG is simple enough (county `<path>` + N `<circle>`) that ET is the right hammer. **Reject.** [VERIFIED: env probe shows none of these installed; ET is.] |
| `data/feeds.py::_slugify` reuse | New `_slugify` copy in `species_export.py` | Duplication breaks the byte-for-byte invariant if either copy drifts. **Use the imported function.** Acceptable to import via `from feeds import _slugify` (single-underscore = "by-convention private but importable"); the planner may instead promote `_slugify` to a new `data/_slug.py` shared helper module if circular-import risk emerges. [ASSUMED — circular import risk depends on `feeds.py`'s top-level imports; verify in plan 1.] |
| Per-species DuckDB query in a Python loop | Single multi-CTE query that emits ALL species rows at once | Looping in Python over 700+ species would issue 700+ SQL round-trips. Single-query approach mirrors `export.py::export_occurrences_parquet` which already does exactly this for the occurrences table. **Single-query.** |
| Compute `slug` in SQL via `regexp_replace`/`lower` | Compute `slug` in Python via `_slugify` import | `_slugify` does Unicode NFKD ASCII-fold which DuckDB SQL cannot easily replicate (stdlib `unicodedata` is Python-only). Computing in Python guarantees the byte-for-byte invariant with feed slugs already on disk. **Python.** |
| Load county polygons via `ST_AsGeoJSON` once into Python | Re-query for each species | Polygons don't change per-species. Load 39 simplified polygon GeoJSON strings once at the top of `species_maps.py::main()`, build the SVG `<path>` fragments once, and reuse them in every species file. |
| Hand-roll SVG `<path d="...">` from GeoJSON polygon coordinates | Use a GeoJSON-to-SVG library | The conversion is ~15 lines of Python (iterate rings, emit `M x y L x y …Z`). No new dep. |
| `ST_SimplifyPreserveTopology(geom, 0.005)` (per MAP-03) | `ST_Simplify(geom, 0.005)` | `PreserveTopology` matches the existing `export.py` precedent (`tolerance=0.001` for the SPA map; we use `0.005` for the smaller SVG map per MAP-03). Keeps shared coastline behavior consistent. |

**Installation:**
```bash
# No new packages. Sanity-check the existing env:
cd data && uv sync
```

**Version verification:** No new packages to verify. All stdlib + existing project deps.

## Architecture Patterns

### System Architecture Diagram

```
                   ┌──────────────────────────────────────────────────────┐
                   │   Phase 76 outputs (already on disk in DuckDB)       │
                   │   - checklist_data.species (canonical_name, status, …) │
                   │   - ecdysis_data.occurrences (canonical_name, lat/lon, …)│
                   │   - inaturalist_data.taxon_lineage_extended (taxon_id, family/…)│
                   │   - inaturalist_waba_data.observations (taxon__name → taxon__id)│
                   │   - geographies.us_counties (geom, state_fips='53')   │
                   └────────────────────┬─────────────────────────────────┘
                                        │
                                        ▼
   STEPS: ecdysis → … → anti-entropy → checklist → export → species-export → species-maps → feeds
                                                              │           │
                                                              │           └── reads species.parquet (slugs)
                                                              │               + ecdysis occurrences (points)
                                                              │               + WA county polygons
                                                              │               → public/data/species-maps/*.svg
                                                              │
                                                              ▼
                                                      ┌────────────────────────────────────────┐
                                                      │ data/species_export.py                 │
                                                      │ ─ single multi-CTE DuckDB query        │
                                                      │   (FULL OUTER + LEFT lineage)          │
                                                      │ ─ compute slug via _slugify (Python)   │
                                                      │ ─ COPY … TO public/data/species.parquet│
                                                      │ ─ json.dumps(species_rows) → species.json│
                                                      │ ─ json.dumps(seasonality) → seasonality.json│
                                                      └────────────────────┬───────────────────┘
                                                                           │ slug column
                                                                           ▼
                                                      ┌────────────────────────────────────────┐
                                                      │ data/species_maps.py                   │
                                                      │ ─ load 39 simplified WA county polygons│
                                                      │   (ST_AsGeoJSON … 0.005)               │
                                                      │ ─ pre-build county <path> SVG fragment │
                                                      │ ─ for each species (slug from parquet):│
                                                      │     fetch occurrences with canonical_name│
                                                      │     filter to WA bbox (count clipped) │
                                                      │     emit <slug>.svg via ET             │
                                                      └────────────────────┬───────────────────┘
                                                                           │
                                                                           ▼
                                                              public/data/species-maps/*.svg
                                                                           │
                                                                           ▼
                                                              CI: scripts/validate-schema.mjs
                                                              (asserts species.parquet + species.json shape)
```

### Recommended Project Structure

```
data/
├── species_export.py          # NEW — export_species_parquet() + species.json + seasonality.json
├── species_maps.py            # NEW — generate_species_maps()
├── run.py                     # MODIFIED — STEPS gains 2 entries between export and feeds
├── feeds.py                   # UNCHANGED — _slugify imported from here
└── tests/
    ├── conftest.py            # MODIFIED — extend fixture: 3rd FULL OUTER arm + WA county polygon
    ├── test_species_export.py # NEW — FULL OUTER fixture, parquet schema, json shape, seasonality budget
    └── test_species_maps.py   # NEW — SVG well-formedness, <circle> count, viewBox

public/data/                   # Pipeline output (gitignored except for occasional snapshots)
├── species.parquet            # NEW
├── species.json               # NEW
├── seasonality.json           # NEW
└── species-maps/              # NEW
    └── <slug>.svg             # one per species with occurrence_count > 0

scripts/
└── validate-schema.mjs        # MODIFIED — add species.parquet + species.json entries
```

### Pattern 1: FULL OUTER JOIN aggregation query

**What:** A single multi-CTE DuckDB query producing one row per `canonical_name` from the union of checklist + occurrences. LEFT JOIN to lineage via a name-bridge.

**When to use:** Whenever the species universe must include both checklist-only (zero occurrence) and occurrence-only (not on checklist) rows.

**Example:**
```sql
-- data/species_export.py — primary export query
WITH occurrences_agg AS (
    SELECT
        canonical_name,
        COUNT(*) AS occurrence_count,
        SUM(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END) AS specimen_count,
        SUM(CASE WHEN /* WABA-only / unmatched WABA — see export.py is_provisional logic */
                 0 = 1 THEN 1 ELSE 0 END) AS provisional_count,
        MIN(event_date::DATE) AS first_occurrence_date,
        MAX(event_date::DATE) AS last_occurrence_date,
        -- 12-element histogram via list_value with positional sums
        list_value(
            SUM(CASE WHEN month::INT = 1  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 2  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 3  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 4  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 5  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 6  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 7  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 8  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 9  THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 10 THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 11 THEN 1 ELSE 0 END),
            SUM(CASE WHEN month::INT = 12 THEN 1 ELSE 0 END)
        )::INTEGER[12] AS month_histogram,
        -- counties / ecoregions need the public/data/occurrences.parquet
        -- (those columns are computed there). Read it back as a CTE input.
        NULL AS county_count,    -- placeholder — see Pattern 2
        NULL AS ecoregion_count  -- placeholder — see Pattern 2
    FROM ecdysis_data.occurrences
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
),
-- Name-bridge: canonical_name -> iNat taxon_id (see Pitfall #1)
name_to_taxon AS (
    SELECT lower(trim(taxon__name)) AS canonical_name, MIN(taxon__id) AS taxon_id
    FROM inaturalist_waba_data.observations
    WHERE taxon__id IS NOT NULL AND taxon__rank = 'species'
    GROUP BY lower(trim(taxon__name))
),
species_universe AS (
    -- FULL OUTER on canonical_name keeps both checklist-only and occurrence-only rows
    SELECT
        COALESCE(c.scientificName, o.canonical_name) AS scientificName,
        COALESCE(c.canonical_name, o.canonical_name) AS canonical_name,
        c.scientificName IS NOT NULL AS on_checklist,
        c.status,
        c.specific_epithet,
        -- TAX-02 precedence: checklist value first, iNat ancestor second
        COALESCE(c.family, tle.family) AS family,
        COALESCE(c.subfamily, tle.subfamily) AS subfamily,
        COALESCE(c.tribe, tle.tribe) AS tribe,
        COALESCE(c.genus, tle.genus, split_part(o.canonical_name, ' ', 1)) AS genus,
        COALESCE(c.subgenus, tle.subgenus) AS subgenus,
        COALESCE(oa.occurrence_count, 0) AS occurrence_count,
        COALESCE(oa.specimen_count, 0) AS specimen_count,
        COALESCE(oa.provisional_count, 0) AS provisional_count,
        oa.first_occurrence_date,
        oa.last_occurrence_date,
        COALESCE(oa.month_histogram, [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[12]) AS month_histogram,
        COALESCE(oa.county_count, 0) AS county_count,
        COALESCE(oa.ecoregion_count, 0) AS ecoregion_count
    FROM checklist_data.species c
    FULL OUTER JOIN occurrences_agg oa ON oa.canonical_name = c.canonical_name
    LEFT JOIN occurrences_canon_distinct o ON o.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN name_to_taxon n ON n.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN inaturalist_data.taxon_lineage_extended tle ON tle.taxon_id = n.taxon_id
)
SELECT * FROM species_universe;
-- slug column added in Python after the fetch (via _slugify)
```

**Why this shape:**
- `FULL OUTER JOIN` on the ALREADY-AGGREGATED `occurrences_agg` (not on raw `ecdysis_data.occurrences`) keeps both arms one-row-per-species, so checklist-only and occurrence-only species each appear exactly once.
- `LEFT JOIN name_to_taxon` is the lineage bridge (see Pitfalls).
- `COALESCE(c.genus, tle.genus, split_part(o.canonical_name, ' ', 1))` falls back to the first token of `canonical_name` for genus when neither checklist nor lineage has it — this is the cheapest way to get a non-NULL genus for the ~70% of species that won't have a WABA observation linking them to lineage.

### Pattern 2: County / ecoregion counting via `public/data/occurrences.parquet`

**What:** `county_count` and `ecoregion_count` per species require knowing which county/ecoregion each occurrence falls in. That logic is already in `data/export.py::export_occurrences_parquet` (the `with_county` / `with_eco` CTEs). Re-running it is wasteful AND adds duplicate logic.

**When to use:** Always. `species-export` runs AFTER `export` in STEPS, so `public/data/occurrences.parquet` is already on disk and carries `county` + `ecoregion_l3` + `canonical_name`.

> **Caveat:** the current `occurrences.parquet` does NOT carry `canonical_name`. Phase 78 plan 1 must extend `data/export.py` to add it (one extra CTE column). Verified against the on-disk parquet 2026-05-03.

**Example:**
```python
# Inside species_export.py — after the canonical occurrences.parquet has canonical_name added
con.execute(f"""
    CREATE TEMP VIEW occ_with_geo AS
    SELECT canonical_name, county, ecoregion_l3, year, month
    FROM read_parquet('{ASSETS_DIR / "occurrences.parquet"}')
    WHERE canonical_name IS NOT NULL
""")
# The aggregation query then JOINs the universe to (county_count, ecoregion_count) from occ_with_geo
```

### Pattern 3: `seasonality.json` shape

**What:** Nested JSON keyed by canonical_name → bucket → 12-element int array. "bucket" is one of `"_total"`, `"county:<name>"`, `"ecoregion_l3:<name>"`. The frontend (Phase 81 VIZ-04) does an O(1) lookup on the active filter selection.

**When to use:** Always for AGG-05. Avoids in-browser KDE; pre-binned at build time.

**Example:**
```json
{
  "Andrena anograe": {
    "_total":             [0, 0, 0, 5, 21, 38, 12, 2, 0, 0, 0, 0],
    "county:King":        [0, 0, 0, 1, 8, 12, 2, 0, 0, 0, 0, 0],
    "county:Pierce":      [0, 0, 0, 4, 13, 26, 10, 2, 0, 0, 0, 0],
    "ecoregion_l3:Puget Lowland": [0, 0, 0, 5, 21, 38, 12, 2, 0, 0, 0, 0]
  },
  "Bombus melanopygus": { … }
}
```

**Size estimate (live data):** 3,633 non-empty (species, county, ecoregion) cells + 556 species × ~14 active counties/ecoregions ≈ ~12,000 12-element int arrays. At ~50 bytes per array + key, ≈ **600 KB raw, ~150 KB gzipped**. Well under the 6 MB budget. [VERIFIED via DuckDB query on live DB 2026-05-03.]

**Generation pattern:**
```python
# Inside species_export.py
import json
from collections import defaultdict

# species -> bucket -> [12]int
seasonality: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0]*12))

rows = con.execute("""
    SELECT canonical_name, county, ecoregion_l3, month::INT - 1 AS m_idx
    FROM read_parquet(?)
    WHERE canonical_name IS NOT NULL AND month IS NOT NULL
""", [str(ASSETS_DIR / "occurrences.parquet")]).fetchall()

for canon, county, eco, m in rows:
    if m is None or not (0 <= m < 12):
        continue
    seasonality[canon]["_total"][m] += 1
    if county:
        seasonality[canon][f"county:{county}"][m] += 1
    if eco:
        seasonality[canon][f"ecoregion_l3:{eco}"][m] += 1

# Convert defaultdicts to plain dicts for JSON; sort_keys for idempotency
out = {k: dict(sorted(v.items())) for k, v in sorted(seasonality.items())}
(ASSETS_DIR / "seasonality.json").write_text(
    json.dumps(out, sort_keys=True, separators=(',', ':')),
    encoding='utf-8'
)
```

`separators=(',', ':')` shaves ~30% off vs. the default `(', ', ': ')` — important if the output approaches the budget on real production data.

### Pattern 4: SVG generation via stdlib `xml.etree.ElementTree`

**What:** Build SVG element tree once for the county polygon backdrop; for each species, deepcopy the backdrop and append `<circle>` children for each occurrence point. Serialize via `ET.tostring(root, xml_declaration=True, encoding='unicode')` — same idiom `data/feeds.py:117-124` uses for Atom XML.

**When to use:** Always for MAP-01..06. Stdlib only.

**Example:**
```python
# data/species_maps.py
import json
import xml.etree.ElementTree as ET
from pathlib import Path

VIEWBOX = "0 0 600 320"
WA_BBOX = (-124.848974, 45.543541, -116.916071, 49.002072)  # (minlon, minlat, maxlon, maxlat)
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace('', SVG_NS)

def _project(lon: float, lat: float) -> tuple[float, float]:
    """Linear lon/lat → SVG (x, y). y inverted (SVG +y is down)."""
    minx, miny, maxx, maxy = WA_BBOX
    x = (lon - minx) / (maxx - minx) * 600.0
    y = 320.0 - (lat - miny) / (maxy - miny) * 320.0
    return x, y

def _in_bbox(lon: float, lat: float) -> bool:
    minx, miny, maxx, maxy = WA_BBOX
    return minx <= lon <= maxx and miny <= lat <= maxy

def _ring_to_path(coords: list[list[float]]) -> str:
    """GeoJSON ring → SVG 'M x y L x y … Z' path d-attribute."""
    pts = [_project(lon, lat) for lon, lat in coords]
    head = f"M{pts[0][0]:.2f},{pts[0][1]:.2f}"
    tail = "".join(f"L{x:.2f},{y:.2f}" for x, y in pts[1:])
    return head + tail + "Z"

def _build_county_backdrop(county_geojsons: list[dict]) -> ET.Element:
    """Build an <svg> root with viewBox + 39 county <path> children. Deepcopy per file."""
    root = ET.Element(f"{{{SVG_NS}}}svg", attrib={
        "viewBox": VIEWBOX,
        "xmlns": SVG_NS,
        "width": "600",
        "height": "320",
    })
    g = ET.SubElement(root, f"{{{SVG_NS}}}g", attrib={
        "fill": "#f4f4f0",
        "stroke": "#888",
        "stroke-width": "0.5",
    })
    for geom in county_geojsons:
        # geom is {"type": "Polygon"|"MultiPolygon", "coordinates": …}
        if geom["type"] == "Polygon":
            d = " ".join(_ring_to_path(ring) for ring in geom["coordinates"])
        else:  # MultiPolygon
            d = " ".join(
                _ring_to_path(ring)
                for poly in geom["coordinates"]
                for ring in poly
            )
        ET.SubElement(g, f"{{{SVG_NS}}}path", attrib={"d": d})
    return root

def write_species_svg(slug: str, points: list[tuple[float, float]], backdrop: ET.Element, out_dir: Path) -> int:
    """Returns count of clipped (out-of-bbox) points."""
    import copy
    root = copy.deepcopy(backdrop)
    pts_g = ET.SubElement(root, f"{{{SVG_NS}}}g", attrib={
        "fill": "#c44",
        "fill-opacity": "0.6",
        "stroke": "none",
    })
    clipped = 0
    for lon, lat in points:
        if not _in_bbox(lon, lat):
            clipped += 1
            continue
        x, y = _project(lon, lat)
        ET.SubElement(pts_g, f"{{{SVG_NS}}}circle", attrib={
            "cx": f"{x:.2f}",
            "cy": f"{y:.2f}",
            "r": "2.5",
        })
    out_path = out_dir / f"{slug}.svg"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        ET.tostring(root, xml_declaration=True, encoding='unicode'),
        encoding='utf-8',
    )
    return clipped
```

### Pattern 5: Validator extension (AGG-06)

**What:** Append entries to `EXPECTED` in `scripts/validate-schema.mjs` for `species.parquet` + a new JSON-shape check for `species.json`.

**Example:**
```js
// scripts/validate-schema.mjs (extension)
const EXPECTED = {
  'occurrences.parquet': [ /* existing list */ ],
  'species.parquet': [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date',
    'month_histogram',          // structural check below
    'county_count', 'ecoregion_count', 'slug',
  ],
};

// After the existing parquet loop:
const speciesJsonPath = useLocal
  ? join(ASSETS_DIR, 'species.json')
  : null;
let speciesJson;
if (useLocal && existsSync(speciesJsonPath)) {
  speciesJson = JSON.parse(await readFile(speciesJsonPath, 'utf-8'));
} else if (!useLocal) {
  const r = await fetch(CLOUDFRONT_BASE + 'species.json');
  speciesJson = r.ok ? await r.json() : null;
}
if (speciesJson) {
  if (!Array.isArray(speciesJson)) {
    console.error('x species.json: expected top-level array');
    failed = true;
  } else if (speciesJson.length === 0) {
    console.warn('! species.json: empty array (pipeline may not have run)');
  } else {
    const required = ['scientificName', 'canonical_name', 'on_checklist', 'occurrence_count', 'slug'];
    const missing = required.filter(k => !(k in speciesJson[0]));
    if (missing.length) {
      console.error(`x species.json: row[0] missing keys: ${missing.join(', ')}`);
      failed = true;
    } else {
      console.log('ok species.json');
    }
  }
}
```

**Key insight on `month_histogram`:** Don't try to assert `INT[12]` literally. The hyparquet schema for the column shows `LIST<INT_32>` (no length constraint). Asserting "column exists" + (optionally) "first row's `month_histogram` is a 12-element array" is the right shape.

### Anti-Patterns to Avoid

- **Recomputing `slug` in `species_maps.py`.** Always read from the parquet's `slug` column. Drift = 404.
- **Using `<object>` or inline `<svg>` to embed maps.** REQUIREMENTS mandates `<img src=".svg">`. That means inline fill/stroke ONLY; no `<style>` tag, no external CSS, no `<script>`.
- **Per-species DuckDB query loop.** Single multi-CTE query keeps the pipeline under 5 seconds.
- **`ST_Within` per occurrence point in `species_maps.py`.** That's already done in `export.py` via the on-disk `occurrences.parquet`. Re-doing it would add ~30s. Just read `county` / `ecoregion_l3` from the parquet.
- **`json.dumps` without `sort_keys=True`.** Python 3.7+ preserves dict insertion order, but cross-platform / cross-version determinism requires explicit sort. Idempotency depends on it.
- **Raising on non-zero clipped count.** MAP-04: clipping is silent + logged. Off-WA points DO occur in production data.
- **Putting `species-maps` STEP before `species-export` STEP.** `species_maps.py` reads `slug` from the parquet — it MUST run after `species-export`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL-safe slug from species name | New regex / lower-and-strip | `from feeds import _slugify` | Path-traversal hardening already there (v2.1). Drift from `feeds.py` would silently break the byte-for-byte invariant with feed slugs. |
| Polygon simplification for SVG | `shapely`, custom Ramer-Douglas-Peucker | DuckDB `ST_SimplifyPreserveTopology(geom, 0.005)` | Mirrors `data/export.py:280-283`. Spatial extension already loaded. No new Python dep. |
| GeoJSON coordinate iteration | Custom GeoJSON walker | Plain `for ring in geom["coordinates"]: for lon, lat in ring:` | GeoJSON is a tiny spec. The 3 cases (Polygon / MultiPolygon / Point) are 5 lines. |
| XML escaping in SVG | Manual string concat with `<` `&` escapes | `xml.etree.ElementTree` element building | ET handles attribute / text escaping correctly; manual concat will silently produce invalid XML. |
| Parquet schema introspection | New parser | `hyparquet` (already a dep) | `parquetMetadataAsync` returns the same schema shape used by the existing validator — extend, don't replace. |
| In-browser monthly histogram from raw points | Anything | Pre-built `seasonality.json` | This is the entire reason AGG-05 exists. Frontend lookup is O(1). |
| Family/tribe lookup for species without WABA observations | Custom `genus -> family` mega-table | Genus fallback from `split_part(canonical_name, ' ', 1)` + accept NULL family/tribe in Phase 78 (Phase 81 nav handles NULL gracefully) | A static genus→family map drifts; Phase 81 NAV-02 already gracefully omits absent ranks; v3.3+ DwC-A migration will solve this properly per project memory. |

**Key insight:** Phase 78 is a thin transformation layer. It does NOT introduce new domain logic. Every transformation either calls into Phase 76's already-shipped infrastructure (canonical_name, lineage table) or re-uses an existing pattern (`_slugify`, `ST_AsGeoJSON`, ET XML emission, `COPY ... TO PARQUET`).

## Runtime State Inventory

> Phase 78 is **greenfield**: all artifacts are net-new. No rename / refactor surface. Source occurrences and checklist tables landed in Phase 76 are already in DuckDB.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — Phase 78 emits NEW artifacts (species.parquet, species.json, seasonality.json, *.svg) | None |
| Live service config | None | None |
| OS-registered state | `data/nightly.sh` cron on maderas runs `data/run.py` end-to-end — picks up new STEPS automatically (mirrors Phase 76 wiring); CDK Lambda artifacts exist but are NOT the active execution path per CLAUDE.md "Known State" | None — STEPS list edits are auto-discovered |
| Secrets/env vars | `DB_PATH`, `EXPORT_DIR` already used by export.py / feeds.py | None — same env vars work for new modules |
| Build artifacts / installed packages | `data/__pycache__` / `data/.uv*` regenerate; no installed packages added | None |

**Verified:** `ls /Users/rainhead/dev/beeatlas/public/data/` shows `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson`, `feeds/`. None of the Phase 78 outputs exist yet — pure additive.

## Common Pitfalls

### Pitfall 1: `taxon_lineage_extended` is keyed by `taxon_id`, NOT `canonical_name`

**What goes wrong:** Naively writing `LEFT JOIN inaturalist_data.taxon_lineage_extended tle ON tle.canonical_name = species.canonical_name` would compile cleanly (DuckDB doesn't fail on a non-existent column until it actually runs the query) — except it WOULD fail because `tle.canonical_name` doesn't exist. The lineage table only has `taxon_id` as a join key.
**Why it happens:** Phase 76 D-04 chose name-based canonical join keys for checklist/occurrences but left the lineage table as iNat-id-keyed (D-03 was scoped tight). The bridge across these key systems is a hidden dependency.
**How to avoid:** Use a CTE name-bridge: `name_to_taxon` from `inaturalist_waba_data.observations` (canonical iNat taxon name → taxon_id), then join `tle` via that bridge.
**Coverage gap (live data):** **only 227 / 738 (~31%)** of species in the FULL OUTER union have lineage hits via this bridge. The remaining ~70% will get NULL family/subfamily/tribe/subgenus from the iNat side. Mitigation per Pattern 1: `COALESCE(c.genus, tle.genus, split_part(canonical_name, ' ', 1))` ensures genus is always populated; family / tribe / subgenus accept NULL. **Plan-time decision:** confirm this is acceptable, or add a static `data/genus_family_map.csv` fallback. [VERIFIED: queried live DB 2026-05-03.]
**Warning signs:** Phase 81 nav tree shows hundreds of species under "(no family)" — that means lineage bridge missed them.

### Pitfall 2: `INTEGER[12]` writes as parquet `LIST<INT32>`, not a fixed-length array

**What goes wrong:** Validator might try to assert `INT[12]` constraint, or downstream consumer assumes element count enforcement. DuckDB syntactic constraint is dropped at parquet level.
**Why it happens:** Parquet's logical types include `LIST` but no fixed-length array. DuckDB serializes both `INTEGER[]` and `INTEGER[12]` to the same parquet shape.
**How to avoid:** (a) Validator checks column existence + element shape only, not length. (b) DuckDB-side, use `::INTEGER[12]` for the cast (asserts the runtime length at write time — verified: `list_value(...)::INTEGER[12]` raises if the length is wrong). (c) Test fixture asserts `len(row['month_histogram']) == 12`.
**Warning signs:** `DESCRIBE SELECT * FROM read_parquet('species.parquet')` shows `INTEGER[]` (not `INTEGER[12]`); hyparquet schema shows a `LIST` node with `INT32` element. Both are EXPECTED — this is not a bug.
**[VERIFIED: round-trip in DuckDB + hyparquet 2026-05-03 against /tmp/_test_int12.parquet]**

### Pitfall 3: Slug drift between `_slugify`-on-write and `_slugify`-on-read

**What goes wrong:** `species_maps.py` recomputes `_slugify(scientificName)` to find the SVG filename, but `species_export.py` already wrote that slug as a column. Any difference (e.g., one path uses `scientificName`, the other uses `canonical_name`) silently 404s the link from a species card.
**Why it happens:** The slug invariant is documented in REQUIREMENTS but not enforced by code. Easy to introduce drift without a test.
**How to avoid:** (a) `species_maps.py` reads `slug` from `species.parquet`'s `slug` column. (b) Pytest asserts `_slugify(row.scientificName) == row.slug` for every row in `species.parquet`. (c) Pytest asserts `(public/data/species-maps / f"{row.slug}.svg").exists()` for every row with `occurrence_count > 0`.
**Warning signs:** Production species page shows broken `<img>` for species with non-ASCII or punctuation in the name.

### Pitfall 4: `<img src=".svg">` does NOT execute scripts or external CSS

**What goes wrong:** SVG looks fine in the browser when opened directly (it inherits page CSS), but renders un-styled inside an `<img>` tag because `<img>` treats SVG as an opaque image with no style cascade.
**Why it happens:** Browsers run SVG in two modes: "image mode" (inside `<img>`) — no scripts, no external CSS, no `<style>` blocks loaded externally; vs. "interactive mode" (inline `<svg>`) — full CSS inheritance.
**How to avoid:** EVERY style attribute on EVERY element is inline (`fill="..." stroke="..."` as XML attributes, not via `<style>`). MAP-02 mandates this.
**Warning signs:** SVG opens correctly via direct URL but renders black-on-black (or invisibly) inside an `<img>` tag.

### Pitfall 5: Off-WA occurrence points crash an over-eager validator

**What goes wrong:** Plan-time pytest asserts "every occurrence point lies inside WA bbox," fails on real production data, blocks the build.
**Why it happens:** Production occurrences include CA-collected specimens, OR-collected, etc. The fixture used in tests has no off-bbox points but production does.
**How to avoid:** MAP-04 mandates: clipped points are SILENTLY dropped + counter incremented + `print(f"  species-maps/<slug>: {clipped} points clipped")`. Pytest asserts the counter is INCREMENTED on a fixture row with deliberately off-bbox coordinates, not that the count is zero.
**Warning signs:** First nightly run after deploy fails with `AssertionError: occurrence point outside WA bbox`.

### Pitfall 6: Idempotency breaks via dict iteration order

**What goes wrong:** `seasonality.json` has the same keys + values on two consecutive runs but different byte-for-byte content because Python dict iteration order varies (or appears to vary across pyc-cache states).
**Why it happens:** `json.dumps` defaults to insertion order. If the input dict was built via repeated `.append`-style updates from a non-deterministic SQL row order, two runs can produce different JSON.
**How to avoid:** ALWAYS pass `sort_keys=True` to `json.dumps` for both `species.json` (rows already sorted in SQL via `ORDER BY canonical_name`) and `seasonality.json` (nested — `sort_keys=True` recursively sorts at each level).
**Warning signs:** `git diff public/data/seasonality.json` after two consecutive `data/run.py` invocations shows reordered keys but no actual content changes.

### Pitfall 7: FULL OUTER duplicates if the join key isn't unique on both sides

**What goes wrong:** `canonical_name` appears more than once on either side of the FULL OUTER → species row appears twice in the output, breaks the species page.
**Why it happens:** Checklist side: `checklist_data.species` PRIMARY KEY is `scientificName`, NOT `canonical_name` — and Phase 76 reconciliation may UPDATE `canonical_name` to a synonym, which could collide with another row's canonical_name. Live data check needed. Occurrences side: aggregated to one-row-per-canonical_name in the `occurrences_agg` CTE, so safe by construction.
**How to avoid:** (a) Aggregate the checklist side too (`SELECT DISTINCT ON (canonical_name) ...` or wrap in a `GROUP BY canonical_name` CTE). (b) Pytest asserts `COUNT(*) = COUNT(DISTINCT canonical_name)` on `species.parquet`.
**Warning signs:** Card count > unique species count; nav tree shows duplicate species; `assert len(rows) == len(set(r.canonical_name for r in rows))` fails.

### Pitfall 8: Reading `occurrences.parquet` before `export` has run

**What goes wrong:** Local dev runs `python species_export.py` directly (without going through `run.py`), `occurrences.parquet` doesn't exist or is stale.
**Why it happens:** Each module is independently runnable for dev convenience; STEPS ordering in `run.py` is the only thing that enforces the dependency.
**How to avoid:** `species_export.py::main()` checks `(ASSETS_DIR / "occurrences.parquet").exists()` and raises a clear error if not. Pytest fixture creates it programmatically.
**Warning signs:** `FileNotFoundError: occurrences.parquet` in dev; or stale county counts.

## Code Examples

Verified patterns from existing repository sources:

### Existing `_slugify` (DO NOT modify; import as-is)
```python
# Source: data/feeds.py:132-148 (verbatim)
def _slugify(value: str) -> str:
    """Convert a human name or place name to a URL-safe ASCII slug.
    Strips all characters that are not [a-z0-9-], preventing path traversal
    (../) and special characters in filenames.
    """
    value = unicodedata.normalize('NFKD', value)
    value = value.encode('ascii', 'ignore').decode('ascii')
    value = value.lower()
    value = re.sub(r'[\s_.,]+', '-', value)
    value = re.sub(r'[^a-z0-9-]', '', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-') or 'unknown'
```

Sample inputs:
- `_slugify("Andrena anograe") == "andrena-anograe"`
- `_slugify("Lasioglossum (Dialictus) zonulum") == "lasioglossum-dialictus-zonulum"` ⚠️ — NOTE: this is the RAW name, not the canonical. Pass `scientificName` (the bare binomial after Phase 76 D-04 stripping is in `canonical_name`, but for slug we want the human-readable bare-bones version).
- `_slugify("Bombus huntii") == "bombus-huntii"`

**Slug source recommendation:** Use `canonical_name` (Phase 76 already strips parens, lowercase, etc.) — `_slugify("lasioglossum zonulum") == "lasioglossum-zonulum"`. Cleaner outputs.

### Existing `COPY ... TO PARQUET` (template for `species.parquet`)
```python
# Source: data/export.py:23-258 (existing occurrences.parquet idiom)
con.execute(f"""
COPY (
    -- multi-CTE SELECT producing one row per species
    WITH species_universe AS ( ... ),
         …
    SELECT * FROM species_universe ORDER BY canonical_name
) TO '{out}' (FORMAT PARQUET, CODEC 'SNAPPY')
""")
```

### Existing ET-based XML emission (template for SVG)
```python
# Source: data/feeds.py:117-124 (verbatim Atom XML idiom — same shape works for SVG)
tree = ET.ElementTree(feed)
ET.indent(tree, space='  ')
out_path.parent.mkdir(parents=True, exist_ok=True)
result = ET.tostring(feed, xml_declaration=True, encoding='unicode')
out_path.write_text(result, encoding='utf-8')
```

### Existing `ST_AsGeoJSON` + `ST_SimplifyPreserveTopology` (template for county polygon load)
```python
# Source: data/export.py:278-283 (verbatim — change tolerance from 0.001 to 0.005)
rows = con.execute("""
SELECT name AS NAME,
       ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))
FROM geographies.us_counties
WHERE state_fips = '53'
""").fetchall()
geojsons = [json.loads(g) for _, g in rows]
```

### `INTEGER[12]` round-trip (verified)
```python
# Verified end-to-end 2026-05-03
con.execute("CREATE TABLE t (name VARCHAR, hist INTEGER[12])")
con.execute("INSERT INTO t VALUES ('a', [1,2,3,4,5,6,7,8,9,10,11,12])")
con.execute("COPY t TO '/tmp/_test_int12.parquet' (FORMAT PARQUET)")
# Read-back via DuckDB:
con2.execute("SELECT * FROM read_parquet('/tmp/_test_int12.parquet')")
# Returns ('a', [1,2,3,4,5,6,7,8,9,10,11,12]) — Python list of length 12.
# DESCRIBE shows INTEGER[] (not INTEGER[12]) — the [12] suffix is lost on read-back.
# hyparquet sees: LIST node with INT32 element type — same.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-browser KDE for seasonality bars | Pre-binned `seasonality.json` lookups | Phase 78 (this phase) — explicit AGG-05 | Cuts client compute; powers Phase 81 VIZ-04 |
| Headless-browser SVG capture from a Vega/D3 spec | Hand-rolled SVG via stdlib ET | Phase 78 — locked in seed (REQUIREMENTS Out of Scope: "Headless-browser SVG capture") | Faster CI, no Chrome dep |
| Per-request DuckDB query at the edge | Static parquet/JSON consumed by Eleventy at build time | v3.0 onward (project-wide invariant) | Pure static hosting; CLAUDE.md mandate |
| Frontend recomputing slug from species name | Pipeline-emitted `slug` column read verbatim | Phase 78 (slug-byte-for-byte AGG-03) | Eliminates 404 risk |

**Deprecated/outdated:**
- `inaturalist_waba_data.taxon_lineage` (narrow, 3-column, used by `export.py:116`). Phase 76 D-03 left it untouched; v3.3+ candidate for consolidation. Phase 78 reads from the new wider `inaturalist_data.taxon_lineage_extended`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `from feeds import _slugify` does not introduce a circular import (feeds.py is only used in the `feeds` STEP, runs after species-export and species-maps) | Standard Stack alternatives + Pattern reuse | Low — feeds.py imports `duckdb` + `json` + ET only; no cross-module refs. Plan 1 should verify with a quick `python -c "from feeds import _slugify"` smoke. |
| A2 | The seasonality.json size estimate (~600 KB raw, ~150 KB gzipped) holds at production scale | Pattern 3 + AGG-05 | Low — based on live data measurement (3,633 non-empty cells). If wrong, fallback is to drop the per-ecoregion arm and keep `_total` + per-county only (still satisfies VIZ-04). |
| A3 | DuckDB 1.4+ accepts `::INTEGER[12]` cast on a 12-element `list_value(...)` literal | Pattern 1 SQL example | Low — list-cast syntax works in 1.4. If wrong, fallback is to skip the cast and rely on the ARRAY[12] declaration on the COPY destination column shape. |
| A4 | Linear lon/lat → SVG x/y projection is acceptable visually for WA at 600×320 | Pattern 4 + MAP-03 | Low — WA's lat range is small (45.5–49.0), so Mercator distortion is ~5%. If wrong, fallback is to use a simple `cos(mid_lat)` x-scale correction (one extra line). Subjective verification needed during plan UAT. |
| A5 | Lineage coverage gap (~70% NULL family for non-WABA species) is acceptable for Phase 78; Phase 81 nav handles NULL ranks gracefully | Pitfall 1 + Don't Hand-Roll | Medium — if the user expects a richly populated taxonomy nav, this gap may surface as a UX surprise. Recommend confirming in `/gsd-discuss-phase 78` (if run) or in the planner's first plan summary. |
| A6 | The current `public/data/occurrences.parquet` does NOT carry `canonical_name`; Phase 78 plan 1 must extend `data/export.py` to add it | Pattern 2 caveat | High if missed — without it, `species_export.py` cannot compute `county_count` / `ecoregion_count` per species without re-running the spatial joins. **Plan 1 must include the `export.py` `canonical_name` column addition + extend `validate-schema.mjs` `EXPECTED['occurrences.parquet']` to include `canonical_name`.** [VERIFIED: queried local parquet 2026-05-03; column absent.] |

## Open Questions

1. **Lineage coverage acceptable as-is, or add `genus_family_map.csv` static fallback?**
   - What we know: 227 / 738 species (~31%) have a WABA-observed taxon_id linking to lineage; the other ~70% will have NULL family/subfamily/tribe/subgenus from the iNat side. Phase 76 checklist load also leaves these NULL.
   - What's unclear: Whether Phase 81's nav rendering looks reasonable with this many NULLs, or whether downstream UX requires a fallback.
   - Recommendation: Accept NULLs in Phase 78 (per CLAUDE.md "ship the canonical pipeline; UX hardening is Phase 82"). Capture the gap in the phase summary; revisit in Phase 81 plan-time if needed.

2. **Should `species.parquet` and `species.json` carry the SAME column set, or is `species.json` a smaller projection?**
   - What we know: AGG-04 says "flat array of species rows" — implies same shape. AGG-04 is silent on `month_histogram`.
   - What's unclear: Page-level `_data/species.js` consumer needs (Phase 80 PAGE-02). It probably wants `month_histogram` for the seasonality viz, but bigger JSON = slower Eleventy build.
   - Recommendation: Same column set in both. JSON for ~700 species rows × 19 columns is small (~150 KB). Worth the consistency. Defer projection if Eleventy build slows.

3. **Should the SVG `<circle>` radius vary by sample count, or stay constant?**
   - What we know: MAP-03 mandates "consistent radius and fill-opacity."
   - What's unclear: Nothing — REQUIREMENTS is explicit. Note for future: Phase 82 might add hover-callout for cluster density.
   - Recommendation: Constant `r="2.5"` per the MAP-03 lock.

4. **Idempotency tolerance: byte-for-byte equal, or content-equal?**
   - What we know: ROADMAP success criterion 4 says "identical artifacts" — interpreted as byte-for-byte.
   - What's unclear: File mtime is part of `git diff --stat` but not file content.
   - Recommendation: Byte-for-byte content equality (verified via `sha256sum` in pytest). File mtimes are irrelevant. Test runs the pipeline twice with `time.sleep(2)` between, asserts hash identical.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Python 3.14+ | `species_export.py`, `species_maps.py`, pytest | ✓ (per pyproject.toml) | 3.14 | — |
| `duckdb` Python | DB queries, parquet write | ✓ | >=1.4,<2 | — |
| `duckdb` `spatial` extension | `ST_AsGeoJSON`, `ST_SimplifyPreserveTopology` | ✓ (already loaded by `export.py`, `feeds.py`, `run.py`) | bundled | — |
| `xml.etree.ElementTree` (stdlib) | SVG generation, Atom XML reuse | ✓ | stdlib | — |
| `json` (stdlib) | species.json, seasonality.json | ✓ | stdlib | — |
| `re`, `unicodedata`, `csv` (stdlib) | `_slugify` (already used in feeds.py) | ✓ | stdlib | — |
| `hyparquet` (Node, in package.json) | `validate-schema.mjs` extension | ✓ | bundled | — |
| `pytest` | Phase 78 test suite | ✓ | >=9.0.2 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

**Verified 2026-05-03:** `cd data && uv run python -c "import duckdb, xml.etree.ElementTree, json, re, unicodedata, csv; print('all OK')"` returns clean. `npm ls hyparquet` resolves.

## Validation Architecture

> Phase 78 inherits the Phase 76 test infrastructure. Mirror that VALIDATION.md shape.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (data/) — managed via `uv` per `data/pyproject.toml` |
| Config file | `data/pyproject.toml` (testpaths = ["tests"]) |
| Quick run command | `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -x` |
| Full suite command | `cd data && uv run pytest` |
| Estimated runtime | ~30 seconds (target — programmatic DuckDB fixtures, no network, no real iNat) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| AGG-01 | FULL OUTER JOIN preserves checklist-only AND occurrence-only species | unit (fixture) | `cd data && uv run pytest tests/test_species_export.py::test_full_outer_three_arms -x` | ❌ Wave 0 |
| AGG-02 | `species.parquet` has all 19 columns including `month_histogram` | unit (schema) | `cd data && uv run pytest tests/test_species_export.py::test_species_parquet_schema -x` | ❌ Wave 0 |
| AGG-03 | `_slugify(canonical_name)` matches the `slug` column byte-for-byte for every row | unit (invariant) | `cd data && uv run pytest tests/test_species_export.py::test_slug_invariant -x` | ❌ Wave 0 |
| AGG-04 | `species.json` is a flat array; row[0] has expected keys | unit (shape) | `cd data && uv run pytest tests/test_species_export.py::test_species_json_shape -x` | ❌ Wave 0 |
| AGG-05 | `seasonality.json` keys species → bucket → 12-int array; size < 6 MB | unit (shape + budget) | `cd data && uv run pytest tests/test_species_export.py::test_seasonality_shape_and_budget -x` | ❌ Wave 0 |
| AGG-06 | `validate-schema.mjs` passes with new columns | integration | `cd /Users/rainhead/dev/beeatlas && node scripts/validate-schema.mjs` | ✅ (extended in plan) |
| AGG-07 | FULL OUTER fixture produces correct card counts | unit (fixture) | `cd data && uv run pytest tests/test_species_export.py::test_full_outer_card_counts -x` | ❌ Wave 0 |
| MAP-01 | One SVG per species with `occurrence_count > 0`; zero SVG for zero-count | integration | `cd data && uv run pytest tests/test_species_maps.py::test_one_svg_per_nonzero_species -x` | ❌ Wave 0 |
| MAP-02 | viewBox attr matches `0 0 600 320`; inline `fill` / `stroke` attrs present; no `<style>` tag | unit (XML parse) | `cd data && uv run pytest tests/test_species_maps.py::test_inline_styling_and_viewbox -x` | ❌ Wave 0 |
| MAP-03 | County path count == 39; per-occurrence `<circle>` count matches in-bbox occurrences | unit (XML parse) | `cd data && uv run pytest tests/test_species_maps.py::test_county_paths_and_circles -x` | ❌ Wave 0 |
| MAP-04 | Off-WA points clipped silently; `print` output reports clipped count; no exception | unit (capsys) | `cd data && uv run pytest tests/test_species_maps.py::test_off_bbox_clipping -x` | ❌ Wave 0 |
| MAP-05 | STEPS contains both new entries in correct order between `export` and `feeds` | unit (import) | `cd data && uv run python -c "import run; n=[s[0] for s in run.STEPS]; i=n.index('export'); assert n[i+1]=='species-export' and n[i+2]=='species-maps' and n[i+3]=='feeds', n; print('OK')"` | ✅ |
| MAP-06 | All emitted SVGs parse as valid XML | unit (XML parse) | `cd data && uv run pytest tests/test_species_maps.py::test_all_svgs_parse -x` | ❌ Wave 0 |
| Idempotency (success crit 4) | Two consecutive runs produce identical artifact bytes | integration | `cd data && uv run pytest tests/test_species_export.py::test_idempotency_two_runs -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -x`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full suite green + `node scripts/validate-schema.mjs` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `data/tests/test_species_export.py` — covers AGG-01..05, AGG-07, idempotency
- [ ] `data/tests/test_species_maps.py` — covers MAP-01..04, MAP-06
- [ ] `data/tests/conftest.py` extension — third FULL OUTER arm (one occurrence-only species without checklist row), one off-bbox occurrence point on a fixture species, simplified WA county polygon (already present from Phase 76 tests)
- [ ] `scripts/validate-schema.mjs` extension — `EXPECTED['species.parquet']` + JSON shape check
- [ ] `data/export.py` extension — add `canonical_name` to `occurrences.parquet` (load-bearing for `county_count` / `ecoregion_count` per species — see Pitfall 6 / A6)

*Existing pytest infrastructure (`data/pyproject.toml`, `data/tests/conftest.py`, `data/tests/fixtures.py`) covers schemas + WA boundary + Chelan county + North Cascades ecoregion. Phase 78 plans extend, not replace.*

## Sources

### Primary (HIGH confidence)
- Phase 76 RESEARCH.md (`.planning/phases/076-data-foundation/076-RESEARCH.md`) — canonical_name, lineage table, FULL OUTER precedent
- Phase 76 CONTEXT.md (`.planning/phases/076-data-foundation/076-CONTEXT.md`) — D-04 algorithm, D-05 unmatched policy
- Phase 76 VALIDATION.md (`.planning/phases/076-data-foundation/076-VALIDATION.md`) — pytest pattern, sampling rate
- `.planning/REQUIREMENTS.md` lines 26-43 (AGG-01..AGG-07, MAP-01..MAP-06)
- `.planning/ROADMAP.md` lines 523-533 (Phase 78 success criteria)
- `data/feeds.py` — `_slugify` source, ET XML idiom
- `data/export.py` — `COPY ... TO PARQUET`, `ST_AsGeoJSON` + `ST_SimplifyPreserveTopology` precedents
- `data/checklist_pipeline.py` + `data/canonical_name.py` — canonical_name materialization (Phase 76)
- `data/inaturalist_pipeline.py` lines 184-262 — `enrich_taxon_lineage_extended` (Phase 76)
- `data/run.py` lines 33-44 — STEPS list location
- `data/tests/conftest.py` — fixture pattern, schemas, seed data
- `scripts/validate-schema.mjs` — validator extension shape
- Live DuckDB query (2026-05-03) on `/Users/rainhead/dev/beeatlas/data/beeatlas.duckdb`:
  - `checklist_data.species` count = 527; canonical_name populated 527/527
  - `ecdysis_data.occurrences` distinct canonical_name = 556
  - FULL OUTER candidate count = 735 (179 checklist-only + 208 occurrence-only + 348 matched)
  - WA county bbox = `(-124.85, 45.54) → (-116.92, 49.00)`; 39 counties; 66 ecoregion_l3 intersect WA
  - Lineage bridge coverage: 227 / 738 species (~31%) via WABA name-bridge
  - Non-empty (species, county, ecoregion) cells: 3,633

### Secondary (MEDIUM confidence)
- INTEGER[12] parquet round-trip (verified locally via duckdb 1.4 + hyparquet 2026-05-03 in `/tmp/_test_int12.parquet`)
- Idempotency `json.dumps(sort_keys=True)` (verified pure-Python; deterministic across runs)

### Tertiary (LOW confidence)
- Linear lon/lat → SVG projection visual acceptability at 600×320 for WA bbox (A4 — assumed; subjective UAT during plan)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all stdlib + verified existing project libs
- Architecture: HIGH — patterns trace to existing `feeds.py` / `export.py` source; lineage join shape verified against live DB
- Pitfalls: HIGH — Pitfall #1 (lineage key mismatch), #2 (INT[12]→LIST), #6 (`occurrences.parquet` missing canonical_name) all verified in live DB; Pitfall #3 (slug drift) is mitigated by an explicit pytest invariant
- Code examples: HIGH — `_slugify`, ET emission, `COPY ... TO PARQUET`, `ST_AsGeoJSON` all verbatim from existing modules
- Validation architecture: HIGH — mirrors Phase 76 VALIDATION.md exactly

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (30 days — stable Python pipeline domain; no fast-moving libs)
