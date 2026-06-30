---
phase: quick-260630-ihl
plan: 01
subsystem: species-pages
tags: [species-maps, genus-page, color, subgenus, parity]
requires: []
provides: [GENUS-SUBGEN-COLOR]
affects: [data/species_maps.py, _data/species.js]
tech-stack:
  added: []
  patterns: ["subgenus-mode bucketing mirrors the subfamily->genus pattern (D-06), one rank down"]
key-files:
  created: []
  modified:
    - data/species_maps.py
    - data/tests/test_species_maps.py
    - _data/species.js
    - src/tests/data-species.test.ts
decisions:
  - ">=2 distinct subgenera (among occurrence-bearing, epithet-bearing members) is the threshold for subgenus-mode; 0 or 1 keeps per-species coloring"
  - "swatch<->dot parity preserved: identical bucketing rule + identical input set in both producers"
metrics:
  duration: ~25m
  completed: 2026-06-30
---

# Quick Task 260630-ihl: Color Genus-Page Map by Subgenus Summary

Genus-page occurrence maps now color dots by SUBGENUS (one hue per subgenus) for genera
with >=2 distinct subgenera (e.g. Andrena, Lasioglossum, Osmia, Megachile), instead of
exhausting the categorical palette with ~one hue per species. Genera with 0 or 1 distinct
subgenus keep the existing per-species coloring. The change lives entirely in the two
parity-coupled render-time producers (the Python SVG generator and the build-time JS swatch
feed) — no dbt/contract change, no template change.

## What changed

### Task 1 — `data/species_maps.py` (genus SVG, subgenus mode)
- Added `occurrence_count` to the `_generate_group_maps` SELECT and built two helper maps
  while iterating rows: `subgenus_of` (canonical_name -> cleaned subgenus or None) and
  `occ_count_of` (canonical_name -> occurrence_count).
- In the genus loop: `distinct_subgen` = sorted set of non-empty subgenera among
  occurrence-bearing, non-unresolved members. When `len >= 2`, color each member by
  `_group_colors(distinct_subgen)[subgenus_of[c]]` (subgenus mode); members without a
  subgenus or unresolved get `_UNRESOLVED_COLOR` (`#aaaaaa`). When `< 2`, the previous
  per-species branch is kept verbatim.
- Subgenus/tribe/subfamily loops and the per-species SVG path are untouched.
- New test `test_generate_group_maps_genus_subgenus_coloring` + a dedicated multi-subgenus
  fixture (`Multigenus` with subgenera Alpha/Beta, `Singlegenus` with one subgenus Solo)
  asserts shared-fill-per-subgenus in subgenus mode and distinct per-species fills in the
  single-subgenus case. The existing single-subgenus fixture (`_write_test_species_parquet`)
  was left unchanged so all prior tests still pass.

### Task 2 — `_data/species.js` (genusList swatch parity)
- Replaced only the `colorByCanon` construction inside `genusList`'s `.map`. Computes
  `distinctSubgenera` over the same `withOcc` epithet-bearing member set; `>= 2` -> one
  `hslToHex(i*360/len, 70, 50)` per sorted subgenus; `< 2` -> the existing per-species
  expression. `subgenusList` (subgenus pages) is deliberately untouched — within one
  subgenus you still want per-species distinction.
