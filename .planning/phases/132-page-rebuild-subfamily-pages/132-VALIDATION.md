---
phase: 132
slug: page-rebuild-subfamily-pages
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-02
---

# Phase 132 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (data pipeline) + dbt build/tests + vitest (JS) |
| **Config file** | `data/pyproject.toml`, `data/dbt/`, `vitest.config.*` |
| **Quick run command** | `cd data && uv run pytest <targeted test>` / `bash data/dbt/run.sh build --select <model>` / `npm test -- <name>` |
| **Full suite command** | `bash data/dbt/run.sh build && cd data && uv run pytest && cd .. && npm test && npm run build` |
| **Estimated runtime** | dbt build + pytest ~2-4 min; npm test + build ~1-2 min |

---

## Sampling Rate

- **After every task commit:** targeted `uv run pytest <file>` / `dbt build --select <model>` / `npm test -- <name>`
- **After every plan wave:** full suite command above
- **Before `/gsd:verify-work`:** full suite green; `bash data/dbt/run.sh build` passes the contract gate; `npm run build` succeeds
- **Max feedback latency:** ≤ 4 min (single full suite run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 132-01 | 1 | PAGE-01, PAGE-04 | T-132-03, T-132-04 | higher-rank names resolve to ancestor taxon_id (Anthophila only); unique (name,rank) | pytest + dbt | `cd data && uv run pytest tests/test_higher_taxa.py -x` ; `bash data/dbt/run.sh build --select stg_inat__higher_rank_taxon_ids` | ❌ Wave 0 | ⬜ pending |
| 01-T2 | 132-01 | 1 | PAGE-01, PAGE-04 | T-132-01, T-132-02 | rollup counts = per-species sums; 12 subfamilies; no Eumeninae; checklist species included | pytest + dbt test | `bash data/dbt/run.sh build --select higher_taxa && bash data/dbt/run.sh test --select higher_taxa && cd data && uv run pytest tests/test_higher_taxa.py -x` | ❌ Wave 0 | ⬜ pending |
| 02-T1 | 132-02 | 2 | PAGE-03 | T-132-05 | full-URL collision hard-fails; Bombus genus/subgenus no false alarm | pytest | `cd data && uv run pytest tests/test_species_export.py -x -k collision` | ✅ partial | ⬜ pending |
| 02-T2 | 132-02 | 2 | PAGE-01, PAGE-03 | T-132-06, T-132-07 | higher_taxa.json emitted; old builder retired; collision gate wired | pytest | `cd data && uv run pytest tests/test_species_export.py -x` | ❌ Wave 0 | ⬜ pending |
| 02-T3 | 132-02 | 2 | PAGE-01 | T-132-06, T-132-07 | artifact wired to nightly S3/manifest + fetch + local manifest | shell/node lint | `bash -n data/nightly.sh && node --check scripts/make-local-manifest.js && bash -n scripts/fetch-data.sh` | ✅ | ⬜ pending |
| 03-T1 | 132-03 | 2 | PAGE-02 | T-132-08, T-132-09, T-132-10 | 12 subfamily SVGs; no Eumeninae; by-genus single-color | pytest | `bash data/dbt/run.sh build --select higher_taxa species && cd data && uv run pytest tests/test_species_maps.py -x` | ❌ Wave 0 | ⬜ pending |
| 04-T1 | 132-04 | 3 | PAGE-01, PAGE-02, PAGE-04 | T-132-11, T-132-12, T-132-14 | species.js reads rollup; subfamilyList len 12 / no Eumeninae / taxon_id; nested+flat; hexColor match | vitest | `npm test -- data-species` | ❌ Wave 0 | ⬜ pending |
| 04-T2 | 132-04 | 3 | PAGE-02, PAGE-04 | T-132-11, T-132-15 | 12 subfamily pages build; nested/flat; checklist branch preserved | build | `npm run build && ls _site/species/subfamily/ \| wc -l` | ✅ | ⬜ pending |
| 04-T3 | 132-04 | 3 | PAGE-01, PAGE-02, PAGE-03, PAGE-04 | T-132-13, T-132-14, T-132-15 | 5-taxa baseline spot-check; layout; swatch↔dot; checklist treatment | human-verify | manual (see plan 132-04 Task 3) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Created as the first task of the owning plan (RED-before-GREEN), not a separate plan:

- [ ] `data/tests/test_higher_taxa.py` (Plan 01 Task 1) — count-equivalence spot-check vs RESEARCH baselines (Andrena 3589/2735, Bombus 1768/7763, Megachile 1186/480, Lasioglossum 1718/115, Osmia 1110/450, Nomada 565/616; tribes Bombini/Andrenini/Osmiini; subgenus Bombus/Pyrobombus 1465); no Eumeninae; 12 subfamilies; checklist-only membership; rollup==per-species sums.
- [ ] `data/dbt/models/marts/schema.yml` (Plan 01 Task 2) — enforced `higher_taxa` contract; `data/dbt/models/staging/schema.yml` (Plan 01 Task 1) — unique (name,rank) on staging view.
- [ ] `data/tests/test_species_export.py` new cases (Plan 02 Tasks 1-2) — synthetic collision raises; Bombus genus/subgenus non-collision; clean real data; higher_rank_taxon_ids.json retired; 12-subfamily emission.
- [ ] `data/tests/test_species_maps.py` new cases (Plan 03 Task 1) — 12 subfamily SVGs; no Eumeninae.svg; by-genus single-color in an Apinae SVG.
- [ ] `src/tests/data-species.test.ts` new cases (Plan 04 Task 1) — subfamilyList length 12; no Eumeninae; non-null taxon_id; nested vs flat shapes; genusList taxon_id from rollup; hexColor sequence matches hslToHex over sorted genera.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Subfamily page renders nested tribes→genera with by-genus map swatches; swatch↔dot color correspondence | PAGE-02 | Visual layout + color perception | Plan 132-04 Task 3, steps 1-2 |
| Rebuilt genus/tribe totals match pre-normalization baselines on rendered pages | PAGE-01 | Cross-checks data through the full render path | Plan 132-04 Task 3, step 3 (5 taxa) |
| Checklist-only species grey-swatch / "N checklist records" treatment unchanged | PAGE-04 | Visual regression | Plan 132-04 Task 3, step 4 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Task 04-T3 is the sole human-verify, paired with automated 04-T1/T2)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency target set (≤ 4 min)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (pending execution)
