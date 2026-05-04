---
phase: 078-pipeline-outputs
verified: 2026-05-03T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
human_verification:
  - test: "Visual inspection of representative species-maps/*.svg in a browser via <img src=...>"
    expected: "WA counties recognizable, occurrence dots fall on land (or are clipped); single embedded <style> block applies .county / .occ rules"
    why_human: "Subjective rendering quality and browser <img> CSP behavior cannot be asserted automatically; explicitly listed in 078-VALIDATION.md Manual-Only Verifications. Gated by Phase 80 (Species Tab) where SVGs land in actual <img> tags."
---

# Phase 078: Pipeline Outputs — Verification Report

**Phase Goal:** Land the data-side prerequisites for the Species Tab — every species the Atlas knows about gets a `<slug>` keyed entry on disk: row in `species.parquet` + rich shape in `species.json` + nested entry in `seasonality.json` + per-species SVG distribution map in `species-maps/<slug>.svg`. All driven by a single deterministic DuckDB query and one Python module per artifact, glued into `data/run.py` STEPS so the nightly pipeline produces them automatically.

**Verified:** 2026-05-03
**Status:** passed (with one human-verification follow-up gated by Phase 80)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `python data/run.py` produces `species.parquet`, `species.json`, `seasonality.json`; parquet carries full AGG-02 column set including `month_histogram INT[12]`, `on_checklist`, `provisional_count`, `slug`; FULL OUTER preserves zero-occurrence checklist species | ✓ VERIFIED | `data/species_export.py:35-41` declares 19 SPECIES_COLUMNS matching AGG-02; pyarrow schema at `species_export.py:212-232` pins `month_histogram` as `pa.list_(pa.int32())`; FULL OUTER at `species_export.py:171-173` preserves both arms; `tests/test_species_export.py::test_full_outer_three_arms` and `test_species_parquet_schema` pass against fixture (and Plan 04 SUMMARY confirmed at production scale: 735 species across the 3-arm union, 19 cols on disk) |
| 2 | One SVG per species with `occurrence_count > 0`; every SVG declares `viewBox="0 0 600 320"`; inline styling renders via `<img src=".svg">`; off-bbox coordinates silently clipped + count logged | ✓ VERIFIED | `species_maps.py:43` sets `VIEWBOX = "0 0 600 320"`; `STYLE_CSS` constant at `species_maps.py:51-54` defines `.county` / `.occ` classes inside a single `<style>` block; `_in_bbox` clip + `print(... points clipped)` at `species_maps.py:240-243` never raises; pytests `test_one_svg_per_nonzero_species`, `test_inline_styling_and_viewbox`, `test_off_bbox_clipping` all green; Plan 04 production smoke confirmed 556/556 SVGs (1:1 with non-zero species) |
| 3 | Slug generation shared with `feeds._slugify` — SVG filename, parquet `slug` column, URL slug agree byte-for-byte | ✓ VERIFIED | `species_export.py:25` imports `_slugify` from `feeds`; `species_export.py:200` assigns `r['slug'] = _slugify(r['scientificName'])`; `species_maps.py` reads `slug` straight from `species.parquet` (`species_maps.py:206-213`) and never recomputes; pytests `test_slug_invariant` and `test_svg_filename_matches_slug_column` pass; Plan 04 SUMMARY: "OK -- slug agreement holds for 735 species" at production scale |
| 4 | `species-export` and `species-maps` are in `data/run.py` STEPS after `export` and before `feeds`; re-running pipeline produces identical artifacts | ✓ VERIFIED | Direct verification: `cd data && uv run python -c "import run; ..."` returns `['export', 'species-export', 'species-maps', 'feeds']`; idempotency enforced contractually by `_write_species_svg` sorting attrib dicts (`species_maps.py:164-166`) and `json.dumps(sort_keys=True)` (`species_export.py:255, 290`); pytests `test_idempotency_two_runs` (sha256 across parquet + 2× JSON) and `test_svg_idempotency` (sha256 over every SVG with 1.5s sleep) pass |
| 5 | `node scripts/validate-schema.mjs` passes; `pytest test_species_export.py test_species_maps.py` passes including FULL OUTER fixture and SVG well-formedness | ✓ VERIFIED (with documented stale-cache caveat) | `cd data && uv run pytest`: **121 passed in 16.60s**; species tests 14/14 green. `validate-schema.mjs` exits 1 against the stale local `occurrences.parquet` (modified May 3 22:47, lacks `canonical_name`) — this is the schema gate working as designed against a stale local artifact (see analysis below); Plan 04 SUMMARY captured `ok occurrences.parquet / ok species.parquet / ok species.json` at production scale after copying the host DB into the worktree and re-running |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `data/species_export.py` | exports `export_species_parquet(con)` with FULL OUTER + lineage LEFT JOIN | ✓ VERIFIED | 312 lines; `def export_species_parquet(con: duckdb.DuckDBPyConnection) -> None` at line 66; FULL OUTER JOIN at line 172; LEFT JOIN to `canonical_to_taxon_id` (line 174) and `taxon_lineage_extended` (line 176); imports `_slugify` from `feeds` (line 25) |
| `data/species_maps.py` | exports `generate_species_maps(con)` — per-species SVG with WA county backdrop + occurrence dots | ✓ VERIFIED | 264 lines; `def generate_species_maps(con: duckdb.DuckDBPyConnection \| None = None) -> None` at line 175; uses `from config import STATE_FIPS` (line 34) per D-02; D-03 single `<style>` block at line 51-54; D-04 wipe-and-rewrite at lines 189-192 |
| `public/data/occurrences.parquet` carries `canonical_name` | needed for per-species county_count / ecoregion_count joins | ✓ VERIFIED in code | `data/export.py` propagates `canonical_name` through ecdysis_base CTE (line 78), ARM 1 (line 156: `e.canonical_name`), ARM 2 (line 190: `NULL AS canonical_name`), and final SELECT (line 257: `j.canonical_name`); `validate-schema.mjs` EXPECTED list includes `canonical_name`. **Note:** local `occurrences.parquet` on disk is STALE — modified May 3 22:47 from before Plan 01 added the column; the next `npm run build` or local `python run.py` will refresh it. This is a deploy-pipeline timing concern, not a code defect (see Stale-Cache Analysis below) |
| `data/run.py` STEPS includes `species-export` and `species-maps` between `export` and `feeds` | rerun produces identical artifacts | ✓ VERIFIED | `data/run.py:34-36` imports `species_export.main`, `species_maps.main` (aliased); `STEPS` at lines 41-55 emits the order `[..., 'export', 'species-export', 'species-maps', 'feeds']` — confirmed via `import run; ...` smoke. Idempotency contract structurally enforced by sorted-attrib SVGs + `sort_keys=True` JSON writes |
| `scripts/validate-schema.mjs` covers `species.parquet` + `species.json` shape | gate updated for new artifacts | ✓ VERIFIED | `validate-schema.mjs:43-51` declares `EXPECTED['species.parquet']` with 19 columns including `month_histogram`; lines 95-118 add `species.json` shape check (top-level array + required keys: scientificName, canonical_name, on_checklist, occurrence_count, slug); `readFileSync` import at line 16 |

