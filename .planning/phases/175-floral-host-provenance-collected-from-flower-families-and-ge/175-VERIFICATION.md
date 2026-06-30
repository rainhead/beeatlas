---
phase: 175-floral-host-provenance
verified: 2026-06-30T12:00:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "After the first nightly pipeline run, visit a covered species page (e.g. /species/Bombus/mixtus/) on the production site and confirm the 'Collected from' block appears with real floral host families and nested genera, ordered by sample count."
    expected: "A 'Collected from' section renders below the Traits fact-sheet, listing flower families (e.g. Asteraceae, Rosaceae) with genera separated by middots, and a '+N more families' footer when there are more than 6 families."
    why_human: "species_hosts.json is produced only by the nightly pipeline (taxa.csv.gz absent locally). The fixture-based render UAT confirmed the template logic, but prod data cannot be exercised until the first nightly run populates the file and deploy.yml fetches it."
---

# Phase 175: Floral Host Provenance Verification Report

**Phase Goal:** On the species detail page, show each bee species' OBSERVED floral hosts — flower FAMILIES with their GENERA nested underneath, ordered by sample count — derived from actual sample/collection data. Source: iNat host-plant observations via occurrence_links.host_observation_id. Adds plant-family resolution by mirroring taxa_pipeline.load_taxon_lineage_extended over raw/taxa.csv.gz; aggregates per canonical_name into a separate species_hosts.json sidecar (nested families→genera), keeping the dbt contract untouched.
**Verified:** 2026-06-30
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A plant-host lineage table resolves each observed host plant taxon_id to its family and genus | VERIFIED | `data/host_plant_lineage.py` implements full ancestry walk with seed-set restriction; 4 unit tests pass (schema, species-resolves, genus-via-self_rows, non-seed-absent) |
| 2 | Per bee canonical_name, distinct family/genus hosts are aggregated with a distinct-sample count ordered desc | VERIFIED | `data/dbt/models/intermediate/int_species_host_plants.sql` counts `DISTINCT host_observation_id AS sample_count`; ORDER BY canonical_name, sample_count DESC, family, genus; synonymy via int_synonyms |
| 3 | species_hosts.json exists keyed by canonical_name, families ordered by sample count, genera nested per family | VERIFIED | Producer in `data/species_export.py` lines 408-457; 6 pytest tests pass including ordering, null-genus, idempotency, tiebreaker, and absence-tolerance |
| 4 | The enforced dbt contracts on marts/occurrences and marts/species are unchanged | VERIFIED | `git diff --name-only b61bc37c HEAD | grep 'data/dbt/models/marts/'` produces empty output |
| 5 | On a covered species page a Collected from block lists flower families with nested genera | VERIFIED (fixture UAT) | `_pages/species-detail.njk` lines 60-73 contain a `section.collected-from` block; fixture UAT confirmed "Collected from" in `_site/species/Bombus/mixtus/index.html` |
| 6 | Families are ordered by sample count; a +N more families cap appears when families exceed the display cap | VERIFIED | Template uses `loop.index0 < 6` guard and `(+{{ hosts.length - 6 }} more ... families)` footer |
| 7 | Species with no host data omit the Collected from block entirely | VERIFIED | `{%- if hosts and hosts.length > 0 -%}` guard on line 61 of species-detail.njk |
| 8 | The site builds on a clean checkout with no species_hosts.json present | VERIFIED | `rm -f public/data/species_hosts.json && npm run build && test -d _site` → BUILD_PASSED (Eleventy 3.1.6, 1622 files written) |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/host_plant_lineage.py` | load_host_plant_lineage — plant lineage ancestry walk seeded from observed host taxon_ids | VERIFIED | Defines `load_host_plant_lineage`; UNION ALL self_rows arm present; `active = 'true'` string guard; no Anthophila (630955) filter |
| `data/dbt/models/intermediate/int_species_host_plants.sql` | per-bee family/genus host aggregate with distinct-sample count | VERIFIED | Contains sample_count (COUNT DISTINCT), species_host_plants.parquet (external materialization), int_synonyms join, genus rank-guard for fallback, deterministic ORDER BY with tiebreakers |
| `data/species_export.py` | species_hosts.json sidecar producer | VERIFIED | Producer block at lines 408-457; reads species_host_plants.parquet; absent-file WARNING branch; json.dumps(sort_keys=True, indent=2) |
| `_data/species_hosts.js` | Eleventy build-time loader, default-export Record keyed by canonical_name, absence-tolerant | VERIFIED | existsSync guard + try/catch; `export default result`; no named exports |
| `_pages/species-detail.njk` | Collected from block fed by species_hosts[sp.canonical_name] | VERIFIED | `section.collected-from` with h2 "Collected from"; FAMILY_CAP=6, GENUS_CAP=8 via loop.index0; no dump/safe filter on host names |
| `data/nightly.sh` | hashed upload + manifest key + baseline map for species_hosts.json | VERIFIED | `_upload_hashed "$EXPORT_DIR/species_hosts.json"` at line 323; `"species_hosts": "$species_hosts_name"` in manifest heredoc line 340; LOCAL_NAMES entry at line 162 |
| `.github/workflows/deploy.yml` | build-time fetch of species_hosts.json from S3 | VERIFIED | `SPECIES_HOSTS_FILE=$(jq -r '.species_hosts // empty' /tmp/manifest.json)` with `if [ -n "$SPECIES_HOSTS_FILE" ]` guard at lines 62-67 |
| `data/dbt/models/staging/stg_inat__host_plant_lineage.sql` | one-line view over source | VERIFIED | Single SELECT * FROM source('inaturalist_data', 'host_plant_lineage') |
| `data/dbt/models/sources.yml` | host_plant_lineage table under inaturalist_data source | VERIFIED | Line 18: `- name: host_plant_lineage` under inaturalist_data |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| observations.taxon__id | host_plant_lineage.taxon_id | ancestry walk / seed-set restriction | WIRED | host_plant_lineage.py seeds from `SELECT DISTINCT o.taxon__id FROM inaturalist_data.observations JOIN ecdysis_data.occurrence_links` |
| occurrence_links.host_observation_id | stg_inat__observations.id | host link and distinct-sample proxy | WIRED | int_species_host_plants.sql: `LEFT JOIN stg_inat__observations obs ON obs.id = base.host_observation_id` |
| int_species_host_plants | public/data/species_hosts.json | external parquet then species_export.py producer | WIRED | species_export.py reads `DBT_SANDBOX_DIR/species_host_plants.parquet`; writes ASSETS_DIR/species_hosts.json |
| public/data/species_hosts.json | _data/species_hosts.js | build-time readFileSync | WIRED | `readFileSync(speciesHostsPath, 'utf8')` guarded by `existsSync` |
| species_hosts[sp.canonical_name] | species-detail.njk Collected from block | Nunjucks lookup | WIRED | `{%- set hosts = species_hosts[sp.canonical_name] -%}` followed by the section block |
| nightly _upload_hashed species_hosts | deploy.yml jq .species_hosts fetch | manifest.json species_hosts key | WIRED | nightly.sh sets species_hosts_name and adds it to manifest; deploy.yml uses `jq -r '.species_hosts // empty'` with absence guard |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `_pages/species-detail.njk` | hosts (= species_hosts[sp.canonical_name]) | `_data/species_hosts.js` → `public/data/species_hosts.json` → `species_export.py` → `species_host_plants.parquet` | Yes (in nightly run); empty object on first code deploy before data run | FLOWING (data-before-code design; absence-tolerant throughout) |
| `data/species_export.py` | hosts_rows (from read_parquet) | `DBT_SANDBOX_DIR/species_host_plants.parquet` → `int_species_host_plants.sql` → occurrence_links × observations × host_plant_lineage | Yes (in nightly run); graceful degradation when parquet absent | FLOWING (with designed absence tolerance) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Python tests pass (lineage + hosts export, non-integration) | `cd data && uv run pytest tests/test_host_plant_lineage.py tests/test_species_hosts_export.py -m "not integration" -q` | 10 passed, 1 deselected in 1.05s | PASS |
| JS loader test passes | `npx vitest run src/tests/data-species_hosts.test.ts` | 3 passed (363ms) | PASS |
| Clean-checkout build gate | `rm -f public/data/species_hosts.json && npm run build && test -d _site` | BUILD_PASSED — Eleventy 3.1.6, 1622 files written | PASS |
| No dbt mart contract files modified | `git diff --name-only b61bc37c HEAD | grep 'data/dbt/models/marts/'` | (empty output) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| Floral-host "Collected from" block on species pages | 175-02-PLAN.md | section.collected-from in species-detail.njk with families + genera | SATISFIED | Template lines 60-73 confirmed; fixture render UAT passed |
| plant family+genus from sample data | 175-01-PLAN.md | host_plant_lineage + int_species_host_plants pipeline | SATISFIED | host_plant_lineage.py + SQL model; 10 pytest tests pass |
| no dbt-contract change | Both plans | marts/occurrences and marts/species untouched | SATISFIED | git diff confirms no mart files changed; int_species_host_plants is an intermediate, not a mart |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `data/run.py` | 10-11 | Module docstring pipeline-steps comment omits `host-plant-lineage` from the step list | Info | Documentation drift only; actual STEPS tuple at line 126 is correct |
| `_pages/species-detail.njk` | 66 | `{{ fam.family }} · {% for g in fam.genera %}` — middot renders even when genera list is empty, producing dangling ` · ` | Info | Cosmetic; only affects host taxa with null genus across all observations (rare edge case); deferred in 175-REVIEW.md as IN-01 |
| `data/species_export.py` | 6, 198 | Docstring says "seven artifacts" but bullet list has six items; one docstring omits species_hosts.json | Info | Documentation drift; no behavioral impact; deferred as IN-02 |

No TBD, FIXME, or XXX markers found in any phase-modified files.

Code review 175-REVIEW.md found 3 warnings (WR-01: genus rank-guard; WR-02: deterministic tiebreaker; WR-03: deploy.yml absence guard) — all resolved in commit 31f41296. Two info items (IN-01 dangling middot, IN-02 docstring count) deliberately deferred as cosmetic.

### Human Verification Required

#### 1. Prod "Collected from" block visual check

**Test:** After the first nightly pipeline run following this code deployment, visit a covered species page in production — e.g. `/species/Bombus/mixtus/` — and inspect the "Collected from" section.

**Expected:**
- A "Collected from" heading appears below the Traits fact-sheet
- Up to 6 families are listed (e.g. Asteraceae, Rosaceae), each followed by a middot and comma-separated genus names (up to 8 per family)
- When there are more than 6 families, a muted "(+N more families)" line appears
- Species without host data (e.g. a species not in the 534 covered) show no such block
- Family and genus names are correctly escaped (no raw HTML, no XSS artifacts)

**Why human:** `species_hosts.json` is produced only by the nightly pipeline (requires `taxa.csv.gz` + dbt build + occurrence_links data). The fixture-based render UAT confirmed the Nunjucks template logic works correctly, but actual prod data can only be verified after the first nightly run publishes the file and deploy.yml fetches it into the build.

### Gaps Summary

No gaps. All 8 must-have truths verified. All automated tests pass. Three code-review warnings were closed before verification. Two cosmetic info items are deferred (middot edge case, docstring drift).

One human verification item remains: visual confirmation on prod after the first nightly run populates species_hosts.json with real data.

---

_Verified: 2026-06-30T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
