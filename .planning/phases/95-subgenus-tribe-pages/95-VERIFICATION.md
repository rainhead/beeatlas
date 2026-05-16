---
phase: 95-subgenus-tribe-pages
verified: 2026-05-15T22:05:00Z
status: passed
score: 8/8
overrides_applied: 0
---

# Phase 95: Subgenus & Tribe Pages — Verification Report

**Phase Goal:** Users can navigate to dedicated static pages for subgenera and tribes with multi-color occurrence maps
**Verified:** 2026-05-15T22:05:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Visiting `/species/Andrena/Melandrena/` shows the subgenus page listing species with specimen counts and the multi-color subgenus SVG map | VERIFIED | `_site/species/Andrena/Melandrena/index.html` exists; contains `<em>Melandrena</em>`, `class="species-list"`, `/data/species-maps/subgenus/Andrena/Melandrena.svg`; 8 swatch-decorated species entries present |
| 2 | Visiting `/species/tribe/Andrenini/` shows the tribe page listing all genera in the tribe and the multi-color tribe SVG map | VERIFIED | `_site/species/tribe/Andrenini/index.html` exists; contains `<h1>Andrenini</h1>` (no `<em>`), `class="species-list"`, `/data/species-maps/tribe/Andrenini.svg`; genera listed with occurrence counts |
| 3 | Each genus entry on the tribe page links to its genus page | VERIFIED | `href="/species/Andrena/"` present in Andrenini page; template uses `href="/species/{{ g.genus }}/"` |
| 4 | Each species entry on the subgenus page links to its individual species page | VERIFIED | `href="/species/Andrena/commoda/"` present in Melandrena page; template uses `href="/species/{{ sp.slug }}/"` |

**Score:** 4/4 ROADMAP truths verified

### Must-Have Truths (Plan Frontmatter — Plans 95-01 and 95-02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Visiting `/species/Andrena/Melandrena/` returns a static HTML page after build | VERIFIED | `_site/species/Andrena/Melandrena/index.html` confirmed on disk; build-output test passes |
| 2 | The subgenus page lists species with per-species color swatches and occurrence counts | VERIFIED | 8 `class="swatch"` elements in built Melandrena page; each has `background:` color |
| 3 | The subgenus page embeds the multi-color subgenus SVG occurrence map | VERIFIED | `/data/species-maps/subgenus/Andrena/Melandrena.svg` present in built HTML |
| 4 | Each species entry on the subgenus page links to `/species/{Genus}/{specificEpithet}/` | VERIFIED | `href="/species/Andrena/commoda/"` confirmed; template uses `sp.slug` |
| 5 | Subgenus species swatch hex colors match the same species' fill in the subgenus SVG | VERIFIED | Color index parity test passes: first resolved Melandrena species hexColor is `#d92626` matching Python `_group_colors` formula; unit test pins this invariant |
| 6 | Visiting `/species/tribe/Andrenini/` returns a static HTML page after build | VERIFIED | `_site/species/tribe/Andrenini/index.html` confirmed on disk; build-output test passes |
| 7 | The tribe page lists genera in the tribe with each genus's total occurrence count | VERIFIED | Built Andrenini page contains `class="species-list"` with `<em>Andrena</em>` and count spans; `href="/species/Andrena/"` present |
| 8 | The tribe page embeds the multi-color tribe SVG occurrence map | VERIFIED | `/data/species-maps/tribe/Andrenini.svg` present in built HTML |
| 9 | Each genus entry on the tribe page links to `/species/{Genus}/` | VERIFIED | `href="/species/Andrena/"` in built HTML; template uses `/species/{{ g.genus }}/` |
| 10 | Ammobatini does NOT have a tribe page emitted (zero-occurrence filter) | VERIFIED | `_site/species/tribe/Ammobatini/` does not exist; `tribeList` filter confirmed in code; build-output test asserts |

