---
phase: quick-1
verified: 2026-03-11T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Quick Task 1: Store Full Observation JSON in Cache Verification Report

**Task Goal:** Store full observation JSON in cache with download timestamp. The cache (observations.ndjson) should contain the full raw API representation of each observation. samples.parquet should include a downloaded_at column. Cache scripts should handle observations.ndjson.
**Verified:** 2026-03-11
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Each pipeline run writes observations.ndjson containing one raw API dict per line | VERIFIED | `main()` in `data/inat/download.py` lines 162-164: opens `NDJSON_PATH` and writes `json.dumps(obs) + "\n"` for each result before any filtering |
| 2  | samples.parquet contains a downloaded_at column (UTC ISO string) on every row | VERIFIED | `DTYPE_MAP` includes `"downloaded_at": pd.StringDtype()` (line 42); `build_dataframe()` sets column from `downloaded_at` kwarg (line 117); `main()` passes `now = datetime.now(timezone.utc).isoformat()` (lines 166-167) |
| 3  | Incremental merge preserves existing downloaded_at for unchanged rows; new rows get current fetch time | VERIFIED | `merge_delta()` uses `concat + drop_duplicates(keep="last")` so delta rows (with new `downloaded_at`) win; existing rows untouched. `TestMergeDelta` class covers deduplication behavior |
| 4  | Cache restore and upload scripts handle observations.ndjson alongside existing files | VERIFIED | `cache_restore.sh` line 15-17: `aws s3 cp` for observations.ndjson with graceful fallback. `cache_upload.sh` lines 9-12: conditional guard prevents failure when file absent on first run |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/inat/download.py` | Updated pipeline writing observations.ndjson and downloaded_at column | VERIFIED | Contains `NDJSON_PATH`, `import json`, `downloaded_at` in `DTYPE_MAP`, `build_dataframe(results, downloaded_at=...)`, NDJSON write block in `main()` |
| `scripts/cache_restore.sh` | Restores observations.ndjson from S3 in addition to existing files | VERIFIED | Line 15-17 adds `aws s3 cp` for observations.ndjson with non-fatal error handling |
| `scripts/cache_upload.sh` | Uploads observations.ndjson to S3 in addition to existing files | VERIFIED | Lines 9-12 add conditional upload guarded with `[ -f "$CACHE_DIR/observations.ndjson" ]` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/inat/download.py main()` | `data/observations.ndjson` | `json.dumps` each result dict, one per line | WIRED | `NDJSON_PATH.open("w")` + loop at lines 162-164; `NDJSON_PATH = Path("observations.ndjson")` at line 33 |
| `data/inat/download.py build_dataframe()` | `samples.parquet downloaded_at column` | `downloaded_at` kwarg passed from `main()` | WIRED | `main()` computes `now` (line 166), passes to `build_dataframe(results, downloaded_at=now)` (line 167); `build_dataframe` stamps every row (line 117) |

### Anti-Patterns Found

None detected. No TODO/FIXME/placeholder comments, no empty return stubs, no unimplemented handlers in modified files.

### Tests

All 18 tests pass (`uv run pytest tests/test_inat_download.py -q`):

- `TestObsToRow` (5 tests) — existing row extraction tests pass with updated plain-dict factory
- `TestBuildDataframe` (5 tests) — column names and dtypes assertions updated to include `downloaded_at`
- `TestBuildDataframeDownloadedAt` (2 tests) — new: verifies kwarg sets column value; no kwarg yields pd.NA
- `TestMergeDelta` (4 tests) — pass unchanged; `make_df` updated to include `downloaded_at` for schema compatibility
- `TestMain` (1 test) — new: patches `fetch_all`, monkeypatches paths to tmp_path, asserts 2-line NDJSON output
- `TestExports` (1 test) — existing importability check

### Human Verification Required

None. All behaviors are covered by automated checks and tests.

---

_Verified: 2026-03-11_
_Verifier: Claude (gsd-verifier)_
