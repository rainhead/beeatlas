---
phase: 120-species-page-source-counts-photo-list
verified: 2026-05-26T19:00:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 120: Species Page Source Counts & Photo List — Verification Report

**Phase Goal:** Species and higher-taxon pages display source-aware occurrence counts; per-species CC-licensed iNat photo list written to photos.json and uploaded to S3.
**Verified:** 2026-05-26T19:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Species-detail pages show "N specimens · N community observations" replacing "N records" | VERIFIED | `_site/species/Andrena/milwaukeensis/index.html` line 29: `2 specimens · 7 community observations · 5 counties · 3 ecoregions` |
| 2 | Genus and subgenus pages show source-aware breakdown in occurrence_count > 0 branch; checklist-only and zero branches unchanged | VERIFIED | `_site/species/Andrena/Andrena/index.html`: 12 `specimens ·` spans + multiple `checklist records` spans; template branches at lines 27-33 of genus.njk and subgenus.njk verified unchanged |
| 3 | Tribe pages show "N specimens · N community observations" per genus entry | VERIFIED | `_site/species/tribe/Andrenini/index.html` line 30: `3589 specimens · 4358 community observations` |
| 4 | Atlas link reads "View N records on the atlas" where N = occurrence_count + inat_obs_count | VERIFIED | Built page shows `View 9 records on the atlas` (2 + 7 = 9 matches); test regex updated from `occurrences` to `records` in `src/tests/build-output.test.ts:91` |
| 5 | tribeList genus objects expose specimen_count and inat_obs_count | VERIFIED | `_data/species.js` lines 237-242: generaMap initialized as `{ occurrence_count: 0, specimen_count: 0, inat_obs_count: 0 }`, incremented, spread into genus entries via `.map(([genus, counts]) => ({ genus, ...counts }))` |
| 6 | Synthetic "Genus sp." / "Subgenus sp." entries carry specimen_count and inat_obs_count | VERIFIED | `_data/species.js` lines 139-143 and 203-207: unresolvedSpecimenCount / unresolvedInatObsCount computed and pushed into sp. entry |
| 7 | species_export.py writes photos.json with CC-licensed photos keyed by canonical_name, sort_keys=True, indent=2 | VERIFIED | Lines 243-270 of species_export.py: SQL query filters `license IS NOT NULL AND license != 'all rights reserved' AND image_url IS NOT NULL`; writes `json.dumps(photos, sort_keys=True, indent=2)` |
| 8 | nightly.sh uploads photos.json via _upload_hashed as photos_name and records "photos" key in manifest | VERIFIED | Line 158: `photos_name=$(_upload_hashed "$EXPORT_DIR/photos.json" "photos")`; line 170: `"photos": "$photos_name",` before `"generated_at"` at line 171 |
| 9 | Graceful fallback when inat_obs_data.observations unavailable (test contexts) | VERIFIED | try/except in species_export.py lines 251-264 writes empty dict and prints warning; `uv run pytest tests/test_species_export.py -x` (3 tests) passes |

**Score:** 9/9 truths verified

### Design Decision Note: photos.json vs species.json embedding

