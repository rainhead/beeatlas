---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Sample Layer
status: Roadmap defined, ready for plan-phase
stopped_at: Completed 14-01-PLAN.md
last_updated: "2026-03-13T03:43:31.561Z"
last_activity: 2026-03-12 — Roadmap created for v1.4 (Phases 13–15)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 4
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** v1.4 Sample Layer — Phase 13 (Parquet Sources and Asset Pipeline)

## Current Position

Phase: 13 — Parquet Sources and Asset Pipeline
Plan: —
Status: Roadmap defined, ready for plan-phase
Last activity: 2026-03-12 — Roadmap created for v1.4 (Phases 13–15)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 11 P01 | 8 | 2 tasks | 3 files |
| Phase 11 P02 | 3min | 3 tasks | 3 files |
| Phase 12 P01 | 3min | 2 tasks | 2 files |
| Phase 12-s3-cache-and-build-integration P02 | 2min | 2 tasks | 2 files |
| Phase 13-parquet-sources-and-asset-pipeline P01 | 1min | 2 tasks | 1 files |
| Phase 13-parquet-sources-and-asset-pipeline P02 | 1min | 2 tasks | 2 files |
| Phase 14-layer-toggle-and-map-display P01 | 3 | 2 tasks | 1 files |

## Accumulated Context

### Decisions

- **v1.3 scope**: Pipeline only — links.parquet (occurrenceID → inat_observation_id); frontend display deferred to v1.4+
- **v1.3 cache model**: Permanent per-record cache — once an occurrenceID→iNat link is fetched, it is never re-fetched
- **HTML scraping only method**: Symbiota (Ecdysis) has no associations API; confirmed `#association-div a[target="_blank"]` as selector
- **Two-level skip**: First skip on links.parquet presence (already linked); second skip on local HTML cache (parse without fetching)
- [Phase 11]: occurrenceID kept as-is (not renamed) in ecdysis.parquet to match iNaturalist join key semantics
- [Phase 11]: pytest.fail() pattern for TDD stubs gives clear failure message vs bare ImportError
- [Phase 11]: Initialize last_fetch_time = time.monotonic() so first HTTP request also sleeps to respect 20 req/sec rate limit
- [Phase 11]: Use integer ecdysis_id as HTML cache filename (e.g. 5594056.html), not UUID occurrenceID
- [Phase 11]: Write output parquet once at end after full loop to prevent partial data loss on error
- [Phase 12]: Cache scripts use aws s3 sync with --exclude '*' --include '*.html' to filter only HTML files for ecdysis_cache
- [Phase 12]: Restore uses graceful miss for both links.parquet and ecdysis_cache; upload fails fast if links.parquet missing
- [Phase 12-s3-cache-and-build-integration]: build-data.sh links pipeline block requires cd to REPO_ROOT before npm commands since script runs from data/ directory
- **v1.4 join key**: occurrenceID (UUID string) is the join key for links.parquet — NOT the integer ecdysis_id used as OL feature ID suffix; occurrenceID must be added to ParquetSource column list in Phase 13
- **v1.4 BigInt coercion**: hyparquet returns INT64 Parquet columns as JavaScript BigInt; must coerce with Number() at read time for both samples.parquet specimen_count and links.parquet inat_observation_id
- **v1.4 exclusive toggle**: Layer toggle uses layer.setVisible(bool) — exclusive display because sample data has no taxon column (filter parity impossible) and click-handling clarity (merged hit-tests create ambiguous UX)
- **v1.4 filter controls**: Specimen taxon/date filters are hidden when sample layer is active — sample features have no scientificName/genus/family properties; any active filter silently hides all dots
- [Phase 13-parquet-sources-and-asset-pipeline]: occurrenceID kept as UUID string (large_string) — no Number() coercion; SampleParquetSource uses lat/lon matching samples.parquet schema
- [Phase 13-parquet-sources-and-asset-pipeline]: Sample colors use shifted palette (teal/blue/slate) distinct from specimen colors (green/orange/gray)
- [Phase 13-parquet-sources-and-asset-pipeline]: sampleDotStyle uses new Date() not Temporal.PlainDate.from() — ISO 8601+timezone strings not parseable by Temporal
- [Phase 14-01]: Tasks 1 and 2 committed together because TypeScript noUnusedLocals requires render() wiring for private methods to compile

### Pending Todos

| # | Title | Area | File |
|---|-------|------|------|
| 1 | Specify explicit fields on iNat API calls | general | [2026-03-12-specify-explicit-fields-on-inat-api-calls.md](./todos/pending/2026-03-12-specify-explicit-fields-on-inat-api-calls.md) |

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 1 | Store full observation JSON in cache with download timestamp | 2026-03-11 | 16256f3 | Verified | [1-store-full-observation-json-in-cache-wit](./quick/1-store-full-observation-json-in-cache-wit/) |

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-03-13T03:43:31.559Z
Stopped at: Completed 14-01-PLAN.md
Resume file: None