**Score:** 10/10 plan must-have truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `_data/species.js` | `subgenusList` default-export key | VERIFIED | Present; substantive 50-line implementation; terminal `.filter(g => g.totalOccurrences > 0)` |
| `_data/species.js` | `tribeList` default-export key | VERIFIED | Present; substantive 32-line implementation; terminal `.filter(t => t.totalOccurrences > 0)` |
| `_pages/subgenus.njk` | Eleventy template paginating species.subgenusList | VERIFIED | 35 lines; non-stub; full front matter + breadcrumb + h1 + SVG + species list + script |
| `_pages/tribe.njk` | Eleventy template paginating species.tribeList | VERIFIED | 32 lines; non-stub; full front matter + breadcrumb + h1 (no em) + SVG + genera list + script |
| `_site/species/Andrena/Melandrena/index.html` | Built subgenus page | VERIFIED | Exists post-build; 103 total subgenus pages emitted |
| `_site/species/tribe/Andrenini/index.html` | Built tribe page | VERIFIED | Exists post-build; 19 total tribe pages emitted |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_pages/subgenus.njk` | `species.subgenusList` | Eleventy pagination front matter | VERIFIED | `grep "data: species.subgenusList"` returns 1 |
| `_pages/subgenus.njk` | `/data/species-maps/subgenus/{Genus}/{Subgenus}.svg` | `<img>` src attribute | VERIFIED | Pattern `/data/species-maps/subgenus/` present in template |
| `subgenusList[i].species[j]` | `/species/{Genus}/{specificEpithet}/` | `<a href>` using `sp.slug` | VERIFIED | Template uses `href="/species/{{ sp.slug }}/"` |
| `_pages/tribe.njk` | `species.tribeList` | Eleventy pagination front matter | VERIFIED | `grep "data: species.tribeList"` returns 1 |
| `_pages/tribe.njk` | `/data/species-maps/tribe/{TribeName}.svg` | `<img>` src attribute | VERIFIED | Pattern `/data/species-maps/tribe/` present in template |
| `tribeList[i].genera[j]` | `/species/{Genus}/` | `<a href>` using `g.genus` | VERIFIED | Template uses `href="/species/{{ g.genus }}/"` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `_pages/subgenus.njk` | `subgenus.species` | `_data/species.js` → `subgenusList` → `species.json` | Yes — reads real `public/data/species.json`; 103 groups computed; 8 species in Melandrena | FLOWING |
| `_pages/tribe.njk` | `tribe.genera` | `_data/species.js` → `tribeList` → `species.json` | Yes — reads real `public/data/species.json`; 19 tribes computed; Ammobatini excluded by filter | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| data-species unit tests (22 tests) | `VITEST_SKIP_BUILD=1 npm test -- data-species` | 22 passed, 0 failed | PASS |
| build-output tests including subgenus + tribe assertions (20 tests) | `npm test -- build-output` | 20 passed, 0 failed | PASS |
| 103 subgenus pages emitted | `find _site/species -mindepth 3 -maxdepth 3 -name index.html | grep -c "/[A-Z][a-z]*/[A-Z][a-z]*/index.html"` | 103 | PASS |
| 19 tribe pages emitted | `find _site/species/tribe -mindepth 2 -maxdepth 2 -name index.html | wc -l` | 19 | PASS |
| Ammobatini page absent | `test ! -d _site/species/tribe/Ammobatini` | exit 0 | PASS |

### Probe Execution

Step 7c: SKIPPED — no probe-*.sh files declared or conventionally present for this phase (SSG-only; tests serve as the verification surface).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| URL-03 | 95-01 | Each subgenus has a dedicated page at `/species/{Genus}/{Subgenus}/` | SATISFIED | 103 subgenus pages emitted at capitalized paths; Melandrena page verified on disk |
| URL-04 | 95-02 | Each tribe has a dedicated page at `/species/tribe/{TribeName}/` | SATISFIED | 19 tribe pages emitted; Andrenini page verified on disk |
| SUBG-01 | 95-01 | Subgenus page lists species with specimen counts | SATISFIED | Built Melandrena page contains `class="species-list"` with 8 species entries each with occurrence counts |
| SUBG-02 | 95-01 | Subgenus page displays a multi-color static SVG occurrence map | SATISFIED | `<img loading="lazy" src="/data/species-maps/subgenus/Andrena/Melandrena.svg"` in built HTML |
| SUBG-03 | 95-01 | Each species entry links to its individual species page | SATISFIED | `href="/species/Andrena/commoda/"` confirmed; breadcrumb genus link `<a href="/species/Andrena/">Andrena</a>` also present |
| TRIBE-01 | 95-02 | Tribe page lists all genera belonging to that tribe | SATISFIED | Built Andrenini page contains `class="species-list"` with genus entries |
| TRIBE-02 | 95-02 | Tribe page displays a multi-color static SVG occurrence map | SATISFIED | `<img loading="lazy" src="/data/species-maps/tribe/Andrenini.svg"` in built HTML |
| TRIBE-03 | 95-02 | Each genus entry links to its genus page | SATISFIED | `href="/species/Andrena/"` confirmed in built HTML |

All 8 declared requirement IDs satisfied. No orphaned requirements found for Phase 95 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No `TBD`, `FIXME`, `XXX`, `TODO`, `PLACEHOLDER`, or `return null/[]/{}` patterns found in any modified file. No new `.css` files introduced under `src/styles/`. Exactly one `function hslToHex` definition in `_data/species.js`. Exactly zero named exports (only `export default`).

### Human Verification Required

None. All truths are verifiable programmatically via build output inspection and test suite execution. Visual rendering quality (SVG map color accuracy, swatch color rendering in browser) is inherently subjective but the color-index parity is mechanically verified by the unit test pinning `#d92626` for the first Melandrena species.

### Gaps Summary

No gaps. All ROADMAP success criteria, plan must-haves, artifacts, key links, and declared requirements are VERIFIED.

---

_Verified: 2026-05-15T22:05:00Z_
_Verifier: Claude (gsd-verifier)_
