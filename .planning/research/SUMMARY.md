# Project Research Summary

**Project:** Washington Bee Atlas
**Domain:** Static biodiversity occurrence map — brownfield extension with CI/CD deploy
**Researched:** 2026-02-18
**Confidence:** HIGH (frontend/pipeline from direct source audit; AWS infra MEDIUM from training data)

## Executive Summary

The Washington Bee Atlas is a brownfield TypeScript/Python project that renders entomological specimen observations on an OpenLayers map, served as a fully static site from S3+CloudFront. The task is to add five features (taxon filtering, date filtering, click-to-detail popup, iNaturalist host plant layer, location search) plus automate deployment via GitHub Actions OIDC. The existing stack — Lit web components, OpenLayers 10, hyparquet, pandas/geopandas, pyinaturalist — is well-chosen and should not change. The gaps to fill are: CDK infrastructure (S3 bucket, CloudFront distribution, OIDC IAM role), a completed iNaturalist data pipeline, and frontend feature work on top of the existing `BeeMap` component.

The recommended approach is to work strictly left-to-right through the data path: fix the broken data pipeline first (remove the `pdb.set_trace()` debugger trap, consolidate Parquet schemas, add a null-coordinate guard), then wire up infrastructure (CDK stack + OIDC + GitHub Actions deploy workflow), then add frontend features in dependency order (clustering, popup, filters, host plant layer, URL sharing). Architecture research is decisive: use OL style functions as a visibility gate for filtering (return `null` to hide features), use Lit `@state()` with an `updated()` hook to bridge Lit and OL render loops, and render the detail panel as a Lit sidebar rather than an OL Overlay to avoid shadow DOM friction. All filtering is client-side; there is no backend.

