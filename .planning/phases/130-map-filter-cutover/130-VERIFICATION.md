---
phase: 130-map-filter-cutover
verified: 2026-06-02T16:00:00Z
status: human_needed
score: 3/3 truths verified (code + data layer); 3 user-facing behaviors await live-app confirmation
overrides_applied: 0
human_verification:
  - test: "Type a taxon and select an entry at each rank (family / subfamily / tribe / genus / subgenus / complex / species); confirm the map shows exactly the descendant points."
    expected: "Map updates to descendant occurrences for the selected taxon; previously-absent ranks (subfamily, tribe, subgenus) now appear in the autocomplete and filter correctly."
    why_human: "Map rendering + autocomplete interaction are visual/runtime behaviors; SQL descendant counts are verified at the data layer but the on-screen point set cannot be confirmed by grep."
  - test: "Apply a taxon filter, copy the URL (taxon=<int>), reload in a fresh tab; then clear filters; then draw a selection rectangle and a region/boundary filter."
    expected: "URL round-trips the integer taxon_id; reload restores the same filter; clear-filters resets; selection-rectangle and region/boundary still work."
    why_human: "Full URL round-trip + clear + selection-rectangle are live-app stateful interactions; unit tests cover parse/build but not the end-to-end browser restore + map redraw."
  - test: "Open occurrence detail cards for an identified Ecdysis specimen, an iNat observation, and an unidentified specimen."
    expected: "Identified cards show the correct taxon name resolved from the cache; unidentified (taxon_id NULL) shows 'No determination'; never blank or 'undefined'."
    why_human: "Detail-card name rendering is visual; render-test fixtures verify the lookup logic, but real-data display in the running sidebar needs eyes."
  - test: "In devtools, confirm the taxon-cache query fires AFTER tablesReady (~250 ms) and not on the boot path; type 'bomb' and confirm D-05 ordering reads Bombini -> Bombus (genus) -> Bombus (subgenus) -> Bombus fervidus complex -> species."
    expected: "No boot-path regression; autocomplete ordering is broader-rank-first then alphabetical and reads correctly."
    why_human: "Boot wall-clock timing and label legibility/ordering are perceptual judgments; deferred from checkpoint:human-verify per 130-VALIDATION.md Manual-Only Verifications."
---

# Phase 130: Map Filter Cutover Verification Report

**Phase Goal:** The frontend stops filtering occurrences on denormalized taxon string columns and switches to `taxon_id` + hierarchy descendant queries against the `taxa` table; the taxon autocomplete gains subfamily/tribe/subgenus/complex (+subtribe); URL round-trip, clear-filters, region/boundary, and selection-rectangle interactions are preserved; detail cards resolve taxon names from the cache by `taxon_id`. Additive phase — denormalized string columns remain present and ignored (dropped in Phase 131).
**Verified:** 2026-06-02T16:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Filter by any taxon at family/subfamily/tribe/genus/subgenus/complex/species → descendant occurrences (incl. previously-absent ranks) | ✓ VERIFIED (code+data) | `buildFilterSQL` (filter.ts L235-242) emits `(taxon_id = N OR taxon_id IN (SELECT taxon_id FROM taxa WHERE lineage_path IS NOT NULL AND instr(lineage_path,'/N/')>0))` — no `family=`/`genus=`/`scientificName=`. Ran exact form against shipped DB: subfamily Halictinae=11977, tribe Eucerini=3134, subgenus Dialictus=1484, genus Apis=1876. All 8 ranks present in `taxa WHERE is_anthophila=1`. Nesting verified: Lasioglossum genus=2723 > Dialictus subgenus=1484; Dialictus lineage_path contains `/57678/`. |
| 2   | URL round-trip (integer taxon_id), clear-filters, region/boundary, selection-rectangle preserved; legacy name URLs fall back | ✓ VERIFIED (code) | `buildParams` (url-state.ts L70-73) sets `taxon=String(taxonId)`, drops `taxonRank`. `parseParams` (L137-148) uses `parseInt`+`String(asInt)===taxonRaw` guard → integer sets `taxonId`, non-integer → `pendingLegacyTaxon`. `_resolveLegacyTaxon` (bee-atlas L441-459) does rank-based twin disambiguation (Bombus genus 52775 vs subgenus 538903 both exist in DB). County/ecoregion/year/month/elevation/place/selection-bounds clauses unchanged in buildFilterSQL. Clear handled via `_onFilterChanged` taxonId:null path. |
| 3   | Detail cards resolve taxon names from cache by taxon_id; no undefined/blank | ✓ VERIFIED (code) | `bee-occurrence-detail.ts` declares `taxonCache` @property (L49); both render paths resolve `this.taxonCache?.get(row.taxon_id)` (L189-190 collector group, L258-259 inat); fallback to `No determination` span when null. Zero `row.scientificName` in determination paths. 21,680 NULL-taxon_id occurrences in DB exercise the fallback. Cache threads bee-atlas (L188 `.taxonCache=${this._taxonCache}`) → bee-pane (L73, L1185 `.taxonCache=`) → detail. |

