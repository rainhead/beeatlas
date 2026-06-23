# Deferred Items — Phase 160

## From 160-03 (out-of-scope discovery)

**test_sqlite_export.py: 16 failures (`_duckdb.IOException: No files found … occurrence_places.parquet`)**

- **Discovered during:** 160-03 full-suite verification.
- **Root cause:** 160-02 (commit `a89ea025`) added `CREATE TABLE out.occurrence_places AS SELECT * FROM read_parquet('…/occurrence_places.parquet')` to `sqlite_export.py:442`, but `tests/test_sqlite_export.py` fixtures do not write a sibling `occurrence_places.parquet`, so `generate_sqlite` raises before the assertions run.
- **Why deferred:** Out of scope for 160-03, whose `<files>` are only `data/places_export.py` and `data/places_maps.py`. The defect lives in `sqlite_export.py` / its tests (owned by 160-02). My 160-03 commits (`6aee4672`, `863edf42`) do not touch `sqlite_export.py` and do not cause these failures.
- **Suggested owner:** A follow-up that updates `tests/test_sqlite_export.py` fixtures to emit an `occurrence_places.parquet` sibling (mirror the 160-02 bridge fixture), or 160-04 if it touches the sqlite arm.
