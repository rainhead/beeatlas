---
phase: 078-pipeline-outputs
plan: 04
subsystem: data-pipeline

tags: [run.py, steps, idempotency, svg, byte-stable, sha256, et-canonicalize, validate-schema]

requires:
  - plan: 078-02
    provides: data/species_export.py::main (zero-arg entry)
  - plan: 078-03
    provides: data/species_maps.py::main (zero-arg entry) and _write_species_svg
provides:
  - "data/run.py STEPS now contains ('species-export', export_species_parquet) and ('species-maps', generate_species_maps) between 'export' and 'feeds'"
  - "data/species_maps.py::_write_species_svg emits byte-stable SVG output across Python invocations (sorted attribute dicts)"
  - "data/tests/test_species_export.py::test_idempotency_two_runs — sha256 byte-equality for species.parquet + species.json + seasonality.json"
  - "data/tests/test_species_maps.py::test_svg_idempotency — sha256 byte-equality for every SVG across two consecutive generate_species_maps calls"
  - "Wave 0 stubs fully retired — 121 of 121 pytest tests green"
affects: [080-species-tab, 081-viz-seasonality, nightly-cron-on-maderas]

tech-stack:
  added: []
  patterns:
    - "Idempotent SVG serialization: sort each ET.Element.attrib dict before ET.tostring so insertion-order-dependent output is normalized to alphabetic-by-key. Lighter than ET.canonicalize and preserves the existing xml_declaration."
    - "Pipeline-wide byte-equality test: hashlib.sha256 over each artifact across two consecutive same-process function calls; time.sleep(1.5) between runs surfaces any time-dependent non-determinism."

key-files:
  created: []
  modified:
    - data/run.py
    - data/species_maps.py
    - data/tests/test_species_export.py
    - data/tests/test_species_maps.py

key-decisions:
  - "Deterministic SVG fix: Option A (sort attribute dicts before ET.tostring), not Option B (post-serialization ET.canonicalize). Reason: smaller change, preserves the existing xml_declaration, and matches what we want at the byte level (lex-ordered attributes per element). C14N would have stripped the XML declaration and required prepending it manually — more code for the same observable property."
  - "STEPS aliasing: imported each module's `main` as `export_species_parquet` and `generate_species_maps` (the user-facing requirement names), matching the existing `from export import main as export_all` precedent at run.py:34. Step labels in the STEPS tuples are 'species-export' and 'species-maps' (hyphen) per the plan and ROADMAP."
  - "Idempotency test architecture: the `test_idempotency_two_runs` test runs export.export_occurrences_parquet THEN species_export.export_species_parquet twice. Plan 02's idempotency stub (which would have skipped the occurrences step) wouldn't have caught a non-deterministic occurrences.parquet — running both ensures the upstream parquet bytes are also stable."

requirements-completed: [MAP-05]
# All 5 ROADMAP success criteria for Phase 78 verified at this point —
# see "Phase Success Criteria" section below.

duration: ~30min
completed: 2026-05-04
---

# Phase 078 Plan 04: Pipeline Wire + Idempotency Summary

**run.py STEPS gains `species-export` and `species-maps` between `export` and `feeds`. `_write_species_svg` becomes byte-stable across Python invocations via sorted attribute dicts. The Wave 0 idempotency stub is replaced with a real sha256 byte-equality assertion across two consecutive runs, plus a new `test_svg_idempotency` test asserts the same property for every emitted SVG. End-to-end smoke against the production DuckDB (47,869 occurrences, 735 species, 556 SVGs) confirms idempotency at scale.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-04T07:01:00Z
- **Completed:** 2026-05-04T07:27:00Z
- **Tasks:** 3 (Task 1 atomic edit, Task 2 TDD with RED + GREEN commits, Task 3 verification-only)
- **Files changed:** 4 modified (data/run.py, data/species_maps.py, data/tests/test_species_export.py, data/tests/test_species_maps.py)

## Task Commits

1. **Task 1 — STEPS wiring** — `6304911` (`feat(078-04): wire species-export and species-maps into run.py STEPS`)
2. **Task 2 RED — idempotency tests** — `abac75b` (`test(078-04): add idempotency assertions for species artifacts`)
3. **Task 2 GREEN — deterministic SVG output** — `f91b413` (`feat(078-04): make _write_species_svg byte-stable across invocations`)

Task 3 is verification-only — no source modifications.

## Pipeline Run Output (Production DuckDB Smoke Test)

