---
phase: 99-place-static-pages
verified: 2026-05-17T21:35:00Z
status: passed
score: 10/10
overrides_applied: 0
deferred:
  - truth: "The deep-link from a place page opens the main map with that place pre-filtered (occurrence dots outside the polygon are ghosted)"
    addressed_in: "Phase 100"
    evidence: "Phase 100 success criteria #4: 'The active place slug is encoded as `place=` in the URL; pasting the URL in a new tab restores the place filter.' The anchor `<a href=\"/?place={slug}\">` is rendered in Phase 99 HTML; the JS handler that acts on the URL param is Phase 100 scope."
---

# Phase 99: Place Static Pages — Verification Report

**Phase Goal:** Users can browse a directory of collecting locations and view detailed information for each place
**Verified:** 2026-05-17T21:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REQUIREMENTS.md PPAGE-01 and PPAGE-02 no longer reference permits | VERIFIED | `grep -E "permit (table|status)" .planning/REQUIREMENTS.md` returns 0 matches in PPAGE-01/02 text; the single remaining match is the pre-existing Out-of-Scope row "Real-time permit status from agency APIs" |
| 2 | ROADMAP.md Phase 99 success criteria 1 and 3 no longer reference permits | VERIFIED | `grep -E "permit (table|status)" .planning/ROADMAP.md` returns 0 matches |
| 3 | REQUIREMENTS.md Out of Scope contains a Permit display row | VERIFIED | `grep -F "Permit display (table or summary)"` returns 1 match: `\| Permit display (table or summary) \| Removed from v3.7 milestone per Phase 99 decision D-01; revisit in v3.8+ when permit tracking resurfaces \|` |
| 4 | `src/tests/data-places.test.ts` exists and contains assertions for `_data/places.js` shape | VERIFIED | File exists; contains `describe('_data/places.js (PPAGE-01, PPAGE-02)')` with 4 tests; imports `_data/places.js` |
| 5 | `src/tests/build-output.test.ts` contains place-page assertions (PPAGE-01 and PPAGE-02) | VERIFIED | `grep -c "(PPAGE-0[12])"` returns 7 |
| 6 | `/places.html` lists all places with name, land owner, and specimen count | VERIFIED | `_site/places.html` contains `Rattlesnake Ledge Recreation Area`, `Washington Department of Natural Resources`, and `class="places-list"` with `<a href="/places/rattlesnake-ledge.html">` |
| 7 | Per-place pages exist at direct-path URLs (no trailing-slash redirect) | VERIFIED | `_site/places/rattlesnake-ledge.html` and `_site/places/tiger-mountain.html` exist as flat files; `_site/places/rattlesnake-ledge/index.html` does NOT exist |
| 8 | Per-place page shows name, owner, specimen count, deep-link anchor | VERIFIED | `_site/places/rattlesnake-ledge.html` contains `<h1>Rattlesnake Ledge Recreation Area</h1>`, `0 specimens · Washington Department of Natural Resources`, `<a href="/?place=rattlesnake-ledge">View occurrences on the atlas →</a>` |
| 9 | Place pages contain no `<script type="module">` tag (D-09) | VERIFIED | Both `_site/places.html` and `_site/places/rattlesnake-ledge.html` return 0 matches for `<script type="module"` |
| 10 | All tests pass (npm test exits 0) | VERIFIED | 395 tests pass across 20 test files |

