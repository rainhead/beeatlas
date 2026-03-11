---
phase: quick-1
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - data/inat/download.py
  - data/tests/test_inat_download.py
  - scripts/cache_restore.sh
  - scripts/cache_upload.sh
autonomous: true
requirements: []

must_haves:
  truths:
    - "Each pipeline run writes observations.ndjson containing one raw API dict per line"
    - "samples.parquet contains a downloaded_at column (UTC ISO string) on every row"
    - "Incremental merge preserves existing downloaded_at for unchanged rows; new rows get current fetch time"
    - "Cache restore and upload scripts handle observations.ndjson alongside existing files"
  artifacts:
    - path: "data/inat/download.py"
      provides: "Updated pipeline writing observations.ndjson and downloaded_at column"
      contains: "observations.ndjson"
    - path: "scripts/cache_restore.sh"
      provides: "Restores observations.ndjson from S3 in addition to existing files"
    - path: "scripts/cache_upload.sh"
      provides: "Uploads observations.ndjson to S3 in addition to existing files"
  key_links:
    - from: "data/inat/download.py main()"
      to: "data/observations.ndjson"
      via: "json.dumps each result dict, one per line"
      pattern: "observations\\.ndjson"
    - from: "data/inat/download.py build_dataframe()"
      to: "samples.parquet downloaded_at column"
      via: "downloaded_at kwarg passed from main()"
      pattern: "downloaded_at"
---

<objective>
Store the full raw iNaturalist API observation dicts in an NDJSON cache file alongside samples.parquet, and add a downloaded_at column to samples.parquet tracking when each observation was fetched.

Purpose: Enables new fields to be consumed client-side without re-downloading all observations from iNat.
Output: data/observations.ndjson (full raw API cache), updated samples.parquet schema with downloaded_at column, updated cache scripts.
</objective>

<execution_context>
@/Users/rainhead/.claude/get-shit-done/workflows/execute-plan.md
@/Users/rainhead/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@data/inat/download.py
@data/inat/observations.py
@data/tests/test_inat_download.py
@scripts/cache_restore.sh
@scripts/cache_upload.sh

<interfaces>
<!-- Current download.py key signatures -->

SAMPLES_PATH = Path("samples.parquet")
LAST_FETCH_PATH = Path("last_fetch.txt")

DTYPE_MAP: dict[str, Any] = {
    "observation_id": "int64",
    "observer": pd.StringDtype(),
    "date": pd.StringDtype(),
    "lat": "float64",
    "lon": "float64",
    "specimen_count": pd.Int64Dtype(),
}

