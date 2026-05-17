---
created: 2026-05-14
priority: medium
context: surfaced during v3.4 deploy — schema migration (33→30 cols) collided with browser cache of pre-migration parquet, breaking the live site until users hard-refreshed
---

# Hash-versioned URLs for `public/data/` artifacts

## Problem

`public/data/occurrences.parquet`, `species.json`, `seasonality.json`, etc. are uploaded with no `Cache-Control` header. Browsers apply heuristic freshness (~10% of last-modified age), which is good for offline use but bad at milestone boundaries:

- On 2026-05-14 the v3.4 deploy shipped new frontend (30-col `CREATE TABLE`) and new data (30-col parquet). Browsers that had previously visited the site cached the OLD 33-col parquet for hours-to-days. After the deploy, those browsers ran the new frontend against the cached old parquet → `INSERT INTO occurrences (..., specimen_inat_login, ...)` → SQLite "table has no column named specimen_inat_login" → broken site until user shift-reloaded with cache disabled.
- This happens at every schema migration. Expected once per milestone for a project like this; survivable but bad UX.

Trade-off space:

| Approach | Offline | Schema-migration safety |
|----------|---------|-------------------------|
| Current (no Cache-Control) | Good (browser heuristic) | Bad (this bug) |
| `max-age=0` | Broken offline | Good |
| `max-age=300, must-revalidate` | OK for 5 min | OK after 5 min |
| `stale-while-revalidate` | OK for SWR window | OK after revalidate |
| **Hash-versioned URLs (this todo)** | **Excellent** | **Excellent** |

## Goal

`public/data/` artifacts have content-hashed URLs and `Cache-Control: public, max-age=31536000, immutable`. A small `manifest.json` (always `max-age=0`) points at the current hash. Schema migrations deploy a new hash; old cached objects remain valid for offline users still running the old frontend; new frontend reads the manifest and fetches the new hash.

## Shape

### Pipeline side (`data/nightly.sh` + `species_export.py` + maybe a wrapper)

1. After dbt-build + species-export complete, compute SHA-256 (first 12 chars suffices) of each artifact:
   - `occurrences.parquet`
   - `species.json`
   - `seasonality.json`
   - `counties.geojson`
   - `ecoregions.geojson`
2. Rename to `<basename>-<hash>.<ext>` in `EXPORT_DIR`
3. Write `EXPORT_DIR/manifest.json`:
   ```json
   {
     "occurrences": "occurrences-a1b2c3d4e5f6.parquet",
     "species": "species-7g8h9i0j1k2l.json",
     "seasonality": "seasonality-3m4n5o6p7q8r.json",
     "counties": "counties-9s0t1u2v3w4x.geojson",
     "ecoregions": "ecoregions-5y6z7a8b9c0d.geojson",
     "generated_at": "2026-05-14T17:18:21Z",
     "schema_version": 30
   }
   ```
4. Upload all artifacts with `--cache-control "public, max-age=31536000, immutable"`
5. Upload `manifest.json` with `--cache-control "no-cache"` (or `max-age=0`)
6. Continue feeds upload (unchanged)
7. CloudFront invalidation: only `/data/manifest.json` needs explicit invalidation; hashed artifacts are new URLs, no edge cache to invalidate

### Frontend side (`src/sqlite.ts` + `src/parquet.ts` callers + `_data/species.js`)

1. `loadTables` (or earlier init step) fetches `/data/manifest.json` first
2. Subsequent `fetch('/data/occurrences.parquet')` → `fetch('/data/' + manifest.occurrences)`
3. Eleventy `_data/species.js` build step: read `_site/data/manifest.json` (or wherever the manifest lives at build time) and resolve `species.json` path via manifest
4. Old hardcoded paths to `/data/<name>.<ext>` get the manifest indirection

### CI side (`.github/workflows/deploy.yml`)

1. Pre-build S3 fetch step needs to read `manifest.json` first, then fetch the hashed `species-<hash>.json` and `seasonality-<hash>.json`. Simpler alternative: keep CI on the legacy non-hashed names (nightly.sh writes both `species.json` and `species-<hash>.json` for transitional compatibility). Pick the cleanest path during implementation.

## Out of scope for this todo

- Service worker for explicit offline behavior (separate scope — much larger)
- Versioning the `/data/feeds/*.xml` Atom feeds (they're not schema-bound and external readers consume them; keep current URLs stable)
- DuckDB on S3 — operational artifact, not user-facing

## Risk

Low. Pure additive change to nightly.sh + a small frontend indirection. Rollback: revert the commit; CloudFront invalidate `/data/*`; nightly resumes writing the old non-hashed names.

## Estimated size

Half-day or less. Roughly:
- 30-60 min: nightly.sh + species_export.py emit hashed names + manifest.json with cache headers
- 30-60 min: frontend reads manifest before parquet/JSON fetches; tests updated
- 15-30 min: CI deploy.yml pre-build fetch updated to use manifest
- 30-45 min: manual smoke + verify offline behavior + verify schema-migration scenario

## Status

Pending — captured during v3.4 deploy retrospective (2026-05-14). Surfaces real user pain at every milestone schema migration; not urgent but worth doing before v4.0 / next major schema change.
