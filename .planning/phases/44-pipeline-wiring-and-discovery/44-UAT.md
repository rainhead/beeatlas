---
status: testing
phase: 44-pipeline-wiring-and-discovery
source: [44-01-SUMMARY.md]
started: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. nightly.sh delegates to run.py and uploads feeds
expected: |
  Open data/nightly.sh. The inline Python heredoc block (python - <<'EOF') is gone.
  In its place is a single line: ~/.local/bin/uv run python run.py
  After the existing parquet/geojson for-loop, there is a line:
  aws --profile "$AWS_PROFILE" s3 sync --no-progress "$EXPORT_DIR/feeds/" "s3://$BUCKET/data/feeds/"
  Running `bash -n data/nightly.sh` exits 0 with no errors.
result: issue
reported: "nightly.sh line 29 hardcodes an incorrect path to uv. Rely on $PATH being set correctly."
severity: major
fix: "Changed ~/.local/bin/uv run python run.py → uv run python run.py (relies on PATH)"
fix_status: applied
followup_issue:
  reported: "During live run, ecdysis_links showed '46090 to process, 0 already done' — DLT pipeline state not preserved; expected incremental run from cached state in DuckDB."
  severity: major

### 2. Atom feed autodiscovery tag in index.html
expected: |
  Open frontend/index.html. Inside the <head> section, there is:
  <link rel="alternate" type="application/atom+xml" title="Washington Bee Atlas — All Recent Determinations" href="/data/feeds/determinations.xml">
  A feed reader or browser extension that scans for Atom feeds would find the determinations feed automatically at /data/feeds/determinations.xml without requiring a manual URL entry.
result: pass

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0

## Gaps

[none yet]