**Score:** 10/10 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Deep-link opens main map with place pre-filtered (JS side behavior) | Phase 100 | Phase 100 SC #4: "The active place slug is encoded as `place=` in the URL; pasting the URL in a new tab restores the place filter." The HTML anchor `/?place={slug}` is present; the frontend handler is Phase 100 scope. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/REQUIREMENTS.md` | Permits scrubbed from PPAGE-01 and PPAGE-02; Out of Scope row added | VERIFIED | PPAGE-01 reads "name, land owner, and specimen count"; PPAGE-02 reads "name, owner, specimen count, SVG map, deep-link"; Out of Scope row present |
| `.planning/ROADMAP.md` | Phase 99 SC 1 and 3 scrubbed of permits | VERIFIED | SC 1: "name, land owner, and specimen count"; SC 3: "name, land owner, specimen count, the SVG occurrence map, and a link..." |
| `src/tests/data-places.test.ts` | Unit contract for `_data/places.js` shape (4 tests) | VERIFIED | 4 tests: Array check, field type check, length > 0, no-parquet regex |
| `src/tests/build-output.test.ts` | Augmented with 7 place-page build-output assertions | VERIFIED | Comment `// Phase 99 — place page tests (PPAGE-01, PPAGE-02)` present; 7 tagged assertions confirmed |
| `_data/places.js` | Exposes `{ placesArray }` from `public/data/places.json`, no parquet | VERIFIED | `export default { placesArray }` present; `grep -ciE "parquet"` returns 0; reads `places.json` via `readFileSync` |
| `_pages/places.njk` | Index template at `/places.html`, no script tag | VERIFIED | `permalink: /places.html`; iterates `places.placesArray`; `layout: base.njk`; no `<script>` |
| `_pages/place-detail.njk` | Per-place template with pagination, SVG guard, deep-link | VERIFIED | `pagination.data: places.placesArray`; `size: 1`; `permalink: "/places/{{ place.slug }}.html"`; SVG guarded by `specimen_count > 0`; deep-link present |
| `src/styles/places.css` | CSS for both place pages, Vite-processed to hashed asset | VERIFIED | File exists; Vite emits `_site/assets/places-LerndRWX.css`; both pages reference the hashed URL |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `_data/places.js` | `public/data/places.json` | `readFileSync(join(repoRoot, 'public/data/places.json'))` | WIRED | Line 18: synchronous JSON parse at build time |
| `_pages/places.njk` | `_data/places.js` | Nunjucks `places.placesArray` global | WIRED | `{%- for place in places.placesArray -%}` present |
| `_pages/place-detail.njk` | `_data/places.js` | Eleventy pagination `data: places.placesArray` | WIRED | Front-matter `data: places.placesArray` confirmed |
| `_pages/place-detail.njk` | `public/data/place-maps/{slug}.svg` | `<img src="/data/place-maps/{{ place.slug }}.svg">` guarded by `specimen_count > 0` | WIRED | Guard present; no `<img>` rendered with seed `specimen_count=0` |
| `_pages/places.njk` | `src/styles/places.css` | `<link rel="stylesheet" href="/src/styles/places.css">` | WIRED | Vite MPA rewrites to `/assets/places-LerndRWX.css` in built output |
| `_pages/place-detail.njk` | `src/styles/places.css` | `<link rel="stylesheet" href="/src/styles/places.css">` | WIRED | Vite MPA rewrites to `/assets/places-LerndRWX.css` in built output |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `_pages/places.njk` | `places.placesArray` | `_data/places.js` reads `public/data/places.json` (2 entries) | Yes — real JSON from disk, not empty array | FLOWING |
| `_pages/place-detail.njk` | `place` (paginated from `placesArray`) | Same JSON source | Yes — 2 pages generated (rattlesnake-ledge, tiger-mountain) | FLOWING |
| `_site/places.html` | Name, owner, count rendered in `<ul class="places-list">` | JSON source | Yes — `Rattlesnake Ledge Recreation Area`, `Washington Department of Natural Resources` verified in built HTML | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `_site/places.html` exists and has places-list | `ls _site/places.html && grep -F 'class="places-list"' _site/places.html` | Found | PASS |
| Direct-path URL: no index.html variant | `ls _site/places/rattlesnake-ledge/index.html` | No such file (exit 1) | PASS |
| No `<script type="module">` in place pages | `grep -c '<script type="module"' _site/places.html _site/places/rattlesnake-ledge.html` | 0, 0 | PASS |
| Deep-link anchor present | `grep -F 'href="/?place=rattlesnake-ledge"' _site/places/rattlesnake-ledge.html` | Match found | PASS |
| place-maps absent when specimen_count=0 | `grep -c 'place-maps' _site/places/rattlesnake-ledge.html` | 0 | PASS |
| Vite hashed CSS asset emitted | `ls _site/assets/places-*.css` | `places-LerndRWX.css` | PASS |
| npm test exits 0 | `npm test` | 395 passed, 0 failed | PASS |

### Probe Execution

Step 7c: SKIPPED — no probe-*.sh files declared or found for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PPAGE-01 | 99-01, 99-02 | `/places.html` lists all places with name, land owner, and specimen count | SATISFIED | `_site/places.html` renders both places with correct data fields |
| PPAGE-02 | 99-01, 99-02 | Per-place page at direct-path URL shows name, owner, specimen count, SVG map, deep-link | SATISFIED | `_site/places/rattlesnake-ledge.html` and `tiger-mountain.html` pass all assertions; SVG guard correct |

### Anti-Patterns Found

No anti-patterns found. Scanned `_data/places.js`, `_pages/places.njk`, `_pages/place-detail.njk`, `src/styles/places.css` — zero TBD/FIXME/XXX/TODO/HACK markers; no placeholder returns; no empty implementations.

Notable observation: `_pages/place-detail.njk` uses `layout: base.njk` instead of `default.njk` as originally specified in the plan. This was a correct auto-fix: `default.njk` injects `<script type="module" src="/src/entries/bee-header.ts">` which would fail the D-09 no-script-module assertion. The deviation is documented in 99-02-SUMMARY.md and produces correct, tested behavior.

### Human Verification Required

None. All success criteria are verifiable programmatically. The deep-link JavaScript activation (SC #4 — "occurrence dots outside the polygon are ghosted") is deferred to Phase 100 per the roadmap and is not a Phase 99 deliverable.

### Gaps Summary

No gaps. All 10 truths verified. The deep-link anchor `/?place={slug}` is present in the rendered HTML (Phase 99 deliverable); the frontend filter logic that acts on the URL param is explicitly Phase 100 scope.

---

_Verified: 2026-05-17T21:35:00Z_
_Verifier: Claude (gsd-verifier)_
