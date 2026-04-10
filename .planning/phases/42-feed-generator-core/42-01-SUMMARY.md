---
phase: 42-feed-generator-core
plan: "01"
subsystem: data-pipeline
tags: [atom-feed, duckdb, python, rss, determinations]
one_liner: "Atom feed generator for recent bee determinations using stdlib xml.etree.ElementTree and DuckDB read-only connection"
dependency_graph:
  requires: []
  provides: [data/feeds.py, data/tests/test_feeds.py]
  affects: [data/run.py, data/tests/conftest.py, frontend/public/data/feeds/determinations.xml]
tech_stack:
  added: []
  patterns:
    - "xml.etree.ElementTree with ET.register_namespace for Atom XML generation"
    - "DuckDB read-only connection pattern (mirrors export.py)"
    - "monkeypatch ASSETS_DIR / DB_PATH for testable pipeline modules"
key_files:
  created:
    - data/feeds.py
    - data/tests/test_feeds.py
  modified:
    - data/tests/conftest.py
    - data/run.py
decisions:
  - "Use occurrence_id UUID (not record_id) as Atom entry <id> for globally-unique URNs"
  - "Include all recent determinations regardless of identification_is_current (feed title says 'All')"
  - "Skip file write entirely when 90-day window returns 0 rows (nightly batch context)"
  - "ET.tostring with encoding='unicode' + write_text avoids BOM issue with ET.write"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-10"
  tasks_completed: 3
  files_changed: 4
requirements_satisfied: [FEED-01, FEED-02, FEED-03, FEED-04, PIPE-01]
---

# Phase 42 Plan 01: Feed Generator Core Summary

## One-Liner

Atom feed generator for recent bee determinations using stdlib xml.etree.ElementTree and DuckDB read-only connection.

## What Was Built

`data/feeds.py` generates a valid Atom XML feed at `frontend/public/data/feeds/determinations.xml` by querying `beeatlas.duckdb` for identifications joined to occurrences within a 90-day window, filtering blank fields, and writing properly-structured Atom entries. The module is wired into `run.py` as the final pipeline step.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Test infrastructure and stubs (RED) | ed81f14 | data/tests/conftest.py, data/tests/test_feeds.py |
| 2 | Implement feeds.py (GREEN) | 0ddd4aa | data/feeds.py |
| 3 | Wire feeds into run.py | 4ebf19d | data/run.py |

## Decisions Made

1. **Entry `<id>` uses occurrence_id UUID** — `urn:ecdysis:{occurrence_uuid}` is stable across pipeline reloads (DarwinCore UUID semantics). Using `record_id` would be per-identification which could cause reader confusion across reruns. `occurrence_id` is globally unique per specimen (RFC 4287 §4.1.2 satisfied).

2. **No `identification_is_current` filter** — Feed title is "All Recent Determinations"; superseded identifications are legitimate determination events in the workflow. Filtering would silently drop ~13K of 41K entries without user-visible explanation.

3. **Empty result: skip file write** — For a nightly batch job, writing an empty or near-empty feed file is less useful than skipping; calling code logs the skip clearly.

4. **ET.tostring + write_text pattern** — Avoids the UTF-8 BOM that `ET.write(..., encoding='utf-8')` emits as bytes, which breaks some feed readers.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
$ cd data && uv run pytest tests/test_feeds.py -q
......
6 passed in 0.38s

$ uv run python -c "from feeds import main; print('ok')"
ok

$ grep -c 'feeds' data/run.py
3
```

Pre-existing failures (2 tests in test_export.py) are unrelated to this plan — confirmed present before any changes via git stash check.

## Known Stubs

None. All data flows from DuckDB query through to XML file write. No hardcoded empty values or placeholder text in output path.

## Threat Flags

No new threat surface beyond what is documented in the plan's `<threat_model>`. The `feeds/` output directory is created at write time with `mkdir(parents=True, exist_ok=True)` — no directory traversal risk since the path is constructed from module-level constants, not user input.

## Self-Check: PASSED

- [x] `data/feeds.py` exists
- [x] `data/tests/test_feeds.py` exists (6 tests, all passing)
- [x] `data/run.py` contains `("feeds", generate_feeds)` in STEPS
- [x] `data/tests/conftest.py` has identifications table + 3 seed rows + event_date on occurrences
- [x] Commits ed81f14, 0ddd4aa, 4ebf19d exist in git log
