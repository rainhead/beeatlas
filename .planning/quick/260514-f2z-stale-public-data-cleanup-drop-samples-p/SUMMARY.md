---
id: 260514-f2z
title: Stale public/data artifact cleanup
status: complete
date: 2026-05-14
commit: 36ce8bc
---

# Quick Task 260514-f2z — Summary

Closed pending todo: `.planning/todos/pending/stale-public-data-cleanup.md`.

## Done

- **T1** `scripts/fetch-data.sh` — replaced pre-v3.0 file list (`ecdysis.parquet`, `samples.parquet`, `counties.geojson`, `ecoregions.geojson`) with the canonical v3.4 set the nightly pipeline actually uploads (`occurrences.parquet`, `counties.geojson`, `ecoregions.geojson`, `species.json`, `seasonality.json`) plus a `feeds/` `s3 sync`. Header comment now points readers at `data/nightly.sh` as the source of truth.
- **T2** `BENCHMARK.md:27` — same file list, updated to canonical set.
- **T3** Local `public/data/ecdysis.parquet` + `samples.parquet` deleted. (Gitignored — no commit needed.)
- **T4** S3 destructive:
  - `aws s3 rm s3://${BUCKET}/data/ecdysis.parquet`
  - `aws s3 rm s3://${BUCKET}/data/samples.parquet`
  - CloudFront invalidation `I3IJZA4NWEQLVEUN09F1D5LXUZ` for `/data/ecdysis.parquet` + `/data/samples.parquet`
  - Post-delete `aws s3 ls s3://${BUCKET}/data/` shows only the 5 canonical artifacts + `feeds/` prefix.

## Verification (must_haves)

1. ✅ `scripts/fetch-data.sh` downloads only canonical artifacts — diff confirmed in commit `36ce8bc`.
2. ✅ S3 `data/` contains only canonical artifacts — listing confirms 5 files + `feeds/`.
3. ✅ Local `public/data/` contains only canonical artifacts (+ `species.parquet` local intermediate).
4. ✅ `BENCHMARK.md` reflects post-v3.4 reality.

## Notes

- `species.parquet` (45KB) intentionally retained locally — it's a dbt-produced intermediate consumed by `data/species_maps.py:200` for SVG generation; not published to S3.
- `data/lineage_unresolved.csv` is still untracked — runtime artifact from the pipeline, not relevant to this cleanup.

## Commits

- `36ce8bc` chore(260514-f2z): sync fetch-data.sh + BENCHMARK.md to canonical artifact set
