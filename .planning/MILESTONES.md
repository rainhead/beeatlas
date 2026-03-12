# Milestones

## v1.3 Specimen-Sample Linkage (Shipped: 2026-03-12)

**Phases completed:** 2 phases, 4 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

---

## v1.2 iNat Pipeline (Shipped: 2026-03-11)

**Phases completed:** 3 phases (Phases 8–10), 5 plans
**Timeline:** 2026-03-10 → 2026-03-11 (2 days)
**Git range:** `feat(08-01)` → `docs(quick-1)`
**LOC:** +5,069/−1,005 lines across 56 files; 244 Python + 51 shell (inat pipeline)

**Key accomplishments:**
1. Confirmed iNat field IDs from live API (SPECIMEN_COUNT_FIELD_ID=8338, SAMPLE_ID_FIELD_ID=9963); documented OFVS in default response — no `fields='all'` needed
2. Wired `id-token: write` + `configure-aws-credentials@v4` into CI build job; confirmed existing IAM role covers `cache/` prefix without new grants
3. S3 cache scripts (`cache_restore.sh` with graceful miss, `cache_upload.sh` with hard fail) + `package.json` npm scripts (cache-restore, fetch-inat, cache-upload)
4. Full `data/inat/download.py` pipeline: pyinaturalist fetch, incremental mode with `merge_delta`, 15 unit tests, wired into `build-data.sh`
5. CI `deploy.yml` fixed (credential ordering bug); S3 cache round-trip verified green end-to-end

**Delivered:** iNat pipeline produces `samples.parquet` (observation_id, observer, date, lat, lon, specimen_count nullable) with S3 caching and full CI integration.

---

## v1.1 URL Sharing (Shipped: 2026-03-10)

**Phases completed:** 1 phase (Phase 7), 5 plans
**Timeline:** ~1 day

**Key accomplishments:**
1. URL query string encoding of map center/zoom and full filter state (taxon, year range, months, selected occurrences)
2. `replaceState` on every `moveend` + debounced `pushState` (500ms) — history explosion avoided while back-button nav works at settled positions
3. `_isRestoringFromHistory` guard + `map.once('moveend')` async reset — prevents popstate→moveend feedback loop
4. Multi-occurrence cluster `o=` encoding — all cluster IDs preserved; sidebar restore correctly shows full cluster
5. URL sharing is fully round-trip: paste URL → exact map view and filter state restored

---

## v1.0 MVP (Shipped: 2026-02-22)

**Phases completed:** 6 phases (Phases 1–6), 13 plans
**Timeline:** 2026-02-18 → 2026-02-22 (4 days)
**Git range:** `feat(pipeline)` → `docs(06-01)`
**LOC:** ~6,172 insertions across 47 files
**Live site:** https://d1o1go591lqnqi.cloudfront.net

**Key accomplishments:**
1. Fixed Ecdysis pipeline end-to-end — `download.py` and `occurrences.py` produce 45,754-row Parquet with all 11 required columns, null coordinates excluded
2. Deployed S3/CloudFront with CDK and OIDC-based GitHub Actions — no stored AWS credentials, auto-deploys on push to main
3. Implemented specimen clustering with recency-aware visual tiers (3 colors) and count-based radius
4. Click-to-detail sidebar showing species, collector, date, and host plant (fieldNumber) for any specimen or cluster
5. Taxon filtering (family/genus/species autocomplete) and year/month date filtering with ghost/match visual feedback
6. Fixed DarwinCore month offset bug — all 12 months correctly reachable in filter checkboxes and sidebar display

**Delivered:** A fully usable static bee atlas — specimen map with clustering, click-detail, taxon/date filters, and automated cloud deployment — live for Washington Bee Atlas volunteer collectors.

### Known Gaps

- **NAV-01**: URL encoding of map view (center, zoom) and filter state not implemented. Phase 7 planned but deferred to v1.1. No `URLSearchParams` or `history.pushState` code exists in the frontend.

---