def obs_to_row(obs: dict) -> dict  # accesses obs["id"], obs["user"]["login"], obs["location"], obs.get("ofvs", [])
def build_dataframe(results: list) -> pd.DataFrame
def merge_delta(existing: pd.DataFrame, delta: pd.DataFrame) -> pd.DataFrame
def main() -> None  # incremental if SAMPLES_PATH and LAST_FETCH_PATH exist
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add observations.ndjson cache and downloaded_at column to download pipeline</name>
  <files>data/inat/download.py, data/tests/test_inat_download.py</files>
  <behavior>
    - build_dataframe(results, downloaded_at="2024-06-15T00:00:00+00:00") adds a downloaded_at column (pd.StringDtype) to every row
    - build_dataframe with no downloaded_at argument (or downloaded_at=None) adds the column but fills with pd.NA
    - DTYPE_MAP and COLUMNS include downloaded_at as pd.StringDtype()
    - merge_delta preserves existing downloaded_at for rows not in delta; delta rows get their downloaded_at
    - main() writes data/observations.ndjson: one JSON object per line, one line per result from fetch_all/fetch_since (including obs with no location, which are skipped in build_dataframe but should still be cached)
    - test_column_names asserts downloaded_at is present
    - test_dtypes asserts downloaded_at dtype is pd.StringDtype()
    - new test: build_dataframe with downloaded_at kwarg sets all rows to that value
    - new test: build_dataframe without downloaded_at kwarg has pd.NA in downloaded_at column
    - new test: main() writes observations.ndjson with correct line count (one per result)
  </behavior>
  <action>
    In data/inat/download.py:

    1. Add `import json` at the top.

    2. Add NDJSON_PATH constant: `NDJSON_PATH = Path("observations.ndjson")`

    3. Update DTYPE_MAP to include `"downloaded_at": pd.StringDtype()` at the end. Update COLUMNS accordingly.

    4. Change build_dataframe signature to `build_dataframe(results: list, downloaded_at: str | None = None) -> pd.DataFrame`.
       - After constructing the df, add: `df["downloaded_at"] = pd.array([downloaded_at] * len(df), dtype=pd.StringDtype())`
       - In the empty-results branch, include downloaded_at in the empty array dict.
       - Apply dtype: `df["downloaded_at"] = df["downloaded_at"].astype(pd.StringDtype())`

    5. In main(), capture the fetch timestamp BEFORE calling build_dataframe:
       `now = datetime.now(timezone.utc).isoformat()`
       Pass it: `delta = build_dataframe(results, downloaded_at=now)`

    6. In main(), after computing `results`, write NDJSON_PATH:
       ```python
       with NDJSON_PATH.open("w") as f:
           for obs in results:
               f.write(json.dumps(obs) + "\n")
       ```
       Write this BEFORE build_dataframe is called (raw results are available).

    7. Update the final print to include NDJSON_PATH.

    In data/tests/test_inat_download.py:

    8. Replace make_mock_obs with a plain-dict factory. obs_to_row uses dict access (obs["id"],
       obs["user"]["login"], obs["location"], obs["observed_on"], obs.get("ofvs", [])), not
       attribute access. MagicMock subscript returns a new MagicMock, not the attribute value,
       so the attribute-based MagicMock is broken for obs_to_row tests.

       Replace the function with:
       ```python
       def make_mock_obs(
           obs_id: int = 1,
           login: str = "testuser",
           observed_on: str = "2024-06-15",
           lat: float = 47.6,
           lon: float = -120.5,
           ofvs: list | None = None,
       ) -> dict:
           """Create a plain dict matching the raw iNaturalist API observation shape."""
           return {
               "id": obs_id,
               "user": {"login": login},
               "observed_on": observed_on,
               "location": (lat, lon),
               "ofvs": ofvs or [],
           }
       ```

       Also remove `from datetime import date` from imports if it is no longer used after this change.

       Update test_date_is_string: pass observed_on as a string ("2024-07-04") since obs_to_row
       reads obs["observed_on"] directly without conversion:
       ```python
       def test_date_is_string(self):
           from inat.download import obs_to_row
           obs = make_mock_obs(observed_on="2024-07-04")
           row = obs_to_row(obs)
           assert row["date"] == "2024-07-04"
       ```

    8a. Update make_df to include a downloaded_at column so TestMergeDelta frames are
        schema-compatible with the 7-column DataFrames produced by build_dataframe after
        DTYPE_MAP is expanded. Add to defaults dict inside make_df:
        ```python
        "downloaded_at": pd.array([None] * n, dtype=pd.StringDtype()),
        ```

    9. Update TestBuildDataframe.test_column_names: change the exact set assertion to include
       "downloaded_at":
       ```python
       assert set(df.columns) == {"observation_id", "observer", "date", "lat", "lon", "specimen_count", "downloaded_at"}
       ```

    10. Update TestBuildDataframe.test_dtypes: assert df["downloaded_at"].dtype == pd.StringDtype().

    11. Update TestBuildDataframe.test_empty_results_returns_empty_df: change the exact set
        assertion to include "downloaded_at":
        ```python
        assert set(df.columns) == {"observation_id", "observer", "date", "lat", "lon", "specimen_count", "downloaded_at"}
        ```

    12. Add new test class TestBuildDataframeDownloadedAt:
        - test_downloaded_at_set_when_provided: build_dataframe([obs], downloaded_at="2024-06-15T00:00:00+00:00") → all rows have that value
        - test_downloaded_at_na_when_not_provided: build_dataframe([obs]) → downloaded_at column is all pd.NA

    13. Add new test for NDJSON writing in a TestMain class or standalone function:
        - Patch fetch_all to return two plain dicts:
          [{"id": 1, "user": {"login": "u"}, "observed_on": "2024-01-01", "location": [47.0, -120.0], "ofvs": []},
           {"id": 2, "user": {"login": "v"}, "observed_on": "2024-01-02", "location": [48.0, -121.0], "ofvs": []}]
        - Patch SAMPLES_PATH.exists() and LAST_FETCH_PATH.exists() to return False (force full fetch)
        - Monkeypatch NDJSON_PATH, SAMPLES_PATH, LAST_FETCH_PATH to tmp_path variants
        - Call main()
        - Assert observations.ndjson exists and has exactly 2 lines, each parseable as JSON

    Note: For build_dataframe tests use make_mock_obs (now a plain dict). For main() test,
    provide raw dicts directly as the patch return value — same shape.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/data && uv run pytest tests/test_inat_download.py -x -q 2>&1 | tail -20</automated>
  </verify>
  <done>All existing tests pass; new downloaded_at tests pass; NDJSON writing test passes. No regressions.</done>
