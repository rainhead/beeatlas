---
phase: 132-page-rebuild-subfamily-pages
plan: "02"
subsystem: data-pipeline
tags: [species-export, higher-taxa, slug-collision, retirement, D-03, D-07, PAGE-01, PAGE-03]
dependency_graph:
  requires:
    - data/dbt/target/sandbox/higher_taxa.parquet (Plan 01 output)
    - data/dbt/target/sandbox/species.parquet (Plan 01 prerequisite)
  provides:
    - public/data/higher_taxa.json (new artifact, replaces higher_rank_taxon_ids.json)
    - _check_slug_collisions (hard-fail gate wired into export)
  affects:
    - plans 132-03..04 (consume higher_taxa.json via _data/species.js)
    - nightly pipeline S3 upload (manifest key changed)
    - local dev fetch (fetch-data.sh + make-local-manifest.js)
tech_stack:
  added: []
  patterns:
    - FileNotFoundError with "run dbt build first" message for missing parquet prerequisite
    - Fail-loud AssertionError gate (matching Phase 129 orphan gate philosophy)
    - Genus-only species rows excluded from URL collision check (mirrors speciesList filter)
    - TDD RED/GREEN/REFACTOR cycle for both task sets
key_files:
  created: []
  modified:
    - data/species_export.py
    - data/tests/test_species_export.py
    - data/nightly.sh
    - scripts/fetch-data.sh
    - scripts/make-local-manifest.js
decisions:
  - "_build_higher_rank_taxon_ids removed; _build_higher_taxa reads higher_taxa.parquet (D-03)"
  - "Genus-only species rows (specific_epithet IS NULL) excluded from slug collision check — they do not generate pages (mirrors speciesList filter in species.js)"
  - "_check_slug_collisions keys on full URL path so genus/subgenus Bombus do not false-alarm (Pitfall 5)"
metrics:
  duration: ~40 minutes
  completed: 2026-06-03
  tasks_completed: 3
  files_created: 0
  files_modified: 5
---

# Phase 132 Plan 02: Export Rewire + Collision Gate + Artifact Wiring — Summary

Python export layer rewired onto the dbt rollup: `_build_higher_taxa()` reads
`higher_taxa.parquet` and writes `public/data/higher_taxa.json`; `_build_higher_rank_taxon_ids()`
and `higher_rank_taxon_ids.json` retired atomically (D-03); pre-generation slug-collision hard-fail
gate (`_check_slug_collisions`) wired into export and fully tested; new artifact wired into
nightly.sh S3 upload + manifest, fetch-data.sh, and make-local-manifest.js.

## What Was Built

### Task 1: Collision gate unit tests + _check_slug_collisions implementation (TDD)

`_check_slug_collisions(higher_taxa_rows, species_rows)` added to `data/species_export.py`.
Enumerates every taxon's public URL across all ranks using the per-rank URL scheme:
- genus → `/species/{name}/`
- subgenus → `/species/{genus}/{name}/`
- tribe → `/species/tribe/{name}/`
- subfamily → `/species/subfamily/{name}/`
- species → `/species/{slug}/`

Raises `AssertionError` naming both colliding taxa + URL + "no auto-suffix" language (D-07).
Genus-only species rows (`specific_epithet IS NULL`) are excluded — they don't generate pages
and their genus-name slug would collide with the genus taxon URL by design.

Three tests added to `test_species_export.py`:
- `test_check_slug_collisions_raises_on_collision`: synthetic collision hard-fails
- `test_check_slug_collisions_bombus_no_false_alarm`: genus/subgenus Bombus distinct URLs
- `test_check_slug_collisions_clean_real_data`: sandbox-gated, passes on live data

### Task 2: _build_higher_taxa + D-03 retirement + collision gate wiring (TDD)

`_build_higher_taxa(con)` added:
- Raises `FileNotFoundError` with "run `bash data/dbt/run.sh build` first" if parquet absent
- Serializes 191 rows (genus/subgenus/tribe/subfamily) to `public/data/higher_taxa.json`
- Post-write asserts: non-empty + exactly 12 subfamily rows (D-08 gate)

`_build_higher_rank_taxon_ids()` removed; its call + `higher_rank_taxon_ids.json` write
removed from `export_species_parquet()`. `_check_slug_collisions()` wired after slug
computation as part of the same atomic replacement (D-03).

