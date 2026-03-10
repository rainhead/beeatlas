# Washington Bee Atlas

## What This Is

An interactive web map displaying Ecdysis specimen records for volunteer collectors participating in the Washington Bee Atlas. The site is a static frontend (TypeScript, OpenLayers, Lit, hyparquet) that reads Parquet data bundled with the build — no server required at runtime. A Python pipeline fetches DarwinCore exports from Ecdysis and produces the Parquet. Infrastructure is CDK on AWS (S3 + CloudFront), deployed automatically via GitHub Actions OIDC.

## Core Value

Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## Current Milestone: v1.2 iNat Sample Markers

**Goal:** Show live collection events from iNaturalist on the map, giving volunteers a community view of recent collecting activity before specimens arrive in Ecdysis.

**Target features:**
- iNat API pipeline querying Washington Bee Atlas project observations
- Samples Parquet produced alongside specimens Parquet (observer, date, lat/lon, specimen count)
- Sample markers layer on the map, coexisting with existing specimen clusters
- Sample sidebar: who collected, when, specimen count (0 = not yet entered)

## Requirements

### Validated

- ✓ Interactive map renders Ecdysis specimen points using OpenLayers — existing (pre-v1.0)
- ✓ Client-side Parquet reading via hyparquet (no server needed at runtime) — existing (pre-v1.0)
- ✓ PIPE-01: Ecdysis download script runs end-to-end with `--datasetid` parameter — v1.0
- ✓ PIPE-02: Occurrences processor produces valid 45,754-row Parquet without debug artifacts — v1.0
- ✓ PIPE-03: Parquet includes all required columns (scientificName, family, genus, specificEpithet, year, month, recordedBy, fieldNumber) — v1.0
- ✓ INFRA-01: S3 bucket and CloudFront distribution defined in CDK using OAC — v1.0
- ✓ INFRA-02: OIDC IAM role scoped to `repo:rainhead/beeatlas` — no stored AWS keys — v1.0
- ✓ INFRA-03: GitHub Actions builds on all pushes, deploys to S3 + CloudFront invalidation on push to main — v1.0
- ✓ MAP-01: Specimen points render as recency-colored clusters at low zoom — v1.0
- ✓ MAP-02: Clicking a cluster shows sample details sidebar (species, collector, date, host plant) — v1.0
- ✓ FILTER-01: Taxon filtering at species/genus/family level via autocomplete datalist — v1.0
- ✓ FILTER-02: Year range and month-of-year filtering (independently combinable) — v1.0 (month offset fixed in Phase 5)
- ✓ NAV-01: URL sharing — map view (center/zoom) and active filter state encoded in query string; shareable URLs restore exact view — v1.1

### Active

- [ ] **INAT-01**: Pipeline queries iNaturalist API for Washington Bee Atlas collection observations — v1.2
- [ ] **INAT-02**: Pipeline extracts observer, date, coordinates, and specimen count observation field from each iNat observation — v1.2
- [ ] **INAT-03**: Pipeline produces samples.parquet (one row per iNat observation: observation_id, observer, date, lat, lon, specimen_count) — v1.2
- [ ] **MAP-03**: Map renders a sample markers layer coexisting with existing specimen clusters — v1.2
- [ ] **MAP-04**: Clicking a sample marker shows sidebar with observer name, collection date, and specimen count (0 = not yet entered) — v1.2

### Out of Scope

| Feature | Reason |
|---------|--------|
| Tribe-level filtering | Tribe not present in Ecdysis DarwinCore export |
| Server-side API or backend | Static hosting constraint — all data client-side |
| User accounts / saved filters | URL sharing covers the use case |
| Multi-source data (GBIF, OSU Museum) | Experimental; Ecdysis is the specimen source of truth |
| Real-time data refresh | Static Parquet updated per pipeline run is correct |
| Heat map / analytics | Map is the analytical surface; charts are scope creep |
| iNaturalist host plant display layer | v1.2 uses iNat data for collection event samples, not a visual plant layer |
| Ecdysis HTML scraping for specimen-sample linkage | Deferred to v1.3 — ship iNat sample markers first |
| Location search / pan-to-place | Deferred to v2 (NAV-02) |

## Context

Shipped v1.0 on 2026-02-22 (~6,172 lines across 47 files, 4 days). Shipped v1.1 on 2026-03-10 — URL sharing (+324 lines in `bee-map.ts` and `bee-sidebar.ts`, back button + multi-occurrence cluster encoding required gap closure).