</task>

<task type="auto">
  <name>Task 2: Update cache scripts to handle observations.ndjson</name>
  <files>scripts/cache_restore.sh, scripts/cache_upload.sh</files>
  <action>
    In scripts/cache_restore.sh, add after the last_fetch.txt block:
    ```bash
    aws s3 cp "s3://$BUCKET/cache/observations.ndjson" "$CACHE_DIR/observations.ndjson" 2>/dev/null \
      && echo "observations.ndjson restored" \
      || echo "observations.ndjson not in cache (will be written after fetch)"
    ```

    In scripts/cache_upload.sh, add after the last_fetch.txt upload line:
    ```bash
    if [ -f "$CACHE_DIR/observations.ndjson" ]; then
      aws s3 cp "$CACHE_DIR/observations.ndjson" "s3://$BUCKET/cache/observations.ndjson"
      echo "observations.ndjson uploaded."
    fi
    ```
    The conditional guard prevents CI failure on first run before the file exists.
  </action>
  <verify>
    <automated>bash -n /Users/rainhead/dev/beeatlas/scripts/cache_restore.sh && bash -n /Users/rainhead/dev/beeatlas/scripts/cache_upload.sh && grep -q "observations.ndjson" /Users/rainhead/dev/beeatlas/scripts/cache_restore.sh && grep -q "observations.ndjson" /Users/rainhead/dev/beeatlas/scripts/cache_upload.sh && echo "OK"</automated>
  </verify>
  <done>Both scripts pass bash syntax check and contain observations.ndjson handling. Cache upload is guarded against missing file on first run.</done>
</task>

</tasks>

<verification>
After both tasks:
- `cd /Users/rainhead/dev/beeatlas/data && uv run pytest tests/test_inat_download.py -q` — all tests green
- `python -c "from inat.download import DTYPE_MAP, NDJSON_PATH; assert 'downloaded_at' in DTYPE_MAP; print('OK')"` from data/
- `grep -q observations.ndjson scripts/cache_restore.sh scripts/cache_upload.sh && echo "scripts OK"`
</verification>

<success_criteria>
- samples.parquet schema includes downloaded_at (pd.StringDtype) on every row
- observations.ndjson is written by the pipeline with one raw API dict per line
- Incremental merge: delta rows carry new downloaded_at; existing rows keep theirs (merge_delta already handles this via concat+drop_duplicates with keep='last' on observation_id, so downloaded_at follows the winning row)
- Cache scripts restore and upload observations.ndjson without failing when file is absent
- All existing tests pass; new tests cover downloaded_at and NDJSON output
</success_criteria>

<output>
After completion, create `.planning/quick/1-store-full-observation-json-in-cache-wit/1-SUMMARY.md`
</output>