- Updated the existing `genusList hexColors match the Python algorithm` test to branch by
  mode (it now covers both modes); added a dedicated multi-subgenus bucketing test that
  asserts (a) one distinct hexColor per subgenus, (b) >=2 colors overall, and
  (c) reference-color parity (recomputed `hslToHex` over the sorted distinct-subgenus list
  equals the species' `hexColor`).

## Parity (load-bearing)
Both producers bucket over the identical input set (occurrence-bearing + epithet-bearing
members) and sort the distinct-subgenus list plainly (Python `sorted()` <-> JS `.sort()`),
feeding the already-equivalent `_group_colors`/`hslToHex` formula the subgenus list instead
of the species list. Whitespace in subgenus values is stripped on both sides before bucketing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript `noUncheckedIndexedAccess` on new test code**
- **Found during:** Task 2 verification (`npm run build` -> `tsc --noEmit`).
- **Issue:** `distinctSubgenera[i]` is typed `string | undefined` under the project's
  `noUncheckedIndexedAccess`, so indexing `subgenusHex[distinctSubgenera[i]]` failed `tsc`.
- **Fix:** introduced a `const name = distinctSubgenera[i] as string` local in both loop
  bodies. Test-only change; behavior unchanged.
- **Files modified:** `src/tests/data-species.test.ts`
- **Commit:** amended into the Task 2 commit (11f25a19).

No contract change, no template change, no `public/data/species-maps/**` committed.

**2. [Rule 1 - Bug] KeyError in genus subgenus-mode for checklist-only subgenera (post-execution fix)**
- **Found during:** local full SVG regeneration (`cd data && uv run python species_maps.py`),
  which the Task 1 unit tests did not exercise.
- **Issue:** The genus SUBGENUS-mode color loop iterated all `genus_members`, but
  `subgen_colors` is built only over occurrence-bearing members. A subgenus whose sole
  member is checklist-only (`occurrence_count == 0`, e.g. `Andrena` subgenus `Parandrena`)
  was absent from `subgen_colors`, so `colors[c] = subgen_colors[sg]` raised
  `KeyError: 'Parandrena'` and crashed the full regen end-to-end.
- **Fix:** guarded the lookup — `if c not in unresolved and sg and sg in subgen_colors:`
  — falling back to `_UNRESOLVED_COLOR` (`#aaaaaa`) otherwise. This restores parity with
  `_data/species.js`, where `colorByCanon` is built over the `withOcc` (occurrence-bearing)
  set and checklist-only species are appended later with neutral grey. Checklist-only
  species draw no dots (`occ_by_canon` empty), so the visible map is unaffected; the guard
  is crash-safety + swatch<->dot parity. The JS producer was inspected and is already safe
  (no analogous change needed).
- **Regression test:** added `test_generate_group_maps_checklist_only_subgenus_no_crash`
  with `_write_checklist_only_subgenus_parquet` — a multi-subgenus `Andrena` fixture where
  subgenus `Parandrena` is represented only by a checklist-only species. Asserts no raise
  and that the occurrence-bearing subgenera still get distinct shared fills.
- **Files modified:** `data/species_maps.py`, `data/tests/test_species_maps.py`
- **Commit:** bbeac971 (new atomic commit; Task 1's species_maps.py change was in c1346bc4,
  not HEAD, so amend was not clean).

## Tests
- `cd data && uv run pytest tests/test_species_maps.py -x` — 16 passed (1 integration deselected).
- `npx vitest run src/tests/data-species.test.ts` — 57 passed.
- Full pre-push gates (memory `feedback_run_tests_before_push`):
  - `npm test` — 906 passed (34 files).
  - `cd data && uv run pytest -m "not integration"` — 295 passed, 9 skipped, 60 deselected.
- **Full local regeneration now passes end-to-end:** `cd data && uv run python species_maps.py`
  exits 0 (591 species SVGs + 194 group SVGs written; gitignored output, not staged).

## Verification (Task 3 — pending human)
Task 3 is `checkpoint:human-verify` gate="blocking" and was NOT performed by the executor.
The human verification regenerates SVGs locally (`cd data && uv run python species_maps.py`,
gitignored output — do not commit) and visually confirms Andrena buckets by subgenus, a
single-subgenus genus is unchanged, and swatch<->dot parity holds. (The regen now completes
without crashing — see fix #2 above.)

## Self-Check: PASSED
- data/species_maps.py — FOUND
- data/tests/test_species_maps.py — FOUND
- _data/species.js — FOUND
- src/tests/data-species.test.ts — FOUND
- Commit c1346bc4 (Task 1) — FOUND
- Commit 11f25a19 (Task 2) — FOUND
- Commit bbeac971 (post-execution KeyError fix) — FOUND
