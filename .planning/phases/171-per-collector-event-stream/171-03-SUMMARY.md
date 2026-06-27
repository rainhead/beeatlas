---
phase: 171-per-collector-event-stream
plan: "03"
subsystem: verification
tags: [verification, uat, event-feed, collectors, pagination]
dependency_graph:
  requires:
    - 171-01 (collector_event_pages.json + extended collectors.json)
    - 171-02 (Eleventy templates + _data/collectors.js loader)
  provides:
    - 171-HUMAN-UAT.md (operator UAT checklist, 6 scenarios)
    - Full-suite + build-mode regression evidence for STREAM-01/02/03
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/phases/171-per-collector-event-stream/171-HUMAN-UAT.md
  modified: []
decisions:
  - "Verified that <script> tags in generated HTML are exclusively the site-wide bee-header from default.njk layout (expected); event feed templates contain no script tags -- JS-free invariant holds"
  - "acfranz chosen for re-ID arc scenario (re-identified Heriades genus on 2025-10-06 + current Heriades carinata on same date); swisschick (14,754 events, 148 pages) chosen for high-volume pagination scenario"
  - "Awaiting-ID scenario routed to mylodon page 9 (only collector with pending events in committed data)"
metrics:
  duration: "8m"
  completed_date: "2026-06-27"
  tasks_completed: 1
  files_changed: 1
requirements: [STREAM-01, STREAM-02, STREAM-03]
---

# Phase 171 Plan 03: Verification + Human-UAT Closeout Summary

Full-suite regression (both languages) + clean-checkout build-mode sub-page generation check, plus operator UAT checklist for the per-collector event feed.

## What Was Built

**`171-HUMAN-UAT.md`** — Operator checklist covering 6 scenarios with concrete collector logins, page URLs, and per-item pass/fail criteria derived from 171-UI-SPEC.md:

1. HIGH-VOLUME (swisschick, 14,754 events, 148 pages) — pagination main page → page 2 → last page
2. SMALL (avajasman, 2 events) — single page, no pagination nav
3. SAMPLE-HOST-ONLY (apascal, 0 events) — empty state "No specimen events recorded yet."
4. ROW CORRECTNESS (acfranz, 350 events) — re-ID arc, determiner names, undetermined plain text, species/genus links
5. AWAITING-ID (mylodon page 9) — waba_specimen "awaiting ID" annotation, no link, no determiner
6. MOBILE WIDTH — row wrapping, tap targets, no overflow

## Automated Verification Results (Task 1)

### Test Suites

| Suite | Command | Result |
|-------|---------|--------|
| Frontend | `npm test` | **889 passed** |
| Data | `cd data && uv run pytest -m "not integration"` | **256 passed, 9 skipped** |

### Artifact Status

| Check | Result |
|-------|--------|
| `git check-ignore public/data/collector_event_pages.json` | exits 1 (not ignored — allowlist works) |
| `git status public/data/collector_event_pages.json` | clean (committed) |
| `git status public/data/collectors.json` | clean (committed) |
| `collector_event_pages.json` byte size | **19,124,459 bytes (~19 MB)** |
| Collectors with sub-pages (total_event_pages > 1) | **70 collectors** |
| Max page count | **148 pages** (swisschick) |

### Build-Mode Sub-Page Generation

Ran `npx @11ty/eleventy` (build mode, sets `ELEVENTY_RUN_MODE='build'` automatically):

| Check | Result |
|-------|--------|
| Eleventy build exit | 0 (2174 files written in 9.3s) |
| `_site/collectors/swisschick/page/2/index.html` exists | YES |
| `event-row` count in that file | **100** (chunk size = 100) |
| `<script` in event feed templates (`collector-detail.njk`, `collector-events-page.njk`) | **0** |
| `<script` in generated `_site/collectors/swisschick/page/2/index.html` | **2** — both are site-wide `bee-header` scripts from `default.njk` layout (expected); NOT from the event feed |
| Last page (`/page/148/`) omits "Older events →" link | YES |
| Page 2 nav: "← Newer events" to `/collectors/swisschick/`, "Page 2 of 148", "Older events →" to `/page/3/` | YES |
| Empty state on `apascal` (`total_event_count == 0`) | "No specimen events recorded yet." |
| Re-ID arc in `acfranz` HTML | `event-type--reidentified` class present; `href="/species/Heriades/"` genus link present |
| Determiner "by Karen W. Wright" rendered | YES |

### CI Clean-Checkout Gate

`collector_event_pages.json` and `collectors.json` are COMMITTED artifacts (not generated at
deploy time from S3). The `deploy.yml` Eleventy build runs on a clean checkout reading these
committed files directly. The CI path is:

```
git checkout → npm ci → npx @11ty/eleventy
                         └─ _data/collectors.js (ELEVENTY_RUN_MODE='build' fires)
                             └─ reads committed collector_event_pages.json (~19 MB)
                                 └─ generates /collectors/{login}/page/N/ routes
```

Unlike the Phase 167/168/170 dbt-contract phases, no `SKIP_INTEGRATION_GATE` nightly is
required for collector pages to ship. CI is the clean-checkout gate and it is already satisfied.

## Deviations from Plan

None — plan executed exactly as written (T1 automated, T2 UAT checklist written and committed; plan returns at blocking human-verify checkpoint).

## Known Stubs

