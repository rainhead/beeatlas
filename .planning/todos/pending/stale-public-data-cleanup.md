---
created: 2026-05-14
priority: low
context: deferred from Phase 88 Production Cutover (CUTOVER-LOG `## Out of Scope`); RESEARCH § Open Questions Q2
---

# Stale `public/data/` artifacts cleanup

## Problem

`public/data/samples.parquet` and `public/data/ecdysis.parquet` are pre-v3.0 artifacts that the current frontend does not consume. They likely still exist in S3 from old nightly runs. They're harmless but they're noise — they cost a few MB of bucket storage, they appear in `scripts/fetch-data.sh`'s dev-sync, and they make the data directory listing misleading for anyone auditing what's actually published.

After Phase 88, the canonical published artifacts are:

- `occurrences.parquet` — dbt-produced, 30 columns
- `counties.geojson`, `ecoregions.geojson` — dbt-produced
- `species.json`, `seasonality.json` — `species_export.py` post-step (reads from dbt sandbox)
- `feeds/*.xml` — `feeds.py` post-step

Anything else in `public/data/` is stale.

## Goal

S3 contains only the canonical artifact set. Local `public/data/` does too. `scripts/fetch-data.sh` no longer fetches the stale files.

## Scope

- Delete `public/data/samples.parquet` and `public/data/ecdysis.parquet` from S3
- Delete the same files locally (if present after a `fetch-data.sh` run)
- Edit `scripts/fetch-data.sh` to drop those entries from the sync list
- Audit S3 once for anything else that looks stale (any `*.parquet` not in the canonical list)

## Risk

Very low. These files have not been referenced in the frontend code path for multiple milestones. If anything still depends on them, it would have broken at the v3.0 cutover.

## Estimated size

Quick task — ~15 minutes plus the S3 delete.

## Status

Pending — deferred from Phase 88.
