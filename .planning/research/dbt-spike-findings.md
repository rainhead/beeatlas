# dbt Spike — Findings

## Status

Seeded by Phase 83; body to be filled by Phase 84 (TEST/DIFF/PART/FIND requirements).

## Slice Choice

The chosen slice is `export.py` → `occurrences.parquet` + `counties.geojson` + `ecoregions.geojson`.
This slice was selected because it covers the maximal learning surface of the `export.py` pipeline
in a single end-to-end path: spatial joins (`ST_Within` + nearest-polygon fallback), a FULL OUTER JOIN
across two occurrence sources (Ecdysis + iNat samples), regex extractions (catalog suffix parsing,
host OFV extraction), OFV joins (specimen count, sample_id, provisional host), and a multi-source
UNION ALL. No other sub-slice offers this breadth of dbt-duckdb feature coverage in one run.

Note on `samples.parquet` discrepancy: REQUIREMENTS.md references `ecdysis.parquet` +
`samples.parquet` as separate outputs, but `export.py` does not currently emit `samples.parquet`.
Instead, samples are folded into `occurrences.parquet` as the sample-side of the FULL OUTER JOIN.
The dbt slice faithfully follows `export.py`'s actual output shape: one `occurrences.parquet`
containing both specimen and sample rows. This discrepancy between REQUIREMENTS.md naming and
`export.py` reality is flagged for FIND-01 in Phase 84.

## Open Trade-Offs (for Phase 84)

DuckDB's spatial extension also offers a GDAL-driven single-call FeatureCollection emission
(`COPY <tbl> TO '...geojson' (FORMAT GDAL, DRIVER 'GeoJSON')`) which is simpler but adds extra
fields (`crs`, optional `id`, optional `bbox`) that `export.py` doesn't produce. For minimum diff
with `export.py` (Phase 84 PORT-02/DIFF-01), the hand-rolled `to_json`/`list` approach is
preferred. Re-evaluate after diff results.

Additional trade-off (discovered during Phase 83 implementation): DuckDB's `COPY ... TO '...'
(FORMAT JSON, ARRAY false)` writes JSON values wrapped in `{"column_name": value}` objects — not
raw JSON scalars. Writing a bare FeatureCollection required `FORMAT CSV, DELIMITER '', QUOTE '',
HEADER false` with an explicit `::VARCHAR` cast. This is fragile and worth flagging as a FIND-01
candidate: is there a cleaner DuckDB-native approach for single-document JSON output?

## Phase 84 To-Do

- [ ] TEST-01: Generic dbt tests on staging/intermediate keys
- [ ] TEST-02: Model contract test on a mart
- [ ] TEST-03: Re-express validate-schema.mjs invariants as dbt tests
- [ ] DIFF-01: Row/schema diff of occurrences.parquet vs export.py output
- [ ] DIFF-02: GeoJSON diff (counties.geojson, ecoregions.geojson) vs export.py output
- [ ] DIFF-03: Column ordering and type fidelity check
- [ ] PART-01: Partial run demonstration across subgraphs
- [ ] PART-02: Lineage artifact review
- [ ] FIND-01: Document samples.parquet discrepancy + COPY FORMAT trade-off
- [ ] FIND-02: Document spatial join performance and DuckDB-specific patterns
- [ ] FIND-03: Assess feasibility for DuckDB WASM frontend direction