**Score:** 3/3 truths verified at the code + data layer. All three correspond to user-facing behaviors flagged for live-app human confirmation (see Human Verification Required).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `src/filter.ts` | taxonId FilterState, descendant buildFilterSQL, taxon_id in OCCURRENCE_COLUMNS, 8-rank TaxonOption | ✓ VERIFIED | Contains `instr(lineage_path`; FilterState has `taxonId`/`taxonDisplayName` (no taxonName/taxonRank); OCCURRENCE_COLUMNS L79-87 includes `'taxon_id'`; OccurrenceRow L41 `taxon_id: number\|null`; TaxonOption L371-375 8-rank union; isFilterActive L217 `f.taxonId !== null`. |
| `src/taxa.ts` | buildTaxonLabel, RANK_ORDER, buildTaxonOptions (D-01/D-03/D-05) | ✓ VERIFIED | New pure module; D-03 labels (genus/subgenus parens, complex suffix); RANK_ORDER 8-rank; buildTaxonOptions ancestry-walk excludes bycatch by cache-miss skip. Reproduces the 666-taxon eligible set (data-verified). |
| `src/bee-atlas.ts` | lazy cache build post-tablesReady, D-01 enumeration, legacy resolution | ✓ VERIFIED | `_taxonCache` plain field (L67); built from `SELECT taxon_id,rank,name,lineage_path FROM taxa WHERE is_anthophila=1` (L381); enumeration `SELECT DISTINCT taxon_id FROM occurrences` → `buildTaxonOptions` (L397-403); no `DISTINCT family, genus, scientificName`; `_resolveLegacyTaxon` (L441). |
| `src/url-state.ts` | integer encode + integer/legacy decode | ✓ VERIFIED | `ParsedParams` adds `pendingLegacyTaxon`; integer roundtrip guard; no `params.set('taxonRank'`. |
| `src/bee-occurrence-detail.ts` | taxonCache prop + taxon_id resolution + No-determination | ✓ VERIFIED | @property + dual lookup + fallback; zero `row.scientificName`. |
| `src/bee-pane.ts` | taxonCache prop threading | ✓ VERIFIED | @property L73, forwards `.taxonCache=` L1185. |
| `src/bee-filter-controls.ts` | taxonId-keyed token, getSuggestions | ✓ VERIFIED | TaxonToken `{taxonId, taxonDisplayName}`; getSuggestions emits taxonId tokens; no taxonName/taxonRank. |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| filter.ts buildFilterSQL | taxa.lineage_path | instr() descendant subquery | ✓ WIRED | L240 `instr(lineage_path, '/${f.taxonId}/')`; executed against shipped DB returns correct descendant counts. |
| filter.ts isFilterActive | FilterState.taxonId | non-null check | ✓ WIRED | L217 `f.taxonId !== null` — guards style-cache bypass + race guards per CLAUDE.md invariants. |
| bee-atlas _loadSummaryFromSQLite | taxa + occurrences.taxon_id | post-tablesReady enumeration + ancestry expansion | ✓ WIRED | L378-403 after `await tablesReady`; `is_anthophila` cache + `buildTaxonOptions`. |
| url-state parseParams | FilterState.taxonId / pendingLegacyTaxon | integer-vs-name heuristic | ✓ WIRED | L137-148 parseInt roundtrip guard. |
| bee-atlas._taxonCache | bee-occurrence-detail.taxonCache | bee-pane prop threading | ✓ WIRED | bee-atlas L188 → bee-pane L73/L1185 → detail L49. |
| bee-occurrence-detail | row.taxon_id | taxonCache.get lookup | ✓ WIRED | L189-190, L258-259. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| autocomplete (_taxaOptions) | _taxaOptions | buildTaxonOptions(presentIds, _taxonCache) from live DB queries | Yes — 666 real eligible taxa (data-verified) | ✓ FLOWING |
| detail card name | taxonCache.get(row.taxon_id).name | _taxonCache from `taxa WHERE is_anthophila=1` | Yes — cache populated from shipped taxa table | ✓ FLOWING |
| map filter result | buildFilterSQL descendant query | occurrences joined to taxa.lineage_path | Yes — descendant counts confirmed (11977/3134/1484/1876) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Descendant filter SQL returns real rows per rank | `sqlite3 occurrences.db` exact buildFilterSQL form | subfamily 11977, tribe 3134, subgenus 1484, genus 1876 | ✓ PASS |
| Hierarchy nesting (genus ⊇ subgenus) | Lasioglossum vs Dialictus | 2723 ⊇ 1484 | ✓ PASS |
| D-01 enumeration eligible set | ancestry-expansion query | 666 taxa (matches research-verified) | ✓ PASS |
| No-determination fallback population | NULL taxon_id count | 21,680 rows | ✓ PASS |
| Bycatch present but excluded from autocomplete | is_anthophila=0 present taxa | 106 (excluded by cache-miss skip) | ✓ PASS |
| Type check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Full test suite | `npm test -- --run` | 582/582 pass (24 files) | ✓ PASS |

