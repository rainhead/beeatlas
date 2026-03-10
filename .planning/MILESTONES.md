# Milestones

## v1.1 URL Sharing (Shipped: 2026-03-10)

**Phases completed:** 1 phases, 5 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

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