Three sandbox-gated tests added:
- `test_higher_taxa_json_written_and_12_subfamilies`
- `test_higher_rank_taxon_ids_not_written`
- `test_export_runs_collision_check_clean`

### Task 3: Artifact wiring — nightly.sh, fetch-data.sh, make-local-manifest.js

- `data/nightly.sh`: `higher_rank_taxon_ids` `_upload_hashed` line → `higher_taxa`; manifest
  key `"higher_rank_taxon_ids"` → `"higher_taxa"` (0 remaining `higher_rank_taxon_ids` refs)
- `scripts/fetch-data.sh`: `higher_taxa.json` added to download loop
- `scripts/make-local-manifest.js`: `higher_taxa: 'higher_taxa.json'` added to manifest object

## Verified Baselines

| Metric | Value |
|--------|-------|
| `higher_taxa.json` total rows | 191 |
| Subfamily rows | 12 (exactly) |
| Eumeninae present | No |
| Slug collision on real data | None (clean) |
| `_build_higher_rank_taxon_ids` function definitions | 0 |
| `higher_rank_taxon_ids` refs in nightly.sh | 0 |
| All `test_species_export.py` tests | 10 passed |

Subfamily names (12 bee subfamilies): Andreninae, Apinae, Colletinae, Halictinae, Hylaeinae,
Megachilinae, Melittinae, Nomadinae, Nomiinae, Panurginae, Rophitinae, Xylocopinae.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Genus-only species rows caused false collision in sandbox-gated test**
- **Found during:** Task 1 GREEN phase
- **Issue:** 15 genus-only species rows (e.g. `canonical_name='agapostemon'`, slug `Agapostemon`)
  produce URL `/species/Agapostemon/` which is identical to the genus taxon's URL. These are
  NOT true collisions because genus-only rows do not generate static pages — `_data/species.js`
  filters them with `flat.filter(s => s.specific_epithet !== null)` before page generation.
- **Fix:** `_check_slug_collisions` skips rows where `specific_epithet` is absent and the slug
  has no `/` separator (genus-only rows). Sandbox-gated test uses `WHERE specific_epithet IS NOT
  NULL` to build the species row list. Added comments documenting the rationale.
- **Files modified:** `data/species_export.py`, `data/tests/test_species_export.py`
- **Commit:** d52ca64

## TDD Gate Compliance

RED gate commits:
- 07a9b76 — `test(132-02): add failing collision gate tests`
- 7666fc6 — `test(132-02): add failing tests for _build_higher_taxa + D-03 retirement (RED)`

GREEN gate commits:
- d52ca64 — `feat(132-02): implement _check_slug_collisions`
- 5c91123 — `feat(132-02): _build_higher_taxa + retire _build_higher_rank_taxon_ids`

## Known Stubs

None. All data flows from the live `higher_taxa.parquet` dbt rollup.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: manifest-key-swap | data/nightly.sh | `higher_rank_taxon_ids` manifest key replaced with `higher_taxa`; old key gone from S3 manifest — mitigated by D-03 atomic sequence (Plan 03 wires species.js before file deletion) |

T-132-05, T-132-06, T-132-07 mitigations all applied:
- T-132-05: `_check_slug_collisions` implemented, unit-tested, clean on real data
- T-132-06: `FileNotFoundError` if parquet absent; `assert len > 0`; manifest key swapped
- T-132-07: 0 occurrences of `higher_rank_taxon_ids` in nightly.sh

## Self-Check: PASSED

Files exist:
- [FOUND] data/species_export.py (contains `_build_higher_taxa`, `_check_slug_collisions`)
- [FOUND] data/tests/test_species_export.py (10 tests including 6 new)
- [FOUND] public/data/higher_taxa.json (191 rows, 12 subfamilies, 69,374 bytes)

Commits:
- [FOUND] 07a9b76 — test(132-02): add failing collision gate tests
- [FOUND] d52ca64 — feat(132-02): implement _check_slug_collisions
- [FOUND] 7666fc6 — test(132-02): add failing tests for _build_higher_taxa
- [FOUND] 5c91123 — feat(132-02): _build_higher_taxa + retire _build_higher_rank_taxon_ids
- [FOUND] 71525f6 — feat(132-02): wire higher_taxa.json into nightly.sh/fetch-data.sh/manifest
