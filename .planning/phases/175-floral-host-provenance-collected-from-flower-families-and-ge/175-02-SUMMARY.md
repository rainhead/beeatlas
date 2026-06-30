---
phase: 175-floral-host-provenance
plan: "02"
subsystem: frontend-ui
tags: [eleventy-data, nunjucks, css, release-wiring, nightly-sh, deploy-yml]
dependency_graph:
  requires:
    - public/data/species_hosts.json (produced by Phase 175-01 species_export.py)
    - public/data/species.json (canonical_name keyed species rows)
  provides:
    - _data/species_hosts.js (Eleventy build-time loader, absence-tolerant)
    - _pages/species-detail.njk Collected from block (families+genera, sample-count ordered, capped)
    - src/styles/taxon-pages.css .collected-from rule set
    - data/nightly.sh species_hosts hashed-upload + manifest key + LOCAL_NAMES baseline
    - .github/workflows/deploy.yml SPECIES_HOSTS_FILE fetch to public/data/species_hosts.json
  affects:
    - _pages/species-detail.njk (new block in hero-meta after section.traits)
    - src/styles/taxon-pages.css (new .collected-from section)
tech_stack:
  added: []
  patterns:
    - absence-tolerant _data/*.js loader (existsSync guard + JSON.parse try/catch)
    - default-export-only Eleventy 3 _data module (mirrors _data/photos.js pitfall)
    - Nunjucks for-loop caps via loop.index0 < CAP (no slice/map filters)
    - hashed-upload + manifest + deploy-fetch for build-time JSON (mirrors species.json pattern)
key_files:
  created:
    - _data/species_hosts.js
    - src/tests/data-species_hosts.test.ts
  modified:
    - _pages/species-detail.njk (section.collected-from block)
    - src/styles/taxon-pages.css (.collected-from styles)
    - data/nightly.sh (species_hosts _upload_hashed + manifest + LOCAL_NAMES)
    - .github/workflows/deploy.yml (SPECIES_HOSTS_FILE fetch + comment update)
decisions:
  - FAMILY_CAP=6, GENUS_CAP=8 (Claude's discretion per CONTEXT line 82)
  - species_hosts.json keyed by canonical_name (lowercase, matches species.json production)
  - Absence-tolerant loader returns {} on missing file or JSON parse failure (T-175-05)
  - No named exports in _data/species_hosts.js (Eleventy 3 auto-unwrap contract)
  - Nunjucks loop.index0 guards instead of slice/map filters (Nunjucks slice is partition, not range)
metrics:
  duration: "~6 minutes"
  completed: "2026-06-30"
  tasks_completed: 3
  files_changed: 6
---

# Phase 175 Plan 02: Collected from UI + Release Wiring Summary

Surface the floral-host data from Phase 175-01 on the species detail page: absence-tolerant loader, Collected from block, CSS, and hashed-upload/manifest/fetch release wiring.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Absence-tolerant _data/species_hosts.js loader + test | f5a43ae0 | _data/species_hosts.js, src/tests/data-species_hosts.test.ts |
| 2 | Collected from block in species-detail.njk + CSS + render UAT | 77a7e412 | _pages/species-detail.njk, src/styles/taxon-pages.css |
| 3 | Release wiring (nightly.sh + deploy.yml) + clean-checkout CI verification | e726d2c1 | data/nightly.sh, .github/workflows/deploy.yml |

## What Was Built

**`_data/species_hosts.js`** — absence-tolerant Eleventy build-time loader. Reads `public/data/species_hosts.json` via `readFileSync` guarded by `existsSync`. Returns `{}` when the file is absent or JSON fails to parse (T-175-05 mitigation — first code deploy precedes first data run). Default export only; no named exports per Eleventy 3 auto-unwrap contract (mirrors `_data/photos.js` pitfall).

**`src/tests/data-species_hosts.test.ts`** — three Vitest tests: (1) default export is a plain object, (2) module imports without throwing even when JSON is absent (absence tolerance), (3) each entry is an array of `HostFamily` objects with `family` (string), `sample_count` (number), and `genera` array of `{genus, sample_count}`. All 3 pass; existing suite (905 tests) unaffected.

**`_pages/species-detail.njk`** Collected from block — `section.collected-from` inserted in `.hero-meta` after `section.traits`. Guards on `hosts and hosts.length > 0` (same pattern as `hasHostBees`). Iterates families with `loop.index0 < 6` (FAMILY_CAP) and genera with `loop.index0 < 8` (GENUS_CAP) — no `slice`/`map` filters (Nunjucks `slice` is a partition operator, not a range slice). Renders `(+N more families)` when host count exceeds cap. All host names rendered via Nunjucks autoescape; no `dump`/`safe` filter applied (T-175-04 mitigation).

**`src/styles/taxon-pages.css`** `.collected-from` rule set — heading, paragraph, and `.more` muted text, all matching the Phase 174 traits visual language (same font-size/color/spacing conventions as `.traits`/`.traits-heading`).

**`data/nightly.sh`** — `species_hosts_name=$(_upload_hashed "$EXPORT_DIR/species_hosts.json" "species_hosts")` added after `photos_name`; `"species_hosts": "$species_hosts_name"` added to the manifest JSON heredoc; `'species_hosts': 'species_hosts.json'` added to `LOCAL_NAMES` so the nightly integration diff gate covers it.

**`.github/workflows/deploy.yml`** — `SPECIES_HOSTS_FILE=$(jq -r .species_hosts /tmp/manifest.json)` + `aws s3 cp` to `public/data/species_hosts.json` added to the Fetch build-time data step; step comment updated to list `species_hosts.json` as a sixth build-time file.

## Verification

- Loader test: `npx vitest run src/tests/data-species_hosts.test.ts` → 3 passed
- Full suite: `npm test` → 905 passed (34 test files)
- Render UAT: fixture `species_hosts.json` injected (10 families for Bombus mixtus), `npm run build` succeeded, `_site/species/Bombus/mixtus/index.html` contained "Collected from", Asteraceae, Rosaceae, and "(+4 more families)"; fixture removed (never committed)
- Clean-checkout gate: `rm -f public/data/species_hosts.json && npm run build && test -d _site` → PASS
- No file under `data/dbt/models/marts/` modified

## Deviations from Plan

None — plan executed exactly as written.

The Nunjucks CAVEAT in Task 2 was correctly applied: `slice`/`map` filters avoided; caps implemented with `for` loops guarded by `loop.index0 < FAMILY_CAP` / `loop.index0 < GENUS_CAP`.

One whitespace-trim discovery during UAT: the initial template had `· {%- for` which trimmed the space between the middot and the first genus name. Fixed by changing to `· {% for` (removing the leading `-`). This is a standard Nunjucks whitespace-control adjustment, not a deviation.

## Known Stubs

None. The loader returns `{}` when `species_hosts.json` is absent (intentional graceful degradation, not a stub). The block renders when data is present and is omitted entirely otherwise — no placeholder text.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes beyond the plan's `<threat_model>`. T-175-04 (XSS via host names) mitigated by Nunjucks autoescape on all host names (no `safe` filter). T-175-05 (DoS on first deploy) mitigated by absence-tolerant loader. T-175-06 (S3 spoofing) accepted per plan (own bucket via GitHub OIDC, same trust as existing fetches).

## Self-Check

Files exist:
- _data/species_hosts.js: FOUND
- src/tests/data-species_hosts.test.ts: FOUND
- _pages/species-detail.njk: FOUND (modified)
- src/styles/taxon-pages.css: FOUND (modified)
- data/nightly.sh: FOUND (modified)
- .github/workflows/deploy.yml: FOUND (modified)

Commits:
- f5a43ae0 feat(175-02): add absence-tolerant _data/species_hosts.js loader and test
- 77a7e412 feat(175-02): add Collected from block in species-detail.njk and CSS
- e726d2c1 feat(175-02): wire species_hosts.json publish (nightly.sh) and fetch (deploy.yml)

## Self-Check: PASSED
