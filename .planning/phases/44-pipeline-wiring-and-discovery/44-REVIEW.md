---
phase: 44-pipeline-wiring-and-discovery
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - data/nightly.sh
  - frontend/index.html
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 44: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Two files reviewed: the nightly cron pipeline shell script and the frontend HTML entry point. The HTML is clean with no issues beyond a minor observation. The shell script has two substantive concerns: one that can silently mask real S3 errors as a benign first-run condition, and one where new export files added to the pipeline would be silently skipped on upload.

## Warnings

### WR-01: S3 pull error suppression masks real failures as first-run

**File:** `data/nightly.sh:20`
**Issue:** `2>/dev/null` suppresses all stderr from the `aws s3 cp` pull. If the pull fails for any reason other than a missing key (expired credentials, wrong region, network timeout, S3 throttling), the script silently treats it as a first-run scenario and proceeds with no local DB. The pipeline then runs against an empty/fresh DuckDB and subsequently overwrites the S3 backup with that empty DB.

**Fix:** Distinguish a missing-key exit from a genuine error. One approach is to capture the error message and only suppress the "key not found" case:

```bash
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress "s3://$BUCKET/$DB_S3_KEY" "$DB_PATH" 2>&1 \
    | grep -q "NoSuchKey\|does not exist\|404"; then
    echo "S3 pull failed with an unexpected error — aborting." >&2
    exit 1
fi
echo "No existing DuckDB in S3 (first run), starting fresh."
```

A simpler alternative: capture the exit code and stderr separately and inspect the message, or use `aws s3api head-object` first to check existence before pulling.

### WR-02: Hardcoded export file list will silently skip new exports

**File:** `data/nightly.sh:33-35`
**Issue:** The loop over `ecdysis.parquet samples.parquet counties.geojson ecoregions.geojson` is a static list. When a new export file is added to `run.py` (e.g., a new parquet or geojson), it will not be uploaded unless this list is also updated. There is no guard — the omission is silent.

**Fix:** Either use `s3 sync` for the flat files (parallel to how feeds are handled), or add an explicit check that all expected files exist before uploading:

```bash
# Option A: sync the whole export dir minus the feeds/ subdirectory
aws --profile "$AWS_PROFILE" s3 sync --no-progress \
    --exclude "feeds/*" \
    "$EXPORT_DIR/" "s3://$BUCKET/data/"

# Option B (if explicit list is preferred): verify all exist first
for f in ecdysis.parquet samples.parquet counties.geojson ecoregions.geojson; do
    [[ -f "$EXPORT_DIR/$f" ]] || { echo "Missing export: $f" >&2; exit 1; }
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$EXPORT_DIR/$f" "s3://$BUCKET/data/$f"
done
```

## Info

### IN-01: Hardcoded uv path is fragile across environments

**File:** `data/nightly.sh:29`
**Issue:** `~/.local/bin/uv` is an absolute path tied to the user home on maderas. If the script is run under a different user (e.g., via `sudo cron`, a different service account, or a future CI environment), `uv` will not be found and the error message will be confusing.

**Fix:** Either add `~/.local/bin` to `PATH` at the top of the script, or use `command -v uv` with a helpful error:

```bash
export PATH="$HOME/.local/bin:$PATH"
uv run python run.py
```

### IN-02: No Content Security Policy in index.html

**File:** `frontend/index.html:3-11`
**Issue:** No `<meta http-equiv="Content-Security-Policy">` tag is present. This may be intentional if CSP headers are set at the CloudFront distribution level, but it is not verifiable from the HTML alone. A missing CSP leaves XSS mitigation solely to CloudFront configuration.

**Fix:** Confirm CSP is set in CloudFront response headers policy. If not, add a meta CSP. If it is set at CloudFront, a brief comment in the HTML noting this would help future maintainers.

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
