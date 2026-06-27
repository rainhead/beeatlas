---
phase: 171-per-collector-event-stream
verified: 2026-06-27T16:35:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Phase 171: Per-Collector Event Stream Verification Report

**Phase Goal:** The collector page shows a reverse-chronological collection→identification event feed (Collected + Identified, full re-determination history), the waba_specimen→ecdysis transition reads as one continuous specimen (not delete+create), with Eleventy-paginated sub-pages for high-volume collectors — all pre-computed in the pipeline and rendered statically (JS-free).
**Verified:** 2026-06-27T16:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Reverse-chronological event feed (Collected + Identified) renders on the collector page, readable on any device from a bookmarked URL | VERIFIED | `collector-detail.njk` renders `<table class="event-feed">` over `collector.first_page_events`; `_site/collectors/swisschick/` confirmed in UAT; CSS `event-feed-wrap` `overflow-x: auto` handles mobile |
| 2 | waba_specimen→ecdysis transition reads as one continuous specimen — not delete+create; uncatalogued waba_specimen shows "Collected, awaiting ID" | VERIFIED | D-EVENT-01: is_pending=True on waba_specimen (ecdysis_id IS NULL) rows; template renders `<span class="event-pending">awaiting ID</span>`; `test_waba_specimen_is_pending` PASS |
| 3 | Full re-determination history (current + superseded) appears as distinct Identified events with chronological "Identified"/"Re-identified" labels | VERIFIED | `is_reidentification` boolean computed in two-pass over query results (earliest sort_ts per (login, ecdysis_id) = first ID); `test_is_reidentification_chronological_label` PASS; template uses `id_label = 'Re-identified' if event.is_reidentification else 'Identified'`; color accent driven separately by `is_current` |
| 4 | High-volume collectors get Eleventy-generated static sub-pages bounded to 100 events/page | VERIFIED | `collector_event_pages.json`: 1,081 sub-pages, all `page_num >= 2`, max events/page = 100; swisschick has 14,754 events across 148 pages; `test_chunk_bound` PASS |
| 5 | Species names resolve rank-aware: bee taxa link to BeeAtlas `/species/{slug}/`, non-bee named taxa link to iNaturalist `/taxa/{name}`, undetermined/blank = plain text | VERIFIED | 5-step slug resolver in `_resolve_slug()` + inat_url fallback; `test_slug_resolution` and `test_nonbee_inat_url_and_bee_resolution` PASS; mutually exclusive `species_slug` xor `inat_url` in event JSON |
| 6 | All data pre-computed in pipeline; collector page is JS-free | VERIFIED | `grep -ci "<script" collector-detail.njk collector-events-page.njk` = 0; `data/run.py` STEPS entry registers `collectors-events-export` after `collectors-export`; ELEVENTY_RUN_MODE guard in `_data/collectors.js` prevents 30 MB load in dev/vitest |
| 7 | Both test suites green; committed artifacts are valid and tracked by git | VERIFIED | `npm test`: 892 passed (33 files); `uv run pytest -m "not integration"`: 259 passed, 9 skipped; `git check-ignore public/data/collector_event_pages.json` exit 1 (not ignored); both artifact files committed under gitignore allowlist |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/collectors_events_export.py` | Event-feed export: batch query + rank-aware slug resolution + 2D chunking | VERIFIED | 416 lines; batch DuckDB UNION ALL query with `coreid = CAST(cs.ecdysis_id AS VARCHAR)` join; `_resolve_slug()` 5-step resolution; `_load_species_maps()` from species.json + higher_taxa.json; 2-pass is_reidentification computation; `CHUNK_SIZE = int(os.environ.get("EVENT_CHUNK_SIZE", "100"))` |
| `public/data/collector_event_pages.json` | Flat sub-page descriptor array for pages 2+ (committed build artifact) | VERIFIED | 30,215,432 bytes; 1,081 sub-pages; all page_num >= 2; max 100 events/page; gitignore allowlist `!/public/data/collector_event_pages.json` present |
| `public/data/collectors.json` | Extended in place with first_page_events + pagination metadata; existing keys preserved | VERIFIED | 3,702,396 bytes; 124 collectors; all have `first_page_events`, `total_event_pages`, `total_event_count`; `display_name` and 10 existing keys intact; 121 collectors with events, 70 with sub-pages |
| `data/tests/test_collectors_events_export.py` | Golden-fixture pytest for the events export | VERIFIED | 771 lines; 10 tests; all PASS; covers waba_specimen pending, chunk bound, slug resolution, inat_url fallback, is_reidentification, catalog_number, collectors_json extension |
| `src/tests/data-collectors.test.ts` | Vitest STREAM-01/02/03 artifact-shape assertions | VERIFIED | 208 lines; 13 tests; all PASS; reads artifacts directly via readFileSync; includes `| safe`-count == 0 and `<script` absence guards via page-scaffold |
| `_pages/collector-events-page.njk` | Paginated sub-page template (pages 2+) | VERIFIED | 74 lines; paginates `collectors.collectorEventPages` size:1; permalink `/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num }}/index.html`; full prev/next nav with page indicator |
| `_pages/collector-detail.njk` (extended) | First-page feed + empty state + Older events link | VERIFIED | event-feed-section with `<table class="event-feed">` over `first_page_events`; empty state `No specimen events recorded yet.`; `Older events →` link when `total_event_pages > 1`; Atom feed subscribe link when `atom_feed_url` present |
| `_data/collectors.js` (extended) | Loader with collectorEventPages + ELEVENTY_RUN_MODE HMR guard | VERIFIED | Exports `{ collectorsArray, collectorEventPages }`; `collectorEventPages` loaded only when `ELEVENTY_RUN_MODE === 'build'`; no parquet read |
| `src/styles/places.css` (extended) | Event-feed CSS: table, columns, type modifiers, pagination | VERIFIED | `.event-feed-section`, `.event-feed-wrap`, `table.event-feed`, `.event-date`, `.event-type--collected/--identified/--reidentified`, `.event-catalog`, `.event-determiner`, `.event-pending`, `.event-pagination`, `.page-indicator`, `.feed-link` all present |
| `.planning/phases/171-per-collector-event-stream/171-HUMAN-UAT.md` | Operator UAT checklist with approval | VERIFIED | frontmatter `status: passed`, `approved: 2026-06-27`; approval note lists all UAT-driven features verified; commit `06ad12d4 test(171): operator UAT approved` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `data/collectors_events_export.py` | `ecdysis_data.identifications` | `i.coreid = CAST(cs.ecdysis_id AS VARCHAR)` | WIRED | Pattern confirmed; grep count = 1 on `coreid = CAST` |
| `data/collectors_events_export.py` | `public/data/species.json` + `higher_taxa.json` | `_load_species_maps(ASSETS_DIR)` — same files frontend uses | WIRED | `genus_map` built from both; covers all 47 known bee genera |
| `data/run.py` | `collectors_events_export.export_collectors_events_step` | `from collectors_events_export import ...`; STEPS entry after `collectors-export`, before `places-maps` | WIRED | Lines 49, 128–130 confirmed |
| `_data/collectors.js` | `public/data/collector_event_pages.json` | `readFileSync` guarded by `process.env.ELEVENTY_RUN_MODE === 'build'` | WIRED | Guard present; returns `[]` in dev/vitest; loads 30 MB only in CI build |
| `_pages/collector-events-page.njk` | `collectors.collectorEventPages` | `pagination: { data: collectors.collectorEventPages, size: 1, alias: evpage }` | WIRED | Front matter confirmed; permalink confirmed |
| `_pages/collector-detail.njk` | `/species/{slug}/` | `<a href="/species/{{ event.species_slug }}/">` in event-row; iNat fallback via `event.inat_url` | WIRED | Both Collected and Identified event rows have rank-aware taxon link logic |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `collector-detail.njk` | `collector.first_page_events` | `collectors.json` (pre-computed by `collectors_events_export.py` from DuckDB batch query over `occurrences.parquet` + `ecdysis_data.identifications`) | Yes — 121/124 collectors have non-empty event lists; max 14,754 events (swisschick) | FLOWING |
| `collector-events-page.njk` | `evpage.events` | `collector_event_pages.json` (1,081 real sub-page chunks, all bounded to 100 events) | Yes — 1,081 sub-pages, 30 MB of real determination data | FLOWING |
| `_data/collectors.js` | `collectorEventPages` | `collector_event_pages.json` via `readFileSync` (build-mode only) | Yes — 1,081 entries, guard verified | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| collectors.json has first_page_events on all entries | `python3 -c "import json; c=json.load(open('public/data/collectors.json')); assert all('first_page_events' in r and 'display_name' in r for r in c)"` | exit 0 | PASS |
| collector_event_pages.json all page_num >= 2, max 100 events | `python3 -c "import json; d=json.load(open('public/data/collector_event_pages.json')); assert all(p['page_num']>=2 and len(p['events'])<=100 for p in d)"` | exit 0 | PASS |
| git check-ignore returns non-zero for allowlisted file | `git check-ignore public/data/collector_event_pages.json; echo $?` | exit 1 (not ignored) | PASS |
| Event feed table rendered in both templates | grep for `<table class="event-feed"` in both .njk files | present in both | PASS |
| No `| safe` in event templates | `grep -c "| safe" collector-detail.njk collector-events-page.njk` | 0 in both | PASS |
| No `<script` in event templates | `grep -ci "<script" collector-detail.njk collector-events-page.njk` | 0 in both | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| STREAM-01 | 171-01, 171-02, 171-03 | The collector page shows a reverse-chronological collection→identification event feed | SATISFIED | `first_page_events` in collectors.json (121/124 collectors); table rendered in collector-detail.njk; events ordered by `sort_ts DESC NULLS LAST` in batch query |
| STREAM-02 | 171-01, 171-02, 171-03 | A specimen being catalogued (waba_specimen → ecdysis) appears as an event in the feed | SATISFIED (structurally per D-EVENT-01) | waba_specimen rows produce Collected/awaiting-ID event; the waba→ecdysis transition is one continuous row (ARM-3 de-dup from Phase 168); no fake cataloguing event (no trustworthy date — 168 D-03) |
| STREAM-03 | 171-01, 171-02, 171-03 | The feed paginates / bounds its length for high-volume collectors (500+ records) | SATISFIED | CHUNK_SIZE=100; 70 collectors have sub-pages; swisschick: 14,754 events → 148 pages; 1,081 total sub-page descriptors |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TBD/FIXME/XXX/TODO/HACK/placeholder markers found in any phase-modified file |

### UAT-Driven Additions Verification

The phase went through six operator-UAT revisions post-plan. All additions are verified in the codebase:

| Addition | Evidence |
|----------|---------|
| Real `<table class="event-feed">` with thead (Date/Catalog/Event/Taxon/Determiner) | Both templates; page-scaffold test `collector-detail.njk renders <table class="event-feed">` PASS |
| Catalog column: label number (WSDA_ prefix stripped) linked to ecdysis.org | `{{ event.catalog_number | replace("WSDA_", "") }}` with `href="https://ecdysis.org/…?occid={{ event.ecdysis_id }}"` in both templates |
| Chronological Identified/Re-identified labels (`is_reidentification` field) | 2-pass computation in export; `test_is_reidentification_chronological_label` PASS; `id_label = 'Re-identified' if event.is_reidentification else 'Identified'` in templates |
| iNaturalist `/taxa/{name}` fallback for non-bee taxa (`inat_url` field) | `inat_url` computed via `quote(species_name)` when `slug is None` and name is not "undetermined"; `test_nonbee_inat_url_and_bee_resolution` PASS; `rel="external" class="event-taxon--external"` in templates |
| Per-collector Atom feed subscribe link (`atom_feed_url` from collectors_export.py) | 121/124 collectors have `atom_feed_url`; `<link rel="alternate">` autodiscovery + visible link in `<h2>Collection history…</h2>` in collector-detail.njk |
| `event-feed-wrap` overflow-x:auto container for mobile horizontal scroll | Both templates wrap table in `<div class="event-feed-wrap">`; CSS at `.event-feed-wrap { overflow-x: auto }` in places.css; page-scaffold test asserts presence in both templates |

### Human Verification Required

None. Operator UAT was conducted and approved 2026-06-27 (frontmatter `status: passed`, `approved: 2026-06-27`; commit `06ad12d4`). The approval note explicitly lists all features verified: real `<table>` feed, chronological labels, catalog label-number linked to Ecdysis, rank-aware BeeAtlas links + iNaturalist fallback, Atom feed subscribe link, empty-state + pagination.

### Gaps Summary

No gaps. All 7 must-have truths verified, all 10 artifacts confirmed substantive and wired, all key links present, both test suites green, operator UAT approved. The ROADMAP success criteria supersessions (posting dropped per D-02; cataloguing event structural per D-EVENT-01) are locked decisions acknowledged in 171-CONTEXT.md and repeated in the phase goal note.

---

_Verified: 2026-06-27T16:35:00Z_
_Verifier: Claude (gsd-verifier)_