**Tech stack:**
- Frontend: TypeScript, Vite, OpenLayers, Lit (LitElement), hyparquet, temporal-polyfill
- Pipeline: Python 3.14+, uv, pandas, geopandas, pyarrow
- Infrastructure: AWS CDK v2 (TypeScript), S3 + CloudFront OAC, OIDC IAM role
- CI/CD: GitHub Actions (build on all pushes, deploy on push to main)

**Live site:** https://d1o1go591lqnqi.cloudfront.net

**Known tech debt:**
- CI build runs `npm run build` which calls `build-data.sh` — makes a live HTTP POST to ecdysis.org on every push. If ecdysis.org is down, all CI builds fail. `frontend/src/assets/ecdysis.parquet` is committed as fallback.
- `speicmenLayer` typo in `bee-map.ts` (consistent, functions correctly).
- No VERIFICATION.md files for any phase — verification relies on human-approved SUMMARY files.
- Phase 1 SUMMARY references `--db` flag; actual CLI flag is `--datasetid`.

## Constraints

- **Static hosting**: No server runtime — all data must be in static Parquet files bundled with or fetched by the frontend
- **Python version**: 3.14+ (per `data/pyproject.toml`)
- **Node.js**: Version pinned in `package.json`
- **AWS**: Infrastructure via CDK in `infra/`; deploy via OIDC role (not long-lived access keys)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Parquet as frontend data format | Enables browser-side filtering without a server; hyparquet reads client-side | ✓ Good — hyparquet read 45,754 rows cleanly; sub-second load |
| CDK for AWS infrastructure | User preference; keeps infra as code alongside the project | ✓ Good — BeeAtlasStack + GlobalStack deployed; OAC pattern stable in CDK v2.156+ |
| OIDC for GitHub Actions AWS auth | No long-lived secrets; matches reference project pattern | ✓ Good — StringLike trust policy (`repo:rainhead/beeatlas:*`) confirmed; no thumbprints needed |
| iNaturalist data in separate samples.parquet | Keep data sources separate; iNat and Ecdysis have different latencies and schemas | — Pending — v1.2 |
| FilterState as singleton (not Lit reactive) | OL style callbacks have fixed signatures; can't receive extra params | ✓ Good — singleton mutation + `clusterSource.changed()` repaint pattern works cleanly |
| Style cache key = `count:tier` | Avoids per-render Style object allocation | ✓ Good — cache bypassed only when filter active; correct for all cases |
| Month DarwinCore 1-indexing | DarwinCore months are 1=January; the original +1 offset was a bug | ✓ Good — removed in Phase 5; all 12 months now reachable |
| `id-token: write` permission at job level | Workflow-level permission with multiple jobs causes credential load error | ✓ Good — deploy job-level permission works correctly |
| `S3BucketOrigin.withOriginAccessControl()` (OAC not OAI) | OAI is deprecated in CDK; OAC is the recommended pattern | ✓ Good — confirmed stable, no `websiteIndexDocument` on bucket needed |
| Deploy job rebuilds frontend independently | Avoids artifact upload/download complexity | ✓ Good — self-contained deploy job; acceptable double-build tradeoff |
| Query string (not hash) for URL state | Shareable, bookmarkable, works with browser history API natively | ✓ Good — x/y/z/taxon/yr0/yr1/months/o params encode full view state |
| replaceState on every moveend + debounced pushState (500ms) | Avoids history explosion while preserving back-button nav at settled positions | ✓ Good — back navigation works correctly between settled views |
| `_isRestoringFromHistory` guard + `map.once('moveend')` reset | Prevents popstate→moveend feedback loop; async reset required because OL fires moveend after DOM repaint | ✓ Good — required gap closure to fix (initially reset synchronously) |
| `_selectedOccIds: string[]` comma-separated in `o=` | Multi-occurrence cluster clicks encode all IDs; restore shows full cluster in sidebar | ✓ Good — three bugs required gap closure (preserve on load, all IDs, restore array) |
| Lit `updated()` pattern for URL-pushed restore props | BeeMap pushes restore props as `@property`; BeeSidebar mirrors to `@state` via `updated()` | ✓ Good — clean separation between map-driven restore and sidebar-driven state |

---
*Last updated: 2026-03-10 after v1.1 milestone (URL Sharing)*