ROADMAP.md success criterion #3 and REQUIREMENTS.md SPE-03 reference "species.json includes an inat_obs_photos field per species". Decision D-06 in `120-CONTEXT.md` explicitly superseded this: photos go into a separate `photos.json` file rather than embedded in species.json, to avoid bloating species.json with photo URL lists. This decision was made before planning and is reflected in both plan files. The intent of SPE-03 (per-species CC photo data stored for future carousel use) is fully satisfied by photos.json. This is not a gap — it is an explicit, documented design deviation.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `_pages/species-detail.njk` | Updated metadata line and atlas link | VERIFIED | Line 41: `{{ sp.specimen_count }} specimens · {{ sp.inat_obs_count }} community observations`; line 46: `View {{ sp.occurrence_count + sp.inat_obs_count }} records on the atlas →` |
| `_pages/genus.njk` | Updated per-species count span (occurrence branch) | VERIFIED | Line 28: `{{ sp.specimen_count }} specimens · {{ sp.inat_obs_count }} community observations`; checklist/zero branches unchanged |
| `_pages/subgenus.njk` | Updated per-species count span (occurrence branch) | VERIFIED | Line 29: same pattern; checklist/zero branches unchanged |
| `_pages/tribe.njk` | Updated per-genus count span | VERIFIED | Line 26: `{{ g.specimen_count }} specimens · {{ g.inat_obs_count }} community observations` |
| `_data/species.js` | tribeMap accumulator with specimen_count/inat_obs_count | VERIFIED | Lines 237-250: object initializer, three increment lines, updated filter and map destructure |
| `data/species_export.py` | AGG-06 photos.json write block | VERIFIED | Lines 243-270: query, accumulate, write with sort_keys=True indent=2, print summary |
| `data/nightly.sh` | photos_name upload call and manifest entry | VERIFIED | Lines 158 and 170: upload call after checklist_name; manifest entry before generated_at |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_data/species.js` | `_pages/tribe.njk` | tribeList genus objects via Eleventy data cascade | VERIFIED | `g.specimen_count` pattern present in tribe.njk line 26; tribeList genera spread `...counts` which includes specimen_count |
| `public/data/species.json` | `_pages/species-detail.njk` | Eleventy _data/species.js reads species.json at build time | VERIFIED | species.json has `specimen_count` and `inat_obs_count` fields; built page shows correct values |
| `data/species_export.py` | `public/data/photos.json` | `ASSETS_DIR / 'photos.json'` write in export_species_parquet | VERIFIED | `photos_out = ASSETS_DIR / "photos.json"` at line 265 |
| `data/nightly.sh` | `s3://$BUCKET/data/photos-<hash>.json` | _upload_hashed function | VERIFIED | `_upload_hashed.*photos` pattern present at line 158 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Species-detail built page shows source-aware counts | grep built HTML | "2 specimens · 7 community observations" found | PASS |
| Atlas link sums counts correctly | Built page | `View 9 records on the atlas` (2+7=9) | PASS |
| Genus page checklist-only branches unmodified | grep built HTML | "2 checklist records", "7 checklist records" etc. found | PASS |
| Tribe page shows per-genus source counts | grep built HTML | "3589 specimens · 4358 community observations" | PASS |
| photos.json write block queries inat_obs_data.observations | grep species_export.py | 2 references to `inat_obs_data.observations` | PASS |
| nightly.sh has photos_name upload and manifest | grep nightly.sh | Both `photos_name=$(_upload_hashed` and `"photos": "$photos_name"` found | PASS |
| photos entry appears before generated_at | line numbers in nightly.sh | photos at line 170, generated_at at line 171 | PASS |
| Shell syntax valid | `bash -n data/nightly.sh` | exits 0 (pre-verified) | PASS |
| Python tests pass | `uv run pytest tests/test_species_export.py -x` | 3 tests pass (pre-verified) | PASS |
| Full build passes | `npm run build` | exits 0 (pre-verified) | PASS |
| Full test suite passes | `npm test` | 525 tests pass (pre-verified) | PASS |

### Anti-Patterns Found

No debt markers (TBD/FIXME/XXX), placeholders, or stub patterns found in modified files. The try/except fallback in species_export.py is intentional error handling, not a stub — it writes a valid empty dict and the production code path (when inat_obs_data is populated) executes the real query.

### Human Verification Required

None. All must-haves are verifiable via build output and source inspection. No UI-only behaviors, real-time events, or external service integrations are introduced in this phase (photos.json is data-storage only; no UI consumer exists yet).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SPE-01 | 120-01 | Species-detail pages show source-aware count breakdown | SATISFIED | species-detail.njk line 41; built output confirmed |
| SPE-02 | 120-01 | Genus, subgenus, tribe pages show source-aware breakdown | SATISFIED | All three templates updated; tribeMap extended; built output confirmed |
| SPE-03 | 120-02 | Per-species CC-licensed photo list written (photos.json, not species.json per D-06) | SATISFIED | species_export.py AGG-06 block; nightly.sh wiring; design deviation per D-06 is explicit and documented |

---

_Verified: 2026-05-26T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