The two highest risks are both preventable with known patterns. First, the iNaturalist API has a hard 10,000-record cap per query that causes silent data truncation — use `id_above` pagination (pyinaturalist's `page='all'` already triggers this) and validate `total_results` in the pipeline. Second, the CDK/CloudFront deploy can leave stale cached files visible to users — always run `cloudfront create-invalidation` after every S3 sync, and set `Cache-Control: no-cache` on `index.html`. Both risks have concrete mitigations; neither requires architectural changes.

---

## Key Findings

### Recommended Stack

The existing stack is solid and complete for this use case. The only new technology introductions are AWS CDK v2 for infrastructure-as-code and GitHub Actions OIDC for keyless CI/CD. CDK v2 (`aws-cdk-lib`) is the only supported major version; use `S3BucketOrigin.withOriginAccessControl()` (not the deprecated `S3Origin`) for the CloudFront origin. OIDC eliminates stored AWS key secrets: GitHub Actions receives a short-lived JWT, and the IAM role trust policy restricts assumption to the specific repo and branch.

**Core technologies:**
- **Lit 3 + OpenLayers 10**: Frontend web component + map — existing, do not change
- **hyparquet**: Client-side Parquet reading via HTTP Range requests — existing, handles 45K+ features without a backend
- **pandas/geopandas + pyarrow**: Data pipeline — existing; pyarrow Parquet output is the contract between pipeline and frontend
- **pyinaturalist 0.20.2 (functional API)**: iNat data download — existing; use `get_observations(page='all')` for IDRangePaginator; do NOT use the experimental `iNatClient` OOP API
- **AWS CDK v2**: S3 + CloudFront + OAC + OIDC IAM role — new; single bucket for both site and data files
- **GitHub Actions OIDC**: Keyless deploy — new; `aws-actions/configure-aws-credentials@v4` handles JWT exchange

### Expected Features

The target users are field biologists planning collecting trips — domain experts who know taxonomy and expect professional-grade map tooling.

**Must have (table stakes):**
- Taxon filter (typeahead against family/genus/species) — primary user workflow; "show me only Osmia records"
- Date range filter (by year or month-of-year) — seasonality drives field planning
- Click-to-detail popup/sidebar — every dot must be identifiable; show species, collector, date, host plant
- Clustered point rendering — 45K unclustured points is an unreadable blob at state zoom; `clusterStyle` is already stubbed in `style.ts`
- Scale bar + attribution — cartographic conventions; legally required for ESRI tiles

**Should have (differentiators):**
- iNaturalist host plant layer (toggleable) — cross-referencing bee habitat with plant availability is the primary analytical value of the tool
- Shareable URL with filter state — `ol/interaction/Link` is already installed; field biologists share "look at this spot" links
- Location search (Nominatim/OSM) — navigate to a county or city without knowing coordinates

**Defer to v2+:**
- Loading indicator — add when Parquet file size becomes perceptible; currently fast
- Scale bar — trivial but not user-facing priority for launch
- Heat map / analytics charts — scope creep; map is the analytical surface

**Anti-features (explicitly do not build):**
- Server-side API or backend — violates static hosting constraint
- User accounts or saved filters — URL sharing covers the use case
- Multi-source data (GBIF, OSU Museum) — out of scope; Ecdysis is the specimen source of truth
- Real-time data refresh — static Parquet updated per pipeline run is correct

### Architecture Approach

The target architecture extends the existing `BeeMap` LitElement to own two data layers (specimen + host plant), hold reactive filter state, and render UI controls alongside the map. The key architectural pattern is the OL/Lit bridge: Lit `@state()` properties drive filter values, the `updated()` lifecycle hook calls `specimenLayer.changed()` when filter state changes, and the OL style function returns `null` for features that don't match — causing OL to skip rendering those features without reloading data. All 45K features stay in memory after the initial Parquet fetch; filtering is O(n) across existing Feature objects. The detail panel is a Lit-rendered sidebar (not an OL Overlay), which avoids shadow DOM complications.

**Major components:**
1. **ParquetSource (generalized)** — accepts `url`, `columns`, `featureId`, `geometry` constructor params; calls `feature.setProperties(row)` so all Parquet columns travel with the OL Feature; includes null-coordinate guard
2. **BeeMap (extended)** — holds `@state()` properties for `taxonFilter`, `dateRange`, `selectedFeatureId`; wires `updated()` to `layer.changed()`; owns both VectorLayers and the OL Map
3. **Offline data pipeline** — two scripts: `ecdysis/occurrences.py` (fix: remove pdb, extend column list) and `inat/observations.py` (new: download WA Atlas observations, convert to Parquet); both output Parquet to `frontend/src/assets/`
4. **CDK stack** — S3 bucket (private, OAC) + CloudFront distribution + OIDC IAM role; separate cache behaviors for `index.html` (no-cache) vs. `data/*` (long TTL)
5. **GitHub Actions workflow** — OIDC credential exchange + `npm ci && npm run build` + `aws s3 sync --exclude "data/*"` + `cloudfront create-invalidation`

### Critical Pitfalls

1. **CloudFront serves stale files after deploy** — Always run `aws cloudfront create-invalidation --paths "/*"` after every `aws s3 sync`. Set `Cache-Control: no-cache` on `index.html`. Hashed Vite assets self-invalidate by filename but `index.html` does not.

2. **pdb.set_trace() in occurrences.py halts CI indefinitely** — Remove before any CI wiring. This is a blocking bug. CI job will hang for 6 hours then timeout.

3. **iNaturalist 10,000-record hard cap causes silent truncation** — pyinaturalist's `page='all'` uses `IDRangePaginator` (id_above strategy) which bypasses this limit. Validate `total_results` against actual record count after each fetch. Split queries by taxon or date range if needed.

4. **GitHub Actions OIDC subject claim mismatch** — Use `StringLike` with a wildcard (`repo:rainhead/beeatlas:*`) during initial setup; tighten after confirming it works. Ensure the trust policy includes both `aud: sts.amazonaws.com` and the `sub` condition. If using `environment:` scoping, the workflow job must declare it too.

5. **aws s3 sync --delete wipes Parquet data files** — Use `--exclude "data/*"` in the deploy sync command. Keep frontend build and data pipeline as separate sync operations targeting different S3 prefixes.

---

## Implications for Roadmap

Dependencies flow strictly: data schema gates pipeline, pipeline gates frontend, infrastructure gates deployment. The natural phases follow this order.

### Phase 1: Data Pipeline Fixes
**Rationale:** Everything downstream depends on correct, stable Parquet output. The existing pipeline has a blocking debugger trap, duplicate dtype specs, and a null-coordinate bug. None of the frontend features can be tested until the Parquet contains the required fields. This phase has no external dependencies.
**Delivers:** Reliable `ecdysis.parquet` with all popup/filter columns; consolidated schema definition; null guard; removal of pdb trap
**Addresses:** Table stakes popup and filter features (they need the data fields)
**Avoids:** Pitfall 13 (pdb CI hang), Pitfall 10 (schema drift), Pitfall 15 (Ecdysis POST silent failure)

### Phase 2: iNaturalist Data Pipeline
**Rationale:** The host plant layer is a differentiating feature and requires a new pipeline script. It should be built and validated before the frontend layer is wired, so the frontend layer can be implemented against real data. Depends on Phase 1 establishing the Parquet output pattern.
**Delivers:** `inat.parquet` with host plant observations for Washington Bee Atlas project; validated pagination and record counts
**Addresses:** iNaturalist host plant layer (differentiator feature)
**Avoids:** Pitfall 5 (10K cap — use IDRangePaginator), Pitfall 9 (rate limiting — weekly cache in CI)

### Phase 3: AWS Infrastructure (CDK + OIDC)
**Rationale:** Infrastructure can be built in parallel with or immediately after pipeline work. It has no dependency on the frontend features but must exist before any deployment can happen. CDK bootstrap is a one-time manual step that must precede automated deploys.
**Delivers:** S3 bucket, CloudFront distribution (OAC), OIDC IAM role, GitHub Actions deploy workflow
**Uses:** AWS CDK v2, `S3BucketOrigin.withOriginAccessControl()`, `aws-actions/configure-aws-credentials@v4`
**Avoids:** Pitfall 1 (CloudFront cache — invalidation in workflow), Pitfall 2 (OAI vs OAC), Pitfall 3 (OIDC subject mismatch — start with StringLike), Pitfall 7 (CDK bootstrap documentation), Pitfall 11 (--delete wipes data — use --exclude)

### Phase 4: Frontend Core (Clustering + Popup + Generalized ParquetSource)
**Rationale:** These three items are tightly coupled and block all filter work. Generalizing `ParquetSource` (add `columns`, `featureId`, `geometry` params + `setProperties`) is a prerequisite for both the second data layer and the popup. Clustering makes the map usable at state zoom. The popup requires feature properties on the OL Feature objects.
**Delivers:** Generalized `ParquetSource`, null-coordinate guard in frontend, clustering enabled (`ol/source/Cluster` wired to existing `clusterStyle`), click-to-detail Lit sidebar
**Addresses:** Table stakes: clustered rendering, click popup
**Avoids:** Pitfall 12 (OL CSS version drift — switch to Vite-bundled import), ARCHITECTURE anti-pattern (storing Feature object as state — store ID only)

### Phase 5: Frontend Filters + Host Plant Layer
**Rationale:** Filters require the generalized ParquetSource and popup architecture from Phase 4. The host plant layer requires both the iNat pipeline (Phase 2) and the generalized ParquetSource (Phase 4). These ship together because the OL/Lit bridge pattern (`updated()` → `layer.changed()`) is the same for both.
**Delivers:** Taxon typeahead filter, date range filter, second VectorLayer for host plants with toggle, layer visibility controls
**Addresses:** Primary differentiators (filters, host plant layer)
**Avoids:** Pitfall 6 (OL performance — wire clustering before adding host plant layer; consider WebGLPointsLayer if host plant count exceeds 50K), Pitfall 4 (large Parquet in Vite build — keep data files outside dist/ and serve from S3 `data/` prefix)

### Phase 6: URL Sharing + Location Search
**Rationale:** URL sharing requires filters to exist (Phase 5). Location search has no dependencies but is low-risk polish. Both are quality-of-life features that round out the tool.
**Delivers:** `ol/interaction/Link` wired + filter state in URL params; Nominatim geocoder input with `view.fit()` zoom
**Addresses:** Differentiators: shareable URL, location search
**Avoids:** No new pitfalls; uses established patterns

### Phase Ordering Rationale

- **Pipeline before frontend** because the required Parquet columns (taxon hierarchy, year/month, fieldNumber, host plant) are not yet in the output. Frontend features built against the current Parquet would need rework.
- **Infrastructure can overlap with pipeline** (Phases 2 and 3 are independent). The CDK stack does not depend on data content.
- **Core architecture before features** because the generalized ParquetSource and OL/Lit bridge pattern are shared by all filter and layer features. Building filters before this refactor would mean rewriting them.
- **Filters and host plant layer together** because they use the same `updated()` → `layer.changed()` bridge and ship in the same UI iteration.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (CDK + OIDC):** CDK API surface (especially OAC construct signatures) may have changed since training data cutoff (August 2025). Verify `S3BucketOrigin.withOriginAccessControl()` constructor API against current CDK v2 changelog before writing the stack. Check current `aws-actions/configure-aws-credentials` version tag.
- **Phase 5 (Host plant layer performance):** If the iNat dataset for Washington exceeds 50K host plant observations, `VectorLayer` rendering may degrade. Research `WebGLPointsLayer` as a replacement for the host plant layer specifically. OL v10 WebGL rendering API should be verified against installed source.

Phases with well-documented patterns (skip research-phase):
- **Phase 1 (Pipeline fixes):** Removing pdb, consolidating dtypes, adding null guards — standard Python debugging and validation. No novel patterns.
- **Phase 4 (Core frontend):** OL Cluster source, Overlay/sidebar pattern, style-function filtering — all verified from installed OL 10 source and established Lit 3 patterns. Well-documented.
- **Phase 6 (URL sharing + geocoder):** `ol/interaction/Link` is in the installed dependency and verified from source. Nominatim API is straightforward. No research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack verified from installed packages; CDK/OIDC from training data (MEDIUM for those portions) |
| Features | HIGH | OL API verified from installed source at `node_modules/ol/`; domain knowledge from PROJECT.md user description |
| Architecture | HIGH | All patterns derived from direct codebase inspection; OL and Lit APIs stable and well-known |
| Pitfalls | MEDIUM | Project-specific bugs (pdb, null coords, schema drift) are HIGH; CDK/GHA/iNat limits are MEDIUM from training data |

**Overall confidence:** HIGH for what to build and how to build it. MEDIUM for exact AWS CDK API signatures — verify against CDK changelog before writing infra code.

### Gaps to Address

- **CDK construct API stability:** `S3BucketOrigin.withOriginAccessControl()` was introduced in CDK v2 in 2022-2023. Verify the exact constructor signature and options hasn't changed in CDK 2.178.x before writing the stack. The pattern is correct; the API details may differ slightly.
- **iNat record volume for Washington host plants:** Unknown how many total iNat observations exist for the WA Bee Atlas project (166376) and for host plants in WA broadly. If the project has under 10K records, `page='all'` with standard pagination is fine. If broader plant queries are needed, test `total_results` before committing to a query strategy.
- **WebGLPointsLayer hit detection:** If host plant performance requires WebGLPointsLayer, the click interaction API is more complex than VectorLayer. This is a known tradeoff to resolve during Phase 5 if performance is an issue.
- **Washington State iNat place ID:** Research confirms `place_id=82` for Washington from training knowledge. Verify with `pyinaturalist.get_places_by_id(82)` before the data pipeline ships.

---

## Sources

### Primary (HIGH confidence)

- Installed pyinaturalist source: `/Users/rainhead/dev/beeatlas/data/.venv/lib/python3.14/site-packages/pyinaturalist/` — pagination behavior, rate limits, functional vs OOP API
- Installed OpenLayers source: `/Users/rainhead/dev/beeatlas/node_modules/ol/` — Cluster, Overlay, Link, VectorLayer, WebGLPoints APIs
- Project codebase direct audit:
  - `frontend/src/bee-map.ts`, `frontend/src/parquet.ts`, `frontend/src/style.ts` — current architecture baseline
  - `data/ecdysis/occurrences.py` — specimen pipeline and known pdb bug
  - `data/Makefile` — iNat fieldspec and pipeline dependencies
  - `.planning/PROJECT.md` — constraints (static hosting, user personas)
  - `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md` — existing analysis
- WA Bee Atlas iNat project ID 166376: `data/inat/projects.py` — confirmed from repo

### Secondary (MEDIUM confidence)

- AWS CDK v2 documentation and patterns — training data (August 2025 cutoff); OAC construct API, OIDC trust policy structure
- GitHub Actions OIDC documentation — training data; `configure-aws-credentials@v4` workflow
- iNaturalist API v1 pagination limits — training data + pyinaturalist community knowledge; 10K hard cap is well-established

### Tertiary (MEDIUM-LOW confidence)

- Washington State iNat place_id=82 — training data; verify with `pyinaturalist.get_places_by_id(82)` before shipping
- OpenLayers rendering performance thresholds (VectorLayer vs WebGLPointsLayer) — training data; verify against OL v10 release notes

---
*Research completed: 2026-02-18*
*Ready for roadmap: yes*
