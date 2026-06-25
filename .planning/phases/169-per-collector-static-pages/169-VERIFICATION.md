---
phase: 169-per-collector-static-pages
verified: 2026-06-25T22:30:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open /collectors/acfranz/ in a browser and click 'View on the atlas →'"
    expected: "Map filters to Anna Franz's occurrences only; filter chip shows her name"
    why_human: "Cannot verify that url-state.ts parseParams correctly restores the collector filter from a live browser; ECONNREFUSED prevents automated curl checks against localhost"
  - test: "Open /collectors/apascal/ in a browser"
    expected: "Page shows '@apascal', 0 specimens, 1 sample, 0 species; no status split section; 'View on the atlas →' deep-link is present with ?collectors=:apascal"
    why_human: "Sample-host-only collector with @login fallback and denominator=0 — verify both the hidden status split and that the map link loads correctly"
  - test: "Open /collectors.html in a browser"
    expected: "Index page lists all 124 collectors with display names and specimen counts, each linked to their detail page"
    why_human: "Visual roster layout and link correctness cannot be verified programmatically"
---

# Phase 169: Per-Collector Static Pages Verification Report

**Phase Goal:** Every active WABA collector has a bookmarkable, public page at `/collectors/{inat_login}/` with headline stats, a status split, and a map deep-link.
**Verified:** 2026-06-25T22:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bookmarkable pages exist at `/collectors/{login}/` for every gated collector | ✓ VERIFIED | `_site/collectors/` contains 124 directories, matching the 124-record `collectors.json`; build succeeds with 1093 files written |
| 2 | Each page shows H1 display_name (human name or @login fallback) and headline stats | ✓ VERIFIED | `/collectors/acfranz/index.html` shows `<h1>Anna Franz</h1>` and `131 specimens · 7 samples · 22 species`; 3 @-fallback collectors all have `recordedBy=null` (correct) |
| 3 | Each page shows pending-vs-identified split (N identified, N awaiting ID), hidden when denominator=0 | ✓ VERIFIED | acfranz: `67 identified to species, 65 awaiting ID`; apascal (sample-host-only, denominator=0): status split absent from HTML; `{%- if collector.status_denominator > 0 -%}` guard confirmed in template |
| 4 | Each page deep-links to the map via existing `?collectors=<recordedBy>:<host_inat_login>` param (D-10) | ✓ VERIFIED | acfranz: `/?collectors=Anna%20Franz:acfranz`; apascal: `/?collectors=:apascal`; CR-02 guard prevents both-null empty links; no new FilterState field added |
| 5 | An index roster at `/collectors.html` lists every generated collector | ✓ VERIFIED | `_site/collectors.html` exists; lists human display names (e.g. "Aidan Hersh", "Anna Franz") with specimen counts and links to `/collectors/{login}/` |
| 6 | `npm test` asserts collectors.json >= 100 records with required fields and split invariant (D-09) | ✓ VERIFIED | `npm test` 870/870 passed; `data-collectors.test.ts` 5/5 pass (array shape, length >= 100, field types, split invariant, no-parquet) |

**Score:** 6/6 truths verified

### Deferred Items

