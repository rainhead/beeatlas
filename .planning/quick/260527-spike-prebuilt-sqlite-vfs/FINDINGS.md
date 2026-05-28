# Spike: Prebuilt SQLite via MemoryVFS Seeding

**Date:** 2026-05-27  
**Status:** GO — technique works; 70% load-time reduction confirmed

---

## Summary

We can fetch a pre-built `occurrences.db` SQLite file and load it into the wa-sqlite
worker by pre-populating `MemoryVFS.mapNameToFile` before calling `open_v2`. This
bypasses the INSERT loop (previously ~1229 ms) and the parquet fetch/parse (~374–480 ms),
replacing them with a single SQL geo query (~244–317 ms) over the preloaded DB.

**Loading screen lifted: ~725 ms** (down from ~2125–2559 ms baseline) — **~70% reduction**.

---

## Technique: MemoryVFS Seeding

`MemoryVFS` stores each open file as `{ name, flags, size, data: ArrayBuffer }` in a
`Map<string, file>` called `mapNameToFile`. Its `xOpen` method looks up by name before
creating a new entry. We exploit this:

```typescript
const vfs = new MemoryVFS();
sqlite3.vfs_register(vfs, true);

const buffer = await fetch(occurrencesDbUrl).then(r => r.arrayBuffer());

// Seed the VFS before open_v2 so SQLite finds an existing database.
(vfs as any).mapNameToFile.set('occurrences.db', {
  name: 'occurrences.db',
  flags: 0x2,          // SQLITE_OPEN_READWRITE — no DELETEONCLOSE
  size: buffer.byteLength,
  data: buffer,
});

const db = await sqlite3.open_v2('occurrences.db');  // finds seeded entry, no blank DB
```

Key verified fact: SQLite passes the filename as-is (`'occurrences.db'`) to `xOpen` via
the VFS — no path normalization — so the map key matches exactly.

---

## Benchmark Results (Chromium, localhost, two runs)

| Step | Baseline (string-escape INSERT) | Spike (preloaded DB) |
|---|---|---|
| WASM instantiate | ~31–48 ms | ~9–10 ms |
| fetch + parquet parse | ~374–480 ms | — eliminated |
| INSERT loop | **~1229 ms** | — eliminated |
| fetch occurrences.db | — | ~105–121 ms (24 MB raw, localhost) |
| open_v2 preloaded | — | ~1–3 ms |
| SQL geo query (92K rows, 10 cols) | — | ~244–317 ms |
| GeoJSON build | ~30–40 ms | ~28–31 ms |
| worker tablesReady | **~1750–2003 ms** | **~406–462 ms** |
| GeoJSON transfer | ~100–107 ms | ~112–113 ms |
| **Loading screen lifted** | **~2125–2559 ms** | **~723–752 ms** |

Baseline benchmarks were from Firefox; spike from Chromium — absolute numbers not
directly comparable, but the relative gain is large.

---

## File Size

| Format | Size |
|---|---|
| `occurrences.parquet` | 3.2 MB |
| `occurrences.db` raw | 24.0 MB |
| `occurrences.db` gzip (level 6) | **3.9 MB** |

CloudFront already serves with `Content-Encoding: gzip`, so production fetch cost is
3.9 MB vs 3.2 MB — 700 KB overhead, acceptable.

---

## Spike Artifacts

| File | Description |
|---|---|
| `src/sqlite-worker-db.ts` | Spike worker implementation — reference for follow-up |
| `src/manifest.ts` | Added `occurrences_db?: string` to Manifest interface |
| `scripts/make-local-manifest.js` | Added `occurrences_db: 'occurrences.db'` |
| `public/data/occurrences.db` | Local test DB (gitignored) |

---

## GeoJSON from SQL (new pattern)

Instead of parsing parquet rows in JS, we query the preloaded DB:
```sql
SELECT lat, lon, ecdysis_id, observation_id, specimen_observation_id,
       year, scientificName, genus, family, source
FROM occurrences WHERE lat IS NOT NULL AND lon IS NOT NULL
```
This reads 10 of 36 columns for 92,802 rows, taking ~244–317 ms. The GeoJSON builder
`_buildGeoJSONFromSQL` in the spike worker processes the result by positional index.

We also eliminate hyparquet entirely — no parquet fetch or parse needed.

---

## Follow-up Work (not in this spike)

To ship this:

1. **Pipeline**: add a `generate_sqlite` step to `data/run.py` after dbt export.
   ~5 lines of Python (duckdb → sqlite3, same pattern as spike generation command).

2. **nightly.sh / S3 upload**: `occurrences.db` needs to be uploaded to S3 alongside
   `occurrences.parquet` and included in the content-hashed manifest.

3. **Worker cutover**: swap `sqlite-worker.ts` for `sqlite-worker-db.ts` (1-line change
   in `sqlite.ts`). Can delete parquet loading code and hyparquet dependency after cutover.

4. **Canary / fallback**: consider keeping parquet fallback for one release cycle if
   occurrences_db is absent from manifest (optional).

---

## Known Risks / Open Questions

- **Memory**: 24 MB raw buffer lives in worker heap alongside SQLite's WASM page cache.
  Peak worker heap may be higher than old approach (old: parquet data GC'd after INSERT).
  Needs measurement — not yet done in this spike.

- **SQL geo query 244–317 ms**: this is a full table scan with no covering index.
  A composite index on `(lat, lon)` would not help much (still reads all rows).
  The time is dominated by reading 10 columns × 92K rows from WASM memory. Acceptable.

- **Production fetch time**: localhost fetch was 105–121 ms. Over CDN for 3.9 MB,
  expect ~300–600 ms on a typical connection — still better than old baseline after
  INSERT elimination.

- **`mapNameToFile` is a private field**: accessed via `(vfs as any)`. Safe since the
  VFS is our dependency, not a platform API. Pin the wa-sqlite version when shipping.
