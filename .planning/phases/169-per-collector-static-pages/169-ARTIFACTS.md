# Phase 169 — Artifacts This Phase Produces

> Symbols, files, and record fields created by Phase 169. Downstream phases (171
> event stream, 172 accomplishment view) and the intel API surface should treat
> these as the canonical new surface introduced here.

## New Files

| Path | Kind | Produced By | Role |
|------|------|-------------|------|
| `data/collectors_export.py` | Python module | Plan 01 Task 2 | DuckDB export step: per-collector stats → `collectors.json` |
| `data/tests/test_collectors_export.py` | pytest | Plan 01 Task 1 | Golden-fixture test for the gate + sample-count formula + split invariant |
| `public/data/collectors.json` | committed JSON artifact | Plan 01 Task 3 | The per-collector records consumed by Eleventy + Vitest (~124 records) |
| `_data/collectors.js` | Eleventy data loader | Plan 02 Task 2 | Exposes `{ collectorsArray }` from `collectors.json` (JSON only — Pitfall #8) |
| `_pages/collector-detail.njk` | Nunjucks template | Plan 02 Task 3 | Per-collector page at `/collectors/{login}/` (stats, status split, deep-link) |
| `_pages/collectors.njk` | Nunjucks template | Plan 02 Task 3 | Index roster at `/collectors.html` |
| `src/tests/data-collectors.test.ts` | Vitest | Plan 02 Task 1 | D-09 floor (>=100) + record-shape + split-invariant + no-parquet test |

## New Symbols

| Symbol | File | Signature / Shape |
|--------|------|-------------------|
| `export_collectors` | `data/collectors_export.py` | `export_collectors(con: duckdb.DuckDBPyConnection \| None = None) -> None` |
| `export_collectors_step` | `data/collectors_export.py` | `export_collectors_step() -> None` (zero-arg wrapper for run.py STEPS) |
| `collectorsArray` (export) | `_data/collectors.js` | `export default { collectorsArray }` — array of collector records |

## Modified Files

| Path | Change |
|------|--------|
| `data/run.py` | Add `from collectors_export import export_collectors_step`; add `("collectors-export", export_collectors_step)` to STEPS after `("places-export", export_places_step)`; update the pipeline-order comment |
| `.gitignore` | Add `!/public/data/collectors.json` un-ignore exception after the existing `!/public/data/places.json` line (the `/public/data/*` blanket rule otherwise ignores it) |

## `collectors.json` Record Fields

Each record in the `collectors.json` array (and each element of `collectorsArray`):

| Field | Type | Source / Meaning |
|-------|------|------------------|
| `login` | string | `collector_inat_login` (the gated, COALESCEd handle); the page slug |
| `display_name` | string | Human name from Ecdysis `recordedBy`, else `@{login}` (D-04) |
| `recordedBy` | string \| null | The collector's `recordedBy` (null for sample-host-only collectors); the deep-link name half |
| `host_inat_login` | string | The `host_inat_login` used in the `?collectors=` deep-link (covers 100% of records — D-10) |
| `specimen_count` | number | `COUNT(DISTINCT ecdysis_id)` (D-03) |
| `sample_count` | number | `COUNT(DISTINCT sample_id) + COUNT(DISTINCT waba_sample observation_id)` (D-03, research finding #3) |
| `species_count` | number | Distinct species-rank `taxon_id` via `species.parquet` join (`specific_epithet IS NOT NULL`) (D-03/D-06) |
| `status_denominator` | number | Specimens in the lifecycle: `ecdysis_id IS NOT NULL OR source='waba_specimen'` (D-05) |
| `status_identified` | number | Of the denominator, those with a species-rank determination (D-06) |
| `status_awaiting` | number | Of the denominator, those identified only to genus-or-coarser / unidentified (D-06/D-07) |

Invariant: `status_identified + status_awaiting == status_denominator` (asserted in both the pytest and the Vitest).

## New Routes (Eleventy static output)

| Route | Page |
|-------|------|
| `/collectors/{login}/` | Per-collector detail (one per gated collector; `index.html` in a per-login directory) |
| `/collectors.html` | Collector index roster |

## run.py Pipeline Step

| Step name | Callable | Position |
|-----------|----------|----------|
| `collectors-export` | `export_collectors_step` | After `places-export`, before `places-maps`; runs after `dbt-build` (reads `EXPORT_DIR/occurrences.parquet` + `species.parquet`) |