None. All event feed data flows from committed `collectors.json` (first_page_events) and `collector_event_pages.json`. No hardcoded placeholders in the generated HTML.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns. The T-171-01 XSS mitigation (Nunjucks auto-escaping) is confirmed end-to-end: the built `_site/collectors/acfranz/index.html` shows determiner names and species names rendered as escaped text content (Karen W. Wright, Heriades carinata), not as raw HTML. The `| safe` count in both templates is 0 (confirmed by Plan 02 grep assertion).

## Self-Check: PASSED

Files exist:
- `.planning/phases/171-per-collector-event-stream/171-HUMAN-UAT.md` ✓

Commits exist:
- 52ad90b1: chore(171-03): add operator UAT checklist for event feed ✓

---

## Operator UAT Revision (2026-06-27)

Two fixes applied after operator UAT; phase returned to UAT gate for re-verification.

### Fix 1: Catalog number + Ecdysis occurrence link (D-CARD-03 reversal)

**Operator request:** Each event row should display the specimen's catalog number linked to its Ecdysis
occurrence page, reversing the earlier D-CARD-03 "no specimen link" exclusion.

**Changes:**
- `data/collectors_events_export.py`: Added `catalog_number` to `collector_specimens` CTE and both event
  arms in `_QUERY`. Added `catalog_number` and `ecdysis_id` to the event output dict (ecdysis_id was
  previously dropped as `_ecdysis_id`).
- `_pages/collector-detail.njk` + `_pages/collector-events-page.njk`: Added `<span class="event-catalog">
  <a href="https://ecdysis.org/collections/individual/index.php?occid={{ event.ecdysis_id }}">
  {{ event.catalog_number }}</a></span>` at end of each event row. Renders only when `event.ecdysis_id`
  is set; waba_specimen rows (no ecdysis_id) emit no catalog cell.
- `src/styles/places.css`: Added `.event-catalog` rule (0.85rem, flex:0 0 auto, nowrap).
- Auto-escaping: catalog_number rendered via `{{ }}` without `| safe`; ecdysis_id (integer) safe in href.

### Fix 2: Corrected Identified/Re-identified label semantics

**Operator request:** Label should reflect chronological order (first determination = "Identified"), not
`is_current` status. Previous logic was backwards: it labeled the superseded determination "Re-identified".

**New rule:** Within each specimen, the determination with the earliest `modified` timestamp gets
`is_reidentification=False` (label "Identified"); all subsequent determinations get `is_reidentification=True`
(label "Re-identified"). `is_current` drives color emphasis only (green = current, muted = superseded).

**Changes:**
- `data/collectors_events_export.py`: Added two-pass processing — Pass 1 computes
  `earliest_id_ts: dict[(login, ecdysis_id), sort_ts]` for all Identified events; Pass 2 sets
  `is_reidentification` per event by comparing `sort_ts` to the per-specimen minimum.
- `_pages/collector-detail.njk` + `_pages/collector-events-page.njk`: Collapsed the 3-branch Identified
  template logic to a single branch using `{%- set id_type_class = 'event-type--identified' if event.is_current
  else 'event-type--reidentified' -%}` for color and `{%- set id_label = 'Re-identified' if
  event.is_reidentification else 'Identified' -%}` for label.
- `171-CONTEXT.md`: Documented revised D-CARD-03 and added chronological-label decision record.
- `171-UI-SPEC.md`: Updated event-row HTML examples, event-type-label table, and copywriting contract.
- `171-HUMAN-UAT.md`: Updated Scenario 4a with corrected expected labels; updated Decisions Verified table.

### Artifacts Regenerated

Re-ran `uv run python data/collectors_events_export.py` against committed `public/data/occurrences.parquet`
(already on Phase-170 schema with `catalog_number` + `record_type`).

| Artifact | Size | Notes |
|----------|------|-------|
| `public/data/collectors.json` | 3.4 MB | +1 MB from three new fields per event |
| `public/data/collector_event_pages.json` | 28.2 MB | +9 MB from three new fields per event |

### Test Results

| Suite | Result |
|-------|--------|
| `cd data && uv run pytest -m "not integration"` | **258 passed, 9 skipped** (+2 new tests) |
| `npm test` | **889 passed** (artifact shape assertions updated) |
| Production build (`npx @11ty/eleventy`) | 2174 files written, exit 0 |

**Spot-checks (build):**
- Catalogued event rows link to `ecdysis.org/...?occid=` with WSDA_* catalog numbers
- Pending waba_specimen rows have no catalog cell (empty correctly)
- `grep -c '| safe' _pages/collector-detail.njk _pages/collector-events-page.njk` → 0 / 0
- `grep -c '<script' _pages/collector-detail.njk _pages/collector-events-page.njk` → 0 / 0

**New Python tests added:**
- `test_catalog_number_and_ecdysis_id_fields`: asserts catalog_number/ecdysis_id on ecdysis events,
  null values on waba_specimen pending events
- `test_is_reidentification_chronological_label`: asserts is_reidentification=False on earliest
  determination (2024-01-15), True on later (2024-06-01); asserts is_reidentification=None on Collected

**Commits:**
- 5ce46292: fix(171): catalog number + corrected Identified/Re-identified label semantics
- 9c73ed0c: chore(171): regenerate event artifacts with catalog_number + is_reidentification

**Status:** Returned to UAT gate — do NOT mark phase verified until operator re-UAT passes.