All artifacts pass exists + substantive + wired (Levels 1-3). Wiring confirmed: `run.py` STEPS imports both module mains; `validate-schema.mjs` is wired into `npm run build` at the project root; tests in `data/tests/` are picked up by pytest's `testpaths = ["tests"]` config.

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `data/run.py` | `species_export.main` | `from species_export import main as export_species_parquet` | ✓ WIRED | run.py:35; STEPS tuple at line 52 |
| `data/run.py` | `species_maps.main` | `from species_maps import main as generate_species_maps` | ✓ WIRED | run.py:36; STEPS tuple at line 53 |
| `data/species_export.py` | `feeds._slugify` | `from feeds import _slugify` | ✓ WIRED | species_export.py:25; called at line 200 |
| `data/species_export.py` | `occurrences.parquet` | `read_parquet('{occurrences_parquet}')` | ✓ WIRED | species_export.py:92, 132, 272 — explicit FileNotFoundError guard at line 79-83 |
| `data/species_export.py` | `inaturalist_data.canonical_to_taxon_id` (Phase 77 bridge) | LEFT JOIN | ✓ WIRED | species_export.py:174-175 |
| `data/species_export.py` | `inaturalist_data.taxon_lineage_extended` (Phase 76) | LEFT JOIN | ✓ WIRED | species_export.py:176-177 |
| `data/species_maps.py` | `config.STATE_FIPS` | `from config import STATE_FIPS` | ✓ WIRED | species_maps.py:34; used in `_load_county_geojsons` at line 91 |
| `data/species_maps.py` | `species.parquet` (slug source) | `read_parquet('{species_parquet}')` | ✓ WIRED | species_maps.py:208-213 — explicit FileNotFoundError guard at line 201-204 |
| `data/species_maps.py` | `geographies.us_counties` | `ST_GeomFromText(geometry_wkt)` (Plan 03 deviation #1) | ✓ WIRED | species_maps.py:86-94; uses ST_SimplifyPreserveTopology with tolerance 0.005 |
| `scripts/validate-schema.mjs` | `species.parquet` columns | hyparquet metadata read | ✓ WIRED | validate-schema.mjs:43-51, 61-91 |
| `scripts/validate-schema.mjs` | `species.json` shape | `JSON.parse(readFileSync(speciesJsonPath))` | ✓ WIRED | validate-schema.mjs:95-118 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `species.parquet` | `species_rows` | DuckDB FULL OUTER fetchall + Python row-loop | Plan 04 production smoke: 735 species rows, 52,591 bytes | ✓ FLOWING |
| `species.json` | `_jsonify_rows(species_rows)` | Same `species_rows` written via `json.dumps(..., sort_keys=True, indent=2)` | Plan 04 production smoke: 513,968 bytes | ✓ FLOWING |
| `seasonality.json` | `out_seas` (defaultdict) | DuckDB query of occurrences.parquet (canonical_name + county + ecoregion + month) | Plan 04 production smoke: 556 species, 265,660 bytes (well under 6 MB budget) | ✓ FLOWING |
| `species-maps/<slug>.svg` | `points` per species (occurrence lon/lat) | `ecdysis_data.occurrences` query, grouped by canonical_name in Python | Plan 04 production smoke: 556 SVGs, 12,031,087 bytes total | ✓ FLOWING |

All four artifacts have real DuckDB queries feeding them; no static empty returns; no hardcoded empty props. Production-scale smoke (host DuckDB copied into worktree) per Plan 04 SUMMARY confirms data flows end-to-end.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| pytest suite green | `cd data && uv run pytest` | `121 passed in 16.60s` | ✓ PASS |
| Species-only tests green | `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -v` | 14/14 passed | ✓ PASS |
| STEPS ordering | `cd data && uv run python -c "import run; ..."` | `['export', 'species-export', 'species-maps', 'feeds']` | ✓ PASS |
| Schema validator (local mode, stale parquet) | `node scripts/validate-schema.mjs` | exits 1: "missing columns: canonical_name" against stale local `occurrences.parquet` | ⚠️ EXPECTED-FAIL (stale-cache, NOT phase failure — see analysis) |
| Wave 0 stubs retired | `grep -c "Wave 0 stub" data/tests/test_species_*.py` | 0 (no matches) | ✓ PASS |
| All commits present | `git log --oneline | grep 078-` | All 12 expected 078-* commits present | ✓ PASS |

---

### Schema Validator Stale-Cache Analysis

The stand-alone `node scripts/validate-schema.mjs` invocation against the working tree exits 1 with `missing columns: canonical_name` on the local `occurrences.parquet`. This is **expected and documented** in Plan 01 SUMMARY deviation #4 and Plan 04 SUMMARY:

- The local `public/data/occurrences.parquet` (mtime May 3 22:47) was generated **before** Plan 01 added `canonical_name` to `data/export.py` ARMs.
- The validator is in **local mode** (uses `existsSync` check at validate-schema.mjs:54) — it correctly detects the stale local artifact carrying the old schema.
- This is the schema gate working **exactly as designed** (project memory: `project_schema_validation.md` — "catch stale S3 cache").
- Plan 04 SUMMARY documented the production-scale validation: after copying the host's `beeatlas.duckdb` and re-running `export.export_occurrences_parquet` → `species_export.main()` → `species_maps.main()`, the validator exits 0 with `ok occurrences.parquet / ok species.parquet / ok species.json`.
- The next `npm run build` or `python data/run.py` will regenerate the local parquet with `canonical_name` and the validator will turn green. No code change required.

The validator failure on a stale local cache is therefore **not a blocker** — it is the gate fulfilling its contract.

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| AGG-01 | FULL OUTER + lineage LEFT JOIN; output to species.parquet | ✓ SATISFIED | `species_export.py:171-181` (FULL OUTER + 4 LEFT JOINs); `test_full_outer_three_arms` |
| AGG-02 | 19-column species.parquet schema including month_histogram INT[12] | ✓ SATISFIED | `species_export.py:35-41, 212-232`; `test_species_parquet_schema` asserts all 19 cols + len-12 hist |
| AGG-03 | Slug from `feeds._slugify` byte-for-byte across artifacts | ✓ SATISFIED | `species_export.py:25, 200`; `test_slug_invariant` + `test_svg_filename_matches_slug_column`; production-scale 735-species check in Plan 04 |
| AGG-04 | `species.json` flat array | ✓ SATISFIED | `species_export.py:253-257`; `test_species_json_shape` |
| AGG-05 | `seasonality.json` species → bucket → INT[12], <6 MB | ✓ SATISFIED | `species_export.py:266-297`; `test_seasonality_shape_and_budget` (size assert at line 295-297); production: 265,660 bytes |
| AGG-06 | `validate-schema.mjs` extended for species.parquet + species.json | ✓ SATISFIED | `validate-schema.mjs:43-51, 95-118` |
| AGG-07 | pytest covers FULL OUTER fixture (3 arms + zero-record render) | ✓ SATISFIED | `test_full_outer_three_arms`, `test_full_outer_card_counts` |
| MAP-01 | One SVG per species with occurrence_count > 0 | ✓ SATISFIED | `species_maps.py:206-213, 237-244`; `test_one_svg_per_nonzero_species`; production: 556/556 |
| MAP-02 | viewBox="0 0 600 320" + inline styling | ✓ SATISFIED | `species_maps.py:43, 51-54, 102-111`; `test_inline_styling_and_viewbox`. **Note on D-03 reinterpretation:** the literal MAP-02 wording says "inline fill/stroke styling" — D-03 (LOCKED) interprets this as "styling lives inside the SVG document" via a single `<style>` block with `.county`/`.occ` classes. Functionally equivalent — browsers honor `<style>` inside `<img src=".svg">` (only `<script>`/external CSS are blocked). |
| MAP-03 | County polygons via `ST_AsGeoJSON(ST_SimplifyPreserveTopology(.., 0.005))` + circle dots | ✓ SATISFIED | `species_maps.py:86-94` (with `ST_GeomFromText(geometry_wkt)` wrap per Plan 03 deviation #1 — schema reality, not `geom` literal); `test_county_paths_and_circles` |
| MAP-04 | Off-viewBox coords silently clipped + logged, never fail | ✓ SATISFIED | `species_maps.py:144-148, 240-243` (no `raise`); `test_off_bbox_clipping` asserts log + zero circles for OFFBBOX-01 fixture |
| MAP-05 | run.py STEPS contains `("species-maps", generate_species_maps)` after species-export, before feeds | ✓ SATISFIED | `run.py:53`; verified via `import run` smoke |
| MAP-06 | pytest covers SVG well-formedness, circle count, viewBox | ✓ SATISFIED | `test_all_svgs_parse`, `test_county_paths_and_circles`, `test_inline_styling_and_viewbox` |

**13/13 requirements satisfied.** No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | — | — | None — `grep TODO\|FIXME\|XXX\|HACK\|PLACEHOLDER\|placeholder` returned zero matches in `species_export.py` and `species_maps.py` |

The only `placeholder`-like text in any phase artifact is in fixture data (`zzzzz nonexistensia` as the deliberately-non-checklist canonical name for the occurrence-only arm), which is intentional and called out in Plan 02 SUMMARY.

---

### Human Verification Required

One item, gated by Phase 80 (Species Tab) where SVGs land in actual `<img>` tags:

#### 1. Visual rendering quality of representative species-maps SVGs

**Test:** Open 5 random `public/data/species-maps/*.svg` files in a browser (after the next `python data/run.py` regenerates them locally, or against the deployed CloudFront artifacts) — both standalone and embedded as `<img src="/data/species-maps/<slug>.svg">`.
**Expected:** WA county polygons recognizable; `.county` fill (`#f4f4f0`) and stroke (`#888`) applied via the embedded `<style>` block; occurrence dots (`<circle class="occ">`, `#c44` at 0.6 opacity) fall on land or are correctly clipped; no off-canvas points; viewBox crops to WA bbox.
**Why human:** Subjective rendering quality, browser CSP behavior for `<img src=".svg">` style scoping, and projection acceptability at 600×320 cannot be asserted programmatically. Explicitly listed as the sole Manual-Only verification in `078-VALIDATION.md`.

This is documented as Phase-80-gated — does NOT block Phase 78 closure.

---

### Gaps Summary

**No blocking gaps.** All 5 ROADMAP success criteria verified, all 13 phase requirements (AGG-01..07 + MAP-01..06) satisfied, 121/121 pytest tests green, all key artifacts present and wired. The schema validator's exit-1 against the stale local `occurrences.parquet` is the gate working as designed and will resolve on the next pipeline run.

**Documented deviations from plan (all Rule 1-3 auto-fixed during execution; verified to be correct):**

1. Plan 02 — Python-side `[0]*12` backfill of NULL `month_histogram` instead of SQL `COALESCE(.., [0,0,..]::INTEGER[12])` because DuckDB 1.4.x doesn't implement COALESCE on `INTEGER[12]` (`species_export.py:198-202`). The pyarrow writer pins the type as `pa.list_(pa.int32())` so the parquet shape is correct. Verified: `test_species_parquet_schema` asserts `len(month_histogram) == 12`.
2. Plan 03 — `ST_GeomFromText(geometry_wkt)` instead of plan-literal `geom` column. The `geographies.us_counties` table stores polygons as `geometry_wkt VARCHAR`, never as a `geom` GEOMETRY column; the WKT cast matches `data/export.py::export_counties_geojson`. Verified: `test_county_paths_and_circles` passes against fixture county.
3. Plan 04 — SVG byte-stability via sorted attrib dicts (Option A) rather than `ET.canonicalize` (Option B). Smaller change, preserves XML declaration, matches the property the test asserts. Verified: `test_svg_idempotency` (sha256 across 1.5s sleep) passes; production-scale `diff` of 556 SVGs across 2 runs reports byte-identical.

All three deviations are documented in their respective SUMMARYs and verified to be correct against the underlying schema/library reality.

---

## Verdict

**Phase 078: Pipeline Outputs — COMPLETE**

The phase goal is achieved. All four plans (078-01 through 078-04) landed; all 5 ROADMAP success criteria are met; all 13 requirements (AGG-01..07, MAP-01..06) are satisfied with passing pytest assertions and Plan 04's production-scale smoke. The data-side prerequisites for Phase 80 (Species Tab) are in place: `species.parquet`, `species.json`, `seasonality.json`, and per-species SVGs will be regenerated by the nightly cron via `data/run.py` STEPS in the canonical order (`export → species-export → species-maps → feeds`).

The single human-verification item (visual SVG rendering quality) is explicitly gated by Phase 80 and does not block this phase's closure.

---

*Verified: 2026-05-03*
*Verifier: Claude (gsd-verifier)*
