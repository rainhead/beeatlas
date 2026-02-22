# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-18)

**Core value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.
**Current focus:** Phase 4 — Filtering

## Current Position

Phase: 4 of 5 (Filtering)
Plan: 5 of 5 in current phase
Status: Phase 4 COMPLETE — all 5 plans done; human-verified all 4 UX gap fixes; ready for Phase 5
Last activity: 2026-02-22 — Phase 4 plan 05 complete; human verification approved

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 2 min
- Total execution time: ~0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-pipeline | 1 | 2 min | 2 min |
| 02-infrastructure | 1 | 4 min | 4 min |
| 03-core-map | 2 | 3 min | 1.5 min |
| 04-filtering | 5 | 13 min | 2.6 min |

**Recent Trend:**
- Last 5 plans: 03-02 (1 min), 04-01 (1 min), 04-02 (2 min), 04-04 (5 min), 04-05 (5 min)
- Trend: Fast

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Phase 1 and Phase 2 are independent — pipeline and infrastructure can be planned/worked in parallel
- [Roadmap]: iNaturalist host plant pipeline deferred to v2 (PLANT-01, PLANT-02, PLANT-03 are v2 requirements)
- [01-01]: Filter null coordinates using ecdysis_decimalLatitude (prefixed name) not decimalLatitude — read_occurrences() calls add_prefix('ecdysis_') before returning
- [01-01]: Write plain pd.DataFrame (not GeoDataFrame) to Parquet to avoid GeoParquet format that breaks hyparquet
- [02-02]: id-token: write permission must be at job level on deploy job, not workflow level — placing at workflow level with multiple jobs causes "Credentials could not be loaded" error
- [02-02]: deploy job rebuilds frontend itself (self-contained) rather than consuming build job artifact — avoids artifact complexity
- [02-01]: Use S3BucketOrigin.withOriginAccessControl() (OAC) not deprecated S3Origin (OAI) — confirmed stable in CDK v2.156+, verified in synth output
- [02-01]: No websiteIndexDocument on S3 bucket — use defaultRootObject on CloudFront Distribution (incompatible with OAC if set on bucket)
- [02-01]: OIDC trust uses StringLike with repo:rainhead/beeatlas:* — no thumbprints needed (AWS added GitHub root CA late 2024)
- [03-01]: clusterStyle parameter typed as FeatureLike (not Feature) to match OL StyleFunction interface — inner cluster features cast to Feature[] since Cluster source always wraps proper Feature objects
- [03-01]: Style cache key format is count:tier — sufficient for visual correctness, avoids per-render Style allocation
- [03-01]: Recency PlainDate uses day=1 for month-level comparison — acceptable coarseness for 3-tier recency buckets
- [03-02]: MapBrowserEvent type import required for singleclick handler under strict + verbatimModuleSyntax — OL map.on() overload resolves to any without explicit typing
- [03-02]: specimenSource.once('change') fires reliably after addFeatures() in ParquetSource — getFeatures() returns complete dataset at that point
- [03-02]: Single singleclick handler branches on hits.length — avoids ordering issues with separate open/dismiss handlers
- [04-01]: filterState is a shared mutable singleton (not a Lit reactive property) — OL style callbacks have fixed signatures and cannot receive extra parameters
- [04-01]: styleCache is bypassed entirely when any filter is active — same count:tier pair can yield different match counts when filter applies
- [04-01]: Ghosted clusters use 0.2 opacity grey fill with no count label; matching clusters show match count (not total cluster size) at full opacity
- [04-02]: taxon datalist uses change event (not input) to resolve TaxonOption by label — prevents partial-match false positives mid-keystroke
- [04-02]: year inputs use change event (not input) — avoids filtering while user types a 4-digit year
- [04-02]: _applyFilter always clears selectedSamples — applying any filter dismisses the open cluster detail panel
- [04-02]: filteredSummary is null when no filter is active — avoids allocating an object when unneeded
- [04-04]: _onTaxonInput now resolves exact label matches via input event — browser fires input reliably for datalist; change is unreliable for dropdown picks in some browsers
- [04-04]: Clear selection button placed in _renderFilterControls conditional on this.samples !== null — navigation actions near filter controls, not inline with transient content
- [04-04]: _clearTaxon resets only taxon fields (_taxonInput, _taxonName, _taxonRank) — leaves year and month filter state intact
- [04-05]: Phase 4 filtering human-verified complete — all 4 UX gap fixes confirmed working; no regressions found

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 3]: Verify `place_id=82` for Washington State in iNaturalist before any iNat pipeline work
*(No active blockers for plan 04 items — all 4 Phase 4 UX issues resolved in plan 04)*

*Resolved:*
- [Phase 2 - resolved]: CDK OAC construct API confirmed working — `S3BucketOrigin.withOriginAccessControl()` verified in cdk synth output with aws-cdk-lib 2.238.0
- [Phase 2 - resolved]: OIDC subject claim `repo:rainhead/beeatlas:*` confirmed correct format via synth output

## Session Continuity

Last session: 2026-02-22 (plan 04-05 complete)
Stopped at: Completed 04-05-PLAN.md — Phase 4 filtering complete and human-verified
Resume file: None
