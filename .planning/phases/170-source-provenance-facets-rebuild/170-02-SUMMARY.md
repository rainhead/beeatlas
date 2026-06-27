---
phase: 170-source-provenance-facets-rebuild
plan: 02
subsystem: frontend
tags: [filter, symbology, url-state, tier, record_type, facets, provenance, lit, mapbox, frontend-leg, atomic-commit]

# Dependency graph
requires:
  - phase: 170-01-data-leg
    provides: "marts/occurrences tier (atlas/other) + record_type columns (source dropped); geo_blob _GEO_COLS index 6 = tier; the 5 record_type spellings"
provides:
  - "FilterState.hiddenTiers (Set<TierKey>) replacing hiddenSources — the tier facet is the filter's organizing primitive (PROV-02)"
  - "TierKey type + VALID_TIERS allowlist + tier= URL param (with `none` sentinel) + src= legacy 5→2 back-compat fold (D-02)"
  - "tier-driven map symbology (atlas recency / other muted, D-08); properties.tier on map features"
  - "record_type-driven detail card (5 variants, inat_obs→inat_expert; D-09/D-10)"
  - "exported OCC_ID_SQL_CASE + the PROV-03 occ_id-coupling Vitest assertion (3-site equality)"
affects: [171-per-collector-event-stream, 172-accomplishment-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tier= URL serialization mirrors the retired src= visible-subset + `none` sentinel shape; legacy src= folds 5→2 via TIER_OF on read only (lossy by design)"
    - "occ_id positional coupling now asserted (not just commented) by a cross-file CASE-order Vitest test that reads filter.ts export + occurrence_places.sql via readFileSync"
    - "social-tier reframe: tier drives filter/symbology, record_type drives the card — orthogonal facets even though tier=f(record_type) in the data"

key-files:
  created: []
  modified:
    - src/filter.ts
    - src/url-state.ts
    - src/features.ts
    - src/bee-map.ts
    - src/bee-pane.ts
    - src/bee-atlas.ts
    - src/style.ts
    - src/bee-occurrence-detail.ts
    - src/tests/occurrence.test.ts
    - src/tests/url-state.test.ts
    - src/tests/filter.test.ts
    - src/tests/build-geojson.test.ts
    - src/tests/bee-pane.test.ts
    - src/tests/bee-map.test.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-occurrence-detail.test.ts
    - src/tests/bee-atlas-legacy-taxon.test.ts
    - src/tests/filter-join-execution.test.ts
    - docs/domain-model.md

key-decisions:
  - "Muted `other` symbology color = #7a8a99 (desaturated grey-blue, distinct from the recency palette so Atlas pops) — D-08, Claude's discretion"
  - "Tier toggle copy: 'Atlas work' (atlas) / 'Other records' (other) — social framing (D-01)"
  - "Card is record_type-driven NOT tier-driven (D-09/D-10) — deliberate deviation from PROV-02's literal wording; a 2-value tier cannot pick 5 card variants"
  - "src= back-compat is parse-only (never emitted); tier= takes precedence when both present"

patterns-established:
  - "Required-field FilterState rename (hiddenSources→hiddenTiers) gated by tsc --noEmit — caught every missed literal incl. bee-map default + 3 test fixtures"

requirements-completed: [PROV-01, PROV-02, PROV-03]

# Metrics
duration: ~70min
completed: 2026-06-27
---

# Phase 170 Plan 02: Source → Provenance Facets Rebuild (Frontend Leg) Summary

**Decomposed the three coupled `source` consumers onto orthogonal facets in ONE atomic commit (PROV-03): the filter/URL/symbology are now `tier`-driven (`hiddenSources`→`hiddenTiers`, `tier=` param with `src=` 5→2 back-compat), the detail card is `record_type`-driven (5 variants, `inat_obs`→`inat_expert`), Atlas work keeps the recency gradient while Other renders muted (#7a8a99, D-08), and a new Vitest assertion pins the occ_id CASE order across all three coupled sites — `tsc --noEmit` exit 0, 877 tests pass.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 4 of 4 complete
- **Files modified:** 19 (8 src consumers + 10 test files + 1 doc)
- **Atomic commit:** `4513a170`

## Accomplishments

- **Tier facet plumbing (Task 1):** `FilterState.hiddenSources` → `hiddenTiers: Set<TierKey>` end-to-end (filter.ts, url-state.ts, bee-atlas.ts, bee-map.ts, bee-pane.ts). `OccurrenceProperties.source` → `tier`; `OccurrenceRow` gains `tier` + `record_type`; `OCCURRENCE_COLUMNS` projects `tier, record_type`. The tier-filter SQL emits `o.tier IN ('atlas')` / `1 = 0` (all-hidden) with the T-170B-01 allowlist guard preserved.
- **URL contract:** `tier=` serialization mirrors the retired `src=` visible-subset + `none` sentinel. Legacy `src=` is now a parse-only back-compat branch that folds the old 5 sources to 2 tiers via `TIER_OF` (lossy by design, D-02); `tier=` takes precedence when both present; garbage tokens fall back to no-filter (anti-blank guard, T-170B-02).
- **Positional coupling (features.ts):** geo_blob index 6 decode `source` → `tier`, in lockstep with Plan 01's `_GEO_COLS` swap; header comment updated; only `tier` rides the blob.
- **Symbology (Task 2, D-08):** `style.ts _occurrencePointPaint` matches `['get','tier']` — `atlas` keeps the recency gradient, `other` (incl. former checklist green) renders muted `#7a8a99`. Cluster paint + style-cache logic byte-unchanged.
- **Detail card (D-09/D-10):** `bee-occurrence-detail.ts` dispatch is now `record_type`-driven (`checklist` / `waba_specimen` / `inat_expert` / else `_renderSampleOnly`, `isProvisional` first). Renderer bodies unchanged.
- **2-tier pane toggles:** `bee-pane._renderSources` → `_renderTiers` — 5 checkboxes collapse to 2 social-tier toggles ("Atlas work" / "Other records") wired to `_onTierToggle` dispatching `tier-filter-changed`; all-hidden hint check `=== 5` → `=== 2`.
- **PROV-03 coupling test (Task 3):** new assertion in `occurrence.test.ts` — `extractCaseOrder` regex extracts the prefix order from `OCC_ID_SQL_CASE` (imported) and `occurrence_places.sql` (readFileSync), asserting both equal `['ecdysis','inat','inat_obs','checklist']` and equal each other. Asserts the coupling WITHOUT changing any CASE (D-07).
- **Fixtures + docs:** 9 test files updated to tier/record_type vocabulary (incl. a real in-memory SQLite INSERT in filter-join-execution.test.ts and the geo_blob index-6 fixtures in build-geojson.test.ts). `docs/domain-model.md` reframed with the social-tier section, the arm→tier→record_type table, and the `inat_obs`→`inat_expert` rename (noting the occ_id prefix `inat_obs:` is unchanged).

## Task Commits

PROV-03 mandates ONE atomic commit for the whole frontend leg — all four tasks land together:

1. **Tasks 1–4 (atomic):** `feat(170-02): decompose source enum into tier + record_type facets (PROV-01/02/03)` — `4513a170`

(The plan's TDD task structure landed as a single commit per the PROV-03 / D-11 atomicity constraint; no intermediate RED commit was sequenced because the consumer rewrite and its fixtures are positionally coupled and must not split.)

## Verification Results (REAL)

- `npx tsc --noEmit` — **exit 0** (the required-field `hiddenTiers` gate; caught the bee-map default literal + 3 test fixtures).
- `npm test` — **877 passed**, 33 test files, 9 skipped. Includes the PROV-03 coupling assertion (3 new tests in `occurrence.test.ts`).
- `grep -rc "hiddenSources" src/` — only negative assertions remain (`expect(src).not.toMatch(/hiddenSources/)` in 3 test files verifying the rename is complete); no live `hiddenSources` field or literal.
- `grep "properties.source" src/` — 0.
- `grep "export const OCC_ID_SQL_CASE" src/filter.ts` — 1; branch order byte-unchanged (D-07).
- `parseOccId().source` occ_id-prefix dispatch in bee-atlas.ts (`parsed.source`) — 6 occurrences, untouched (D-07).
- `style.ts` matches `['get', 'tier']` (1), no `['get', 'source']` (0).
- `git show --stat HEAD` lists all 8 src consumers + 10 test files + docs/domain-model.md in the single commit; no file deletions.

## Decisions Made

- **Muted color #7a8a99** for `other`-tier points (D-08, Claude's discretion) — a desaturated grey-blue chosen to read as "receded" against the warmer recency palette.
- **Tier toggle copy** "Atlas work" / "Other records" (D-01 social framing) with tooltips clarifying Atlas = community specimens + provisional samples, Other = expert iNat obs + literature.
- **`src=` is parse-only** — never re-emitted; the canonical param is now `tier=`. A legacy `?src=ecdysis,waba_sample` link still restores `tier=atlas` visible.

## Deviations from Plan

### D-10 documented deviation (carried from CONTEXT, for the verifier)

**The detail card is `record_type`-driven, NOT `tier`-driven.** PROV-02 literally says "filter, symbology, **and the detail card** are driven by provenance tier." Per the locked decisions D-09/D-10, the card consumes `record_type` (5 variants) because a 2-value `tier` cannot select 5 card variants. This is the intended decomposition, not a gap: **filter + URL + symbology are tier-driven; the card is record_type-driven.** Documented in `docs/domain-model.md` and the plan's success-criteria NOTE.

### Auto-fixed Issues

None — the plan executed as written. The only deviations from a strictly-mechanical rename were the four test-fixture files the plan listed plus two it did not enumerate by name but that the `tsc`/runtime gate surfaced:

- **[Rule 3 - Blocking] `bee-atlas-legacy-taxon.test.ts`** built a `DEFAULT_FILTER` literal with `hiddenSources: new Set<SourceKey>()` — renamed to `hiddenTiers: new Set<TierKey>()` (runtime failure: `Cannot read properties of undefined (reading 'size')` in `isFilterActive`).
- **[Rule 3 - Blocking] `filter-join-execution.test.ts`** created an in-memory `occurrences` table from `OCCURRENCE_COLUMNS` (now tier/record_type) but its INSERT statements hardcoded the dropped `source` column — rewrote the two INSERTs to `tier`/`record_type` values (`'atlas','specimen'` / `'other','inat_expert'`).

Both are direct downstream consumers of the renamed field/column, surfaced by the gates exactly as the required-field contract predicts. Semantics-preserving; committed in the same atomic commit.

## Known Stubs

None — all consumers wired to live data; no placeholder/empty-data paths introduced.

## Coupling / Release note for the operator

This commit's **deploy reads `occurrences.db` from S3** (which must carry `tier`+`record_type`, no `source`). Plan 01's Task 3 — the one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` S3 publish — is a **blocking operator gate** and is the precondition for pushing/deploying this leg. Per `project_occurrences_contract_release_sequence`, shipping this frontend before the data publishes deadlocks the deploy `validate-db` gate against stale S3. **This executor did NOT push** (sequential, main-tree); the push/deploy is gated on the operator's "published" confirmation.

## Manual-only (deferred to UAT — visual, D-08)

- Tier filter visually splits Atlas (recency-graded) vs Other (muted #7a8a99) on the map; no green checklist points.
- A legacy `?src=ecdysis,waba_sample` link still restores the correct visible tier set (atlas) on reload.

## Self-Check: PASSED

- All 19 modified files present and staged into commit `4513a170` (verified `git show --stat`).
- Commit `4513a170` found in git history (`git log --oneline -1`).
- `npx tsc --noEmit` exit 0; `npm test` 877 passed.
- No file deletions in the commit (`git diff --diff-filter=D HEAD~1 HEAD` empty).

---
*Phase: 170-source-provenance-facets-rebuild*
*Completed (frontend leg, Tasks 1–4): 2026-06-27*