No deferred items — all must-haves for this phase are satisfied.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/collectors_export.py` | Per-collector stats export step | ✓ VERIFIED | Contains `def export_collectors_step(` and `def export_collectors(`; CR-01 fix applied: `COALESCE(MIN(o.recordedBy), '@' || MIN(o.collector_inat_login))` |
| `data/tests/test_collectors_export.py` | Golden-fixture pytest (6 tests) | ✓ VERIFIED | 6 tests; 6/6 PASSED; includes CR-01 regression `test_mixed_null_recordedby_keeps_real_name` |
| `public/data/collectors.json` | Committed JSON array >= 100 records | ✓ VERIFIED | 124 records; all fields present; split invariant holds for all records; tracked (not gitignored) |
| `data/run.py` | STEPS: collectors-export after places-export | ✓ VERIFIED | Line 127: `("collectors-export", export_collectors_step)` immediately after line 126 `("places-export", export_places_step)` |
| `_data/collectors.js` | Eleventy loader exposing collectorsArray | ✓ VERIFIED | Reads `public/data/collectors.json`; exports `{ collectorsArray }`; no parquet reference |
| `_pages/collector-detail.njk` | Per-collector detail page with deep-link | ✓ VERIFIED | Pagination `data: collectors.collectorsArray`, `size: 1`; H1 = `{{ collector.display_name }}`; quantify for specimen/sample/species; status split guarded; deep-link with urlencode on both halves; CR-02 guard present |
| `_pages/collectors.njk` | Collector index roster at /collectors.html | ✓ VERIFIED | permalink `/collectors.html`; loops `collectors.collectorsArray`; each `<li>` links to `/collectors/{{ collector.login | urlencode }}/` |
| `src/tests/data-collectors.test.ts` | Vitest floor + shape + split-invariant + no-parquet | ✓ VERIFIED | 5 assertions; 5/5 PASSED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/run.py` | `data/collectors_export.py` | `from collectors_export import export_collectors_step` + STEPS entry | ✓ WIRED | Line 48 import; line 127 STEPS entry |
| `data/collectors_export.py` | `public/data/occurrences.parquet` + `public/data/species.parquet` | `read_parquet` over `ASSETS_DIR` | ✓ WIRED | Lines 65-66: `read_parquet(?)` with both parquet paths as params |
| `_pages/collector-detail.njk` | `_data/collectors.js` | `pagination data: collectors.collectorsArray` | ✓ WIRED | Front-matter line 3: `data: collectors.collectorsArray` |
| `_pages/collector-detail.njk` | `src/url-state.ts collectors= param` | `?collectors=<recordedBy>:<host_inat_login>` deep-link | ✓ WIRED | Template line 22; url-state.ts line 177 decodes `p.get('collectors')` |
| `_data/collectors.js` | `public/data/collectors.json` | `readFileSync` (JSON only, never parquet) | ✓ WIRED | Line 20: `readFileSync(join(repoRoot, 'public/data/collectors.json'))` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `_pages/collector-detail.njk` | `collector` (from pagination) | `_data/collectors.js` → `public/data/collectors.json` → DuckDB aggregation over `occurrences.parquet` + `species.parquet` | Yes — 124 records with live counts | ✓ FLOWING |
| `_pages/collectors.njk` | `collectors.collectorsArray` | Same chain | Yes — 124 records | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| collectors.json is array of >= 100 records with invariant | `node -e "..."` (full invariant check) | `collectors.json OK n=124` | ✓ PASS |
| npm test passes (D-09 Vitest floor) | `npm test` | `870 passed (870)` | ✓ PASS |
| pytest collectors (6 tests including CR-01 regression) | `cd data && uv run pytest tests/test_collectors_export.py -v` | `6 passed` | ✓ PASS |
| Build produces collectors.html and 124 detail pages | `npm run build && test -f _site/collectors.html && ls _site/collectors/ \| wc -l` | Build OK; 124 directories | ✓ PASS |
| Built page contains ?collectors= deep-link | `grep -rl "collectors=" _site/collectors/ \| head -3` | 3+ pages found | ✓ PASS |
| acfranz page shows human name (CR-01) | Read `_site/collectors/acfranz/index.html` | `<h1>Anna Franz</h1>` (not @acfranz) | ✓ PASS |
| collectors.json tracked (not gitignored) | `git check-ignore public/data/collectors.json; echo $?` | exit code 1 (not ignored) | ✓ PASS |
| .gitignore has negation rule | `grep collectors .gitignore` | `!/public/data/collectors.json` at line 146 | ✓ PASS |

### Probe Execution

No probes declared or conventional probe scripts found for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PAGE-01 | Plans 01 + 02 | Bookmarkable public page at `/collectors/{inat_login}/` | ✓ SATISFIED | 124 pages built at `_site/collectors/{login}/index.html` |
| PAGE-02 | Plans 01 + 02 | Headline stats (specimens, samples, species) | ✓ SATISFIED | `quantify` filter renders e.g. "131 specimens · 7 samples · 22 species" |
| PAGE-03 | Plans 01 + 02 | Pending-vs-identified status split | ✓ SATISFIED | "67 identified to species, 65 awaiting ID"; hidden when denominator=0 |
| PAGE-04 | Plan 02 | Link to main map filtered to that collector | ✓ SATISFIED | `?collectors=Anna%20Franz:acfranz` reuses existing `url-state.ts` param; no new FilterState field |

### Anti-Patterns Found

No debt markers (TODO/FIXME/TBD/XXX/HACK/PLACEHOLDER) found in any of the 6 phase-modified source files.

No stub patterns found. All files are substantive implementations.

**Code Review fixes verified in working tree:**
- CR-01 fix confirmed: `COALESCE(MIN(o.recordedBy), '@' || MIN(o.collector_inat_login))` in `data/collectors_export.py:38`
- CR-02 fix confirmed: `{%- if collector.recordedBy or collector.host_inat_login -%}` guard in `_pages/collector-detail.njk:18`
- CR-01 regression test confirmed: `test_mixed_null_recordedby_keeps_real_name` in `data/tests/test_collectors_export.py:191`
- Commit `7f316e93` is present and accounts for all 4 files changed by the review fixes.

### D-01 Gate (Context Decision) — Not a Gap

ROADMAP criterion 1/5 says "every non-NULL login" (4,858 logins), but D-01 (locked decision in 169-CONTEXT.md) narrows this to collectors with actual specimens or waba_sample rows (~124). The 4,702 casual-observer-only logins are intentionally excluded. This is verified honored: `collectors.json` has 124 records; the D-01 WHERE clause in `collectors_export.py` correctly gates on `ecdysis_id IS NOT NULL OR source IN ('waba_specimen', 'waba_sample')`.

### Human Verification Required

#### 1. Map deep-link applies collector filter correctly

**Test:** Open `/collectors/acfranz/` in a browser and click "View on the atlas →"
**Expected:** Map filters to Anna Franz's occurrences only; a collector filter chip showing "Anna Franz" appears in the filter UI; no other collectors' occurrences are shown
**Why human:** Cannot verify `url-state.ts` collector filter round-trip behavior (parseParams → FilterState → map rendering) without a live browser; `ECONNREFUSED` on localhost:3000 prevents automated curl checks

#### 2. Sample-host-only page renders correctly

**Test:** Open `/collectors/apascal/` in a browser
**Expected:** Page title is "@apascal"; shows "0 specimens · 1 sample · 0 species"; no "identified to species / awaiting ID" paragraph; "View on the atlas →" link is present and clicking it shows map with `?collectors=:apascal` — the map behavior for this case (recordedBy=null, filter on host_inat_login only) should be verified to actually filter correctly
**Why human:** The `?collectors=:apascal` form (empty recordedBy half) requires live browser verification that the filter applied is non-empty and shows apascal's sample occurrence

#### 3. Collectors index page visual layout

**Test:** Open `/collectors.html` in a browser
**Expected:** Index lists all 124 collectors by display name with specimen counts; all links resolve to valid detail pages; alphabetical or pipeline order is consistent
**Why human:** Visual layout and link correctness require browser rendering

---

_Verified: 2026-06-25T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
