# Roadmap: Washington Bee Atlas

## Overview

The project extends an existing brownfield TypeScript/Python static site to deliver a fully usable tool for volunteer bee collectors: a fixed data pipeline producing correct Parquet, an automated deploy to S3/CloudFront via CDK and GitHub Actions OIDC, and a frontend with clustered specimen rendering, click-to-detail sidebar, taxon and date filters, and shareable URL state. Phases flow strictly left-to-right through the data path — pipeline correctness gates frontend feature work, infrastructure gates deployment, and filters gate URL encoding.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Pipeline** - Fix the Ecdysis data pipeline so it produces complete, correct Parquet (completed 2026-02-18)
- [x] **Phase 2: Infrastructure** - Define S3/CloudFront/OIDC in CDK and wire GitHub Actions deploy (completed 2026-02-18)
- [ ] **Phase 3: Core Map** - Enable specimen clustering and click-to-detail sidebar
- [ ] **Phase 4: Filtering** - Add taxon and date-range filter controls
- [ ] **Phase 5: URL Sharing** - Encode map view and filter state in the URL for shareable links

## Phase Details

### Phase 1: Pipeline
**Goal**: The Ecdysis data pipeline runs end-to-end and produces Parquet files containing all fields needed by the frontend
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-02, PIPE-03
**Success Criteria** (what must be TRUE):
  1. Running `python data/ecdysis/download.py` completes without error and produces a DarwinCore zip file
  2. Running `python data/ecdysis/occurrences.py <zip>` completes without hanging (no pdb trap) and writes a valid Parquet file
  3. The output Parquet contains all required columns: `scientificName`, `family`, `genus`, `specificEpithet`, `year`, `month`, `recordedBy`, `fieldNumber`
  4. Records with null coordinates are excluded from the output without crashing the pipeline
**Plans**: 1 plan

Plans:
- [ ] 01-01-PLAN.md — Fix download.py and occurrences.py bugs; expand Parquet output columns

### Phase 2: Infrastructure
**Goal**: The site deploys automatically — frontend builds on every push and the production S3/CloudFront site updates on push to main using OIDC (no stored AWS keys)
**Depends on**: Nothing (independent of Phase 1)
**Requirements**: INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. `cdk deploy` provisions an S3 bucket and CloudFront distribution accessible at a public URL
  2. The GitHub Actions workflow builds and deploys successfully on push to `main` without any stored AWS access keys
  3. After a deploy, visiting the CloudFront URL shows the current version of the site (not a stale cached version)
  4. The OIDC IAM role trust policy restricts assumption to the `rainhead/beeatlas` repository
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Scaffold CDK project in infra/ and implement BeeAtlasStack (S3, CloudFront OAC, OIDC provider, deployer role)
- [ ] 02-02-PLAN.md — Write GitHub Actions deploy workflow; checkpoint to bootstrap, deploy, set secrets, verify live site

### Phase 3: Core Map
**Goal**: The map is usable at state zoom — specimen points cluster, and clicking any point or cluster shows the sample details in a sidebar
**Depends on**: Phase 1
**Requirements**: MAP-01, MAP-02
**Success Criteria** (what must be TRUE):
  1. At low zoom levels specimen points merge into numbered clusters; zooming in splits clusters into individual points
  2. Clicking a cluster or individual specimen point opens a sidebar showing species, collector, date, and host plant (fieldNumber)
  3. Clicking elsewhere on the map or a close control dismisses the sidebar
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Expand Parquet columns, wire ol/source/Cluster, rewrite clusterStyle with recency tiers
- [ ] 03-02-PLAN.md — Create bee-sidebar LitElement, wire click handler and summary computation in bee-map.ts
- [ ] 03-03-PLAN.md — Human verify: MAP-01 clustering and MAP-02 click-to-detail sidebar

### Phase 4: Filtering
**Goal**: Collectors can narrow the visible specimens by taxon and by time period without reloading the page
**Depends on**: Phase 3
**Requirements**: FILTER-01, FILTER-02
**Success Criteria** (what must be TRUE):
  1. Typing a family, genus, or species name into a filter input hides all non-matching specimen points immediately
  2. Clearing the taxon filter restores all specimen points
  3. Setting a year range (e.g., 2018–2022) hides specimens outside that range
  4. Setting a month filter (e.g., June–July) hides specimens from other months regardless of year
  5. Taxon and date filters combine — only specimens matching both are shown
**Plans**: TBD

### Phase 5: URL Sharing
**Goal**: A collector can share a link that restores the exact map view and active filters another collector sees
**Depends on**: Phase 4
**Requirements**: NAV-01
**Success Criteria** (what must be TRUE):
  1. Panning, zooming, or changing filters updates the URL without a page reload
  2. Opening a shared URL restores the map center, zoom level, and active filter values exactly
  3. A fresh page load with no URL parameters shows the default view (Washington state at full extent)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

Note: Phase 2 (Infrastructure) is independent of Phase 1 (Pipeline) and can be worked in parallel.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pipeline | 1/1 | Complete   | 2026-02-18 |
| 2. Infrastructure | 2/2 | Complete   | 2026-02-18 |
| 3. Core Map | 1/3 | In progress | - |
| 4. Filtering | 0/TBD | Not started | - |
| 5. URL Sharing | 0/TBD | Not started | - |