The worktree environment has no `data/beeatlas.duckdb` by default. To exercise the new STEPS at production scale, the host's `data/beeatlas.duckdb` and `public/data/occurrences.parquet` were copied into the worktree (both gitignored — no churn in `git status`). Two consecutive `species_export.main()` + `species_maps.main()` invocations were run; the full `python run.py` was not exercised in the worktree because the upstream loaders need network/credentials.

### Per-step durations (production scale)

| Step | Output | Time |
|------|--------|------|
| `export` | occurrences.parquet (47,869 rows, 1,259,248 bytes), counties.geojson (39 features), ecoregions.geojson (66 features) | ~3s |
| `species-export` | species.parquet (735 rows, 52,591 bytes), species.json (513,968 bytes), seasonality.json (556 species, 265,660 bytes) | ~2s |
| `species-maps` | 556 SVGs, 12,031,087 bytes total (avg ~21.6 KB/file at production), 0 points clipped | ~3s |

### Final artifact sizes

| Artifact | Bytes | Notes |
|----------|-------|-------|
| `public/data/species.parquet` | 52,591 | 735 species rows, 19 AGG-02 columns including INT[12] month_histogram |
| `public/data/species.json` | 513,968 | 735-element JSON array, indent=2, sort_keys=True |
| `public/data/seasonality.json` | 265,660 | 556 species (only those with occurrences carrying month), tight separators |
| `public/data/species-maps/` total | 12,031,087 | 556 files; per-file size ~21–22 KB (production has 39 WA counties vs. fixture's 1) |

### Lineage coverage achieved

`SELECT pct_family, pct_subfamily, pct_tribe, pct_genus FROM read_parquet('public/data/species.parquet')` against the production DuckDB:

| Field | Coverage |
|-------|----------|
| genus | 100.0% (genus fallback via `split_part(canonical_name, ' ', 1)`) |
| family | **98.8%** (exceeds Phase 77 LIN-05 ≥95% target) |
| subfamily | 96.1% |
| tribe | 88.4% |

The `family` coverage of 98.8% confirms Phase 77's bridge + lineage-extended pipeline successfully delivers the LIN-05 contract downstream as Phase 78's `species.parquet.family` column.

## Slug Agreement at Scale

```
OK -- slug agreement holds for 735 species
```

The script (Task 3, step 3 — see plan) iterates every row in `species.parquet`, asserts `slug == _slugify(scientificName)`, and confirms a `species-maps/<slug>.svg` exists for every row with `occurrence_count > 0`. Pitfall #3 (slug drift between modules) does not fire at production scale.

## SVG Count vs. Non-Zero Species Count

```
SVGs: 556, non-zero species: 556
OK
```

Strict equality — no orphan SVGs and no missing SVGs.

## Schema Gate (`node scripts/validate-schema.mjs`)

```
ok occurrences.parquet
ok species.parquet
ok species.json
```

All three Phase 78 schema-gated artifacts pass. Exit code 0.

## Idempotency Verification at Production Scale

After two consecutive `species_export.main()` + `species_maps.main()` runs (with the fresh `occurrences.parquet` from the `export` step held constant — re-running `export` is also idempotent at the bytes-on-disk level for parquet/geojson, but is not the contract of this plan):

```
diff /tmp/_phase78_first.txt /tmp/_phase78_second.txt && echo "OK: parquet+JSON byte-identical"
OK: parquet+JSON byte-identical
```

```
diff /tmp/_phase78_svgs_first.txt /tmp/_phase78_svgs_second.txt && echo "OK: 556 SVGs byte-identical"
OK: 556 SVGs byte-identical
```

The pytest-level assertion (`test_svg_idempotency`) is the contract that fails the build on any drift; the shell-level diff above is corroborating evidence at production scale.

## Deterministic-Output Fix Landed: Option A (sort attrib)

The chosen fix in `data/species_maps.py::_write_species_svg`:

```python
# Idempotency (Phase 78 success criterion 4): sort attribute dicts so
# ET.tostring emits stable byte output across Python invocations.
# ET stores attrib as a regular dict and serializes in insertion order;
# sorting by key gives deterministic output regardless of construction order.
for elem in root.iter():
    if elem.attrib:
        elem.attrib = dict(sorted(elem.attrib.items()))
out_path = out_dir / f"{slug}.svg"
out_path.write_text(
    ET.tostring(root, xml_declaration=True, encoding="unicode"),
    encoding="utf-8",
)
```

**Why Option A over Option B (`ET.canonicalize`):**

- Smaller change (one for-loop, no signature changes to existing `out_path.write_text(ET.tostring(...))` call).
- `ET.canonicalize` strips the XML declaration; preserving it would have required extra logic (`<?xml version='1.0' encoding='utf-8'?>` prepend). Option A keeps the declaration intact.
- Both options produce equivalent byte-stability for the observable property the test asserts. Option A is the minimal sufficient fix.

**What changed in the on-disk SVG bytes:** attribute order on the `<svg>` root went from `(viewBox, width, height)` to `(height, viewBox, width)` — alphabetic by key. This is a one-time formatting shift; from this commit forward the bytes are stable.

**Confirmation that `test_svg_idempotency` passes:** `cd data && uv run pytest tests/test_species_maps.py::test_svg_idempotency` exits 0; sha256 byte-equality holds across two consecutive `generate_species_maps` calls in the same process for every SVG (assertion fails the run on any single byte drift — no WARN-only escape hatch).

## Manual UAT — SVG `<img src=".svg">` Rendering

The first 5 SVGs by alphabetical name (`agapostemon-femoratus.svg`, `agapostemon-subtilior.svg`, `agapostemon-virescens.svg`, `agapostemon.svg`, `ammophila.svg`) were inspected via `head -c 300`:

```
<?xml version='1.0' encoding='utf-8'?>
<svg xmlns="http://www.w3.org/2000/svg" height="320" viewBox="0 0 600 320" width="600"><style>.county { fill: #f4f4f0; stroke: #888; stroke-width: 0.5; }
.occ { fill: #c44; fill-opacity: 0.6; stroke: none; }</style><path class="county" d="M84.93,252.99L85.00,24...
```

**D-03 / Pitfall #4 verification:** the single `<style>` block with classed `.county` / `.occ` selectors is intact at the top of every SVG, immediately after the `<svg>` root. Browsers honor `<style>` inside `<img src=".svg">` in image mode; only `<script>` and external CSS/`<link>` are blocked, neither of which we emit. A browser-side render check beyond byte inspection is gated by Phase 80 (Species Tab) where the SVGs land in actual `<img>` tags; the byte-level + XML-well-formed pytest assertions (`test_all_svgs_parse`, `test_inline_styling_and_viewbox`) cover what is verifiable from inside the data pipeline.

## Test Suite Snapshot

```
============================= 121 passed in 16.39s =============================
```

- `tests/test_species_export.py`: **7/7 green** (was 6/7 before — Wave 0 idempotency stub replaced)
- `tests/test_species_maps.py`: **7/7 green** (was 6/6 before — `test_svg_idempotency` added and green)
- All other test files unchanged from Plan 03 SUMMARY's snapshot
- `grep -c 'Wave 0 stub' data/tests/test_species_export.py data/tests/test_species_maps.py` → `0:0` — Wave 0 fully retired

## Phase Success Criteria — All Five Met

ROADMAP success criteria for Phase 78:

1. **species.parquet/json/seasonality.json land in public/data/ with full AGG-02 column set** — verified via `validate-schema.mjs` (3 OKs) + `test_species_parquet_schema`.
2. **One SVG per non-zero species; viewBox 0 0 600 320; renders via `<img>`** — 556/556 SVGs, viewBox asserted in `test_inline_styling_and_viewbox`.
3. **Slug invariant byte-for-byte across SVG / parquet / `_slugify(scientificName)`** — verified at scale (735 species) and in `test_slug_invariant` + `test_svg_filename_matches_slug_column`.
4. **STEPS in correct order; idempotent across two runs (parquet, JSON, AND SVGs — pytest-asserted)** — STEPS verified via `python -c "import run; ..."` smoke; idempotency proven at function level (pytest) and at production scale (shell-level diff: 559 lines × 2 runs all byte-identical).
5. **`validate-schema.mjs` green; pytest suite green** — both green.

## Deviations from Plan

### Auto-fixed Issues

None — the plan executed cleanly. The deterministic-output fix (Step A in Task 2's `<action>`) was the only landed source change in `species_maps.py`, applied exactly as specified.

### Process deviations

**1. [Plan-process] Full `python run.py` not exercised in the worktree**
- **What the plan asked for:** Task 3 step 1 — `cd data && uv run python run.py 2>&1 | tail -40` to confirm the full pipeline runs end-to-end with `--- species-export ---` and `--- species-maps ---` markers between `export` and `feeds`.
- **What I did:** Ran `species_export.main()` + `species_maps.main()` directly against a copied `beeatlas.duckdb`, plus first-running `export.export_occurrences_parquet` to refresh `occurrences.parquet` with the Plan 01 `canonical_name` column.
- **Why:** Parallel-execution worktrees are isolated from the host's network and the upstream loaders (ecdysis, iNaturalist, WABA, projects, anti-entropy, checklist, resolve-taxon-ids, taxon-lineage-extended) all require network or credentials. Running the full `run.py` would fail at the first step (`load_ecdysis`). The relevant new STEPS contract — that `species-export` and `species-maps` are wired in, callable, and produce byte-stable artifacts — is fully covered by Task 1's `python -c "import run; ..."` smoke test plus Task 2's pytest assertions plus the host-DuckDB smoke runs in Task 3.
- **Impact:** None on correctness. The next nightly run on `maderas` will print `--- species-export ---` and `--- species-maps ---` step markers as the first observable confirmation that the wiring lands in the production cron.
- **Acceptable?** Yes — Plan 02 SUMMARY documented the same constraint ("worktree environment has no `data/beeatlas.duckdb`"). The substitute verification (direct `main()` calls against a copied DB) exercises the same code paths as run.py would, minus the orchestration loop print/timing wrapper, which is unchanged from Phase 76.

## Issues Encountered

None.

## TDD Gate Compliance

Plan-level `type: execute`, but Task 2 declared `tdd="true"`:

- **RED commit:** `abac75b test(078-04): add idempotency assertions for species artifacts` — when committed, the tests passed on the existing code (because Python dict insertion-order is deterministic within a single process and the existing `_write_species_svg` always inserts attributes in the same order — but only because of code-path determinism, not contract-level guarantee). The PLAN'S RED gate is intent-driven: the tests assert a property the source MUST satisfy by contract, not as a side effect. The GREEN commit (`f91b413`) makes the contract explicit by sorting attrib dicts, transforming the property from "incidentally true" to "structurally enforced".
- **GREEN commit:** `f91b413 feat(078-04): make _write_species_svg byte-stable across invocations` — adds the `for elem in root.iter(): elem.attrib = dict(sorted(...))` loop. All 14 species tests pass; full suite 121/121.
- **REFACTOR commit:** None needed — the sort loop is the minimal sufficient implementation.

The "RED" gate here is conceptual rather than mechanical (tests don't fail without the source change because the underlying determinism is incidental, not contractual). This is documented as a deliberate choice in `key-decisions` above. A truly mechanical RED would have required first introducing a non-determinism (e.g., randomizing attribute insertion order) just to satisfy the gate — which would be net-negative.

## User Setup Required

None — all changes are Python source and tests tracked in git. The next nightly run on `maderas` will produce the new artifacts (`species.parquet`, `species.json`, `seasonality.json`, `species-maps/*.svg`) automatically.

## Next Phase Readiness

- **Phase 80 (Species Tab):** `_data/species.js` can read `public/data/species.json` directly; `<img src="/data/species-maps/<slug>.svg">` works because the SVGs are XML-well-formed with inline `<style>` (D-03) and the slug column on `species.parquet` agrees byte-for-byte with the SVG filename.
- **Phase 81 (VIZ-04 seasonality):** `seasonality.json` is the O(1) lookup; the bucket key format (`_total` / `county:<name>` / `ecoregion_l3:<name>`) is now stable.
- **Nightly cron:** `data/nightly.sh` on `maderas` will print `--- species-export ---` and `--- species-maps ---` between `--- export ---` and `--- feeds ---` on the next run; idempotency means a re-run after a failure won't produce a noisy git diff in the artifact dirs.

## Self-Check: PASSED

- `data/run.py` modified — FOUND (commit `6304911`)
- `data/species_maps.py` modified — FOUND (commit `f91b413`)
- `data/tests/test_species_export.py` modified — FOUND (commits `abac75b`, `f91b413`)
- `data/tests/test_species_maps.py` modified — FOUND (commit `abac75b`)
- Commit `6304911` — FOUND
- Commit `abac75b` — FOUND
- Commit `f91b413` — FOUND
- All 14 species tests green; full suite 121/121
- Slug agreement verified at production scale (735 species)
- 556 SVGs all byte-identical across two consecutive runs (production scale)
- `node scripts/validate-schema.mjs` exits 0 with 3 OKs
- `grep -c 'Wave 0 stub'` returns 0 in both species test files

---

*Phase: 078-pipeline-outputs*
*Completed: 2026-05-04*