### Probe Execution

No project probes apply (frontend phase; verified via Vitest + direct DB queries). N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MFILT-01 | 130-01, 130-02 | Filter by any taxon via taxon_id + hierarchy descendant queries | ✓ SATISFIED | buildFilterSQL descendant subquery; data-verified across ranks. |
| MFILT-02 | 130-02 | Autocomplete includes subfamily/tribe/subgenus/complex; resolves to taxon_id with rank disambiguation | ✓ SATISFIED (code+data; ordering legibility → human) | 8-rank TaxonOption; buildTaxonOptions; Bombus genus/subgenus twin disambiguation by rank. |
| MFILT-03 | 130-01, 130-02, 130-03 | URL round-trip, clear-filters, boundary/region, selection-rectangle preserved | ✓ SATISFIED (code; live round-trip → human) | url-state integer encode/decode + legacy fallback; non-taxon clauses unchanged; detail-card cache resolution. |

All three declared requirement IDs are present in REQUIREMENTS.md mapped to Phase 130, marked Complete, and claimed across the plans. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/features.ts | 71-75 | `taxonId: 0` placeholder in legacy TaxonOption build | ℹ️ Info | Confirmed DEAD CODE — `bee-atlas._onDataLoaded` (L990-994) ignores `e.detail.taxaOptions` and builds real options via `_loadSummaryFromSQLite`/`buildTaxonOptions`. Removed with string columns in Phase 131 (additive phase). Not reachable. |
| src/filter.ts | 493 | `getOccurrences` `clauses.join(' OR ')` empty → malformed SQL when occIds has only unknown prefixes | ⚠️ Info (out of scope) | CR-01 from 130-REVIEW.md. Confirmed PRE-EXISTING (introduced commit ff62354 "perf: slim GeoJSON", not Phase 130). Does not defeat any Phase 130 success criterion — taxon filter, URL, and detail-card paths are unaffected. Noted, not failing this phase. |
| src/bee-atlas.ts | 355, src/filter.ts 317-319 | summary/filtered counts still use `family`/`genus`/`scientificName` | ℹ️ Info | Legitimate additive use — summary panel counts, not the taxon filter or autocomplete enumeration. String columns intentionally retained this phase (dropped Phase 131). |

