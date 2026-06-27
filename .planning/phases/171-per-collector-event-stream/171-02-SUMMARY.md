---
phase: 171-per-collector-event-stream
plan: "02"
subsystem: frontend
tags: [event-feed, collectors, eleventy, pagination, nunjucks, css]
dependency_graph:
  requires:
    - 171-01 (collector_event_pages.json + extended collectors.json with first_page_events)
    - 169-01 (collector-detail.njk base page + _data/collectors.js loader)
    - places.css (design tokens for event-feed CSS)
  provides:
    - /collectors/{login}/ — extended with Collection history feed or empty state
    - /collectors/{login}/page/N/ — static sub-pages via collectorEventPages pagination
    - collectorEventPages loader export in _data/collectors.js (HMR-guarded)
    - Event-feed CSS classes in src/styles/places.css
  affects:
    - _pages/collector-detail.njk (extended with event feed section)
    - _data/collectors.js (new export key)
    - src/styles/places.css (new CSS block appended)
tech_stack:
  added: []
  patterns:
    - Eleventy size:1 2D pagination over pre-chunked flat sub-page descriptors
    - ELEVENTY_RUN_MODE === 'build' guard for large JSON files (HMR fast-path)
    - Nunjucks auto-escaping (no | safe) enforced by scaffold grep assertion
    - Rank-aware taxon links (species_slug non-null + not is_pending → link; else plain text)
key_files:
  created:
    - _pages/collector-events-page.njk
  modified:
    - _data/collectors.js
    - _pages/collector-detail.njk
    - src/styles/places.css
    - src/tests/page-scaffold.test.ts
    - src/tests/data-collectors.test.ts
decisions:
  - "Used ELEVENTY_RUN_MODE === 'build' (not ELEVENTY_ENV) per PLAN.md explicit spec — Eleventy 3.x sets this to serve/watch/build"
  - "Event row markup duplicated inline (not macro) in both templates — kept byte-identical per plan guidance; no extra partial file needed"
  - "Collector-events-page nav always shows prev (no collector has page 1 as a sub-page) and conditionally shows next; page-indicator always shown"
metrics:
  duration: "4m"
  completed_date: "2026-06-27"
  tasks_completed: 2
  files_changed: 5
requirements: [STREAM-01, STREAM-02, STREAM-03]
---

# Phase 171 Plan 02: Event-Feed Templates + Loader Extension Summary

Static Nunjucks/Eleventy event feed on `/collectors/{login}/` showing a reverse-chronological Collected + Identified history, paginated to `/collectors/{login}/page/N/`, with rank-aware species links and HMR-guarded `collectorEventPages` loader export.

## What Was Built

**`_data/collectors.js` (extended):**
- Added `collectorEventPages` property to default export alongside `collectorsArray`
- Guard: `process.env.ELEVENTY_RUN_MODE === 'build'` loads the ~19 MB `collector_event_pages.json` only during `npm run build` / CI; returns `[]` in dev serve, watch, and vitest (Pitfall 6 — HMR stays sub-100ms)
- Updated header comment documenting both exports and the RUN_MODE guard

**`_pages/collector-detail.njk` (extended):**
- Appended "Collection history" `<section class="event-feed-section">` after the atlas-link block
- When `total_event_count > 0`: renders `<ol class="event-feed" reversed>` iterating `first_page_events` with four event-row variants (Collected, Collected+pending, Identified, Re-identified)
- Rank-aware taxon links: `species_slug` set and not `is_pending` → `<a href="/species/{slug}/">`; else plain text
- Determiner: `by {name}` span only when `event.determiner` is truthy
- Awaiting-ID: `<span class="event-pending">awaiting ID</span>` only when `event.is_pending`
- When `total_event_pages > 1`: renders "Older events →" link to page/2/
- When `total_event_count == 0`: empty-state paragraph "No specimen events recorded yet." (D-EMPTY — 16 sample-host-only collectors)

**`_pages/collector-events-page.njk` (new):**
- Paginates `collectors.collectorEventPages` `size: 1`, alias `evpage`
- Permalink: `/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num }}/index.html`
- Full prev/next nav: "← Newer events" → `/collectors/{login}/` (page 2) or `/page/{N-1}/` (page 3+); "Older events →" → `/page/{N+1}/` when `page_num < total_pages`; "Page N of M" page indicator always shown
- Same event row markup as `collector-detail.njk` (byte-identical across all four variants)

**`src/styles/places.css` (appended):**
- Verbatim CSS block from UI-SPEC §"CSS Additions": `.event-feed-section`, `.event-feed`, `.event-feed .event-row`, `.event-date`, `.event-type` (+`--collected`/`--identified`/`--reidentified`), `.event-taxon`, `.event-determiner`, `.event-pending`, `.event-pagination`, `.page-indicator`, `.event-pagination a` + `a:focus-visible`
- No new color literals — all `var(--border)`, `var(--text-muted)`, `var(--accent)`, `var(--text-body)` tokens from `src/index.css`

**Tests added:**
- `src/tests/data-collectors.test.ts`: new loader-contract describe block asserting `Array.isArray(collectors.collectorEventPages)` and no-parquet re-assertion
- `src/tests/page-scaffold.test.ts`: new describe block for `collector-events-page.njk` asserting front-matter (`layout`, pagination data, permalink); `class="event-feed"` in collector-detail.njk; no `<script`; no `| safe`

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns. All Ecdysis/iNat strings (species_name, determiner, species_slug) rendered via Nunjucks default auto-escaping — `| safe` never applied (T-171-01). Static pages; no user input, no client JS.

## Test Gates

- `npm test`: **889 passed** (881 baseline + 8 new) ✓
- `cd data && uv run pytest -m "not integration"`: **256 passed, 9 skipped** ✓
- `grep -rn "| safe" _pages/collector-detail.njk _pages/collector-events-page.njk`: no output ✓
- `grep -rin "<script" _pages/collector-detail.njk _pages/collector-events-page.njk`: no output ✓

## Self-Check: PASSED

Files exist:
- `_pages/collector-events-page.njk` ✓
- `_pages/collector-detail.njk` (extended) ✓
- `_data/collectors.js` (extended) ✓
- `src/styles/places.css` (appended) ✓

Commits exist:
- df53e867: test(171-02): RED loader-contract ✓
- 044955b4: feat(171-02): extend collectors.js loader with collectorEventPages HMR guard ✓
- 3167df7c: feat(171-02): event-feed templates + CSS + scaffold tests ✓