No debt markers (TBD/FIXME/XXX/HACK/PLACEHOLDER) in any phase-modified file.

### Human Verification Required

The phase goal is fully achieved at the code and data layers (all SQL, wiring, types, and the 666-taxon enumeration verified against the shipped DB; 582 tests green; tsc clean; build green per summaries). The three success criteria are, however, user-facing runtime behaviors that require confirmation in the live app:

#### 1. Multi-rank taxon filtering on the map (criterion #1, MFILT-01/02)
**Test:** Type a taxon and select an entry at each rank (family / subfamily / tribe / genus / subgenus / complex / species); observe the map.
**Expected:** Map shows exactly the descendant points; previously-absent ranks (subfamily, tribe, subgenus) appear and filter correctly.
**Why human:** Map rendering and autocomplete interaction are visual/runtime; descendant counts are data-verified but the on-screen point set is not grep-checkable.

#### 2. URL round-trip + clear + region/selection interactions (criterion #2, MFILT-03)
**Test:** Apply a taxon filter, copy URL (`taxon=<int>`), reload in fresh tab; clear filters; draw a selection rectangle; apply a region/boundary filter. Also test a legacy `?taxon=Bombus&taxonRank=genus` URL.
**Expected:** Integer taxon_id round-trips and restores; clear resets; selection-rectangle and region/boundary work; legacy URL resolves to the Bombus genus (not subgenus).
**Why human:** End-to-end stateful browser restore + map redraw; unit tests cover parse/build but not the live restore.

#### 3. Detail-card name resolution (criterion #3, MFILT-03)
**Test:** Open detail cards for an identified Ecdysis specimen, an iNat observation, and an unidentified specimen.
**Expected:** Identified cards show the cache-resolved name; unidentified (taxon_id NULL) shows "No determination"; never blank/undefined.
**Why human:** Visual rendering of real-data sidebar.

#### 4. Boot-path + autocomplete ordering (deferred from VALIDATION.md Manual-Only Verifications)
**Test:** In devtools, confirm the taxon-cache query fires AFTER `tablesReady` (~250 ms) and not on the boot path. Type `bomb`; confirm order `Bombini` → `Bombus (genus)` → `Bombus (subgenus)` → `Bombus fervidus complex` → species.
**Expected:** No boot-path regression; D-05 ordering reads broader-rank-first then alphabetical.
**Why human:** Wall-clock boot timing and label legibility are perceptual; planner-deferred.

### Gaps Summary

No blocking gaps. The descendant-query cutover, autocomplete enumeration, URL contract, legacy back-compat, and detail-card cache resolution are all implemented and verified against the shipped database and the full test suite. The features.ts `taxonId: 0` placeholder is confirmed dead code (not read by the runtime). The CR-01 `getOccurrences` empty-clauses issue is pre-existing (commit ff62354), out of scope, and does not defeat any Phase 130 success criterion.

Status is `human_needed` because all three roadmap success criteria are user-facing runtime/visual behaviors that the methodology requires a human to confirm in the running app, plus two planner-deferred manual verifications (boot timing, autocomplete ordering legibility). The automated and data-layer evidence strongly supports that these will pass.

---

_Verified: 2026-06-02T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
