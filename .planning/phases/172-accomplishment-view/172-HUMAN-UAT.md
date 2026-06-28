# Phase 172 — Accomplishment View: Operator UAT

**Phase:** 172-accomplishment-view
**Gate:** blocking human-verify (UI hint: yes — `feedback_uat_ui_phases`)
**Prepared:** 2026-06-28

## Status: ✅ PASS (UAT round 2, 2026-06-28) — operator approved after gap-closure

Round 1 issues (below) all fixed in two gap-closure passes (GC1 export-correctness, GC2 shared-base-map redesign) and re-verified on the rendered page; operator approved 2026-06-28. The empty local "collection history" observed during re-review was a local two-step-regen artifact (only `collectors_export.py` was run, not `collectors_events_export.py`) — not a phase defect; production fine. See memory `project_local_collector_data_two_step_rebuild`.

### Round-2 verification (rendered `/collectors/rainhead/`)
- Badge "Active since 2024 (3 seasons)" ✓ (was "2 seasons" — predicate now `tier='atlas'`, counts uncatalogued specimens)
- Cased binomials "Agapostemon femoratus" linked to `/species/Agapostemon/femoratus/` ✓; no `(N)` count
- Shared base maps inlined + per-collector `[data-region]` CSS highlight; ecoregion partial 17 KB (was ~1.3 MB/collector)
- `npm run build` clean; 281 pytest + 897 vitest green

### Round-2 addendum (post-approval correction)
Operator: "you dropped the specimen counts." The earlier round-1 question ("why is the specimen count in parentheses?") was about clarity, not deletion — the count should stay. Restored the per-species count (atlas records of each species) rendered as **"— N specimens"** (operator chose the explicit unit over the bare parenthetical via a format question). Commit `6c053e3a`. Verified rendered: "Agapostemon femoratus — 1 specimen", "Agapostemon subtilior — 4 specimens". 12 pytest + 897 vitest green, build clean.

---

## Round 1 (superseded)
## Status: ❌ ISSUES FOUND (UAT round 1) — gap-closure (done)

**Operator:** rainhead, 2026-06-28. Tested `/collectors/rainhead/`.

### Issues
1. **Badge undercounts seasons.** Showed "Active since 2024 (2 seasons)"; operator collected 2024/2025/2026 = 3. Root cause: the aggregation predicate keys on `ecdysis_id`, dropping atlas specimens collected-but-not-yet-catalogued (`record_type='specimen'`, `tier='atlas'`, `ecdysis_id IS NULL` — 24 rows in 2026, 7 in 2024). Fix: use the Phase 170 `tier='atlas'` facet for all four aggregations.
2. **Species names lowercased** ("agapostemon femoratus"). Export used lowercase `canonical_name`; must use cased `genus` + `scientificName`.
3. **Unexplained `(N)` per-species count** — remove it (was discretionary).
4. **Ecoregion SVGs too heavy** (~1.3 MB each) — operator approved aggressive simplification.
5. **Map delivery redesign** — operator: "reuse the same map every time and color the regions differently per collector." Replace 248 per-collector SVG files (122 MB) with one shared base map inlined per page + a per-collector CSS highlight (static, no JS).

---

## Setup already done (by the chain)

- Local `collectors.json` regenerated from the current `public/data/occurrences.parquet` (Jun 27): **124 collectors**, all five new fields present (`active_since`, `seasons_count`, `county_count`, `ecoregion_count`, `species_by_genus`).
- Local `public/data/collector-maps/` regenerated: **124 collectors × 2 SVGs** (county + ecoregion).
- Both are gitignored (S3-delivered) — regenerated only to enable local preview.
- Full automated suite GREEN through Wave 2: `npm test` 896, `pytest -m "not integration"` 271, `npm run build` GREEN.

## How to preview

```bash
npm run dev      # or: npm run build && serve the output
# then open:
#   /collectors/swisschick/   (24 counties, 7 ecoregions, 5318 specimens, since 2023, 3 seasons, 224 species)
#   /collectors/rainhead/     (17 counties, 7 ecoregions, since 2024, 2 seasons)
```

## Checklist (per ROADMAP success criteria + D-01..D-06)

- [ ] **Badge (ACCOM-04/D-05):** "Active since YYYY (N seasons)" — correct earliest year, plausible distinct-season count, no streak/rank wording.
- [ ] **County map (ACCOM-01/D-02):** filled counties match the collector's actual records; blank elsewhere; "N counties" caption correct.
- [ ] **Ecoregion map (ACCOM-03/D-03):** correct ecoregions filled; **required "N ecoregions" caption** present + correct.
- [ ] **Species list (ACCOM-02/D-04):** grouped under italic genus headings, genera + species alphabetical, each `/species/{slug}/` link resolves, per-species counts plausible.
- [ ] **Layout:** two maps side-by-side ≥768px, stacked below; existing headline stats / status split / atlas link / event feed unchanged.

## Watch items flagged during prep

- **Ecoregion SVG weight:** ~1.3 MB each (county SVG ~71 KB). EPA L3 polygons not simplified as aggressively as counties. Visually correct but heavy as an `<img>`. Candidate follow-up: increase ecoregion `ST_SimplifyPreserveTopology` tolerance in the generator. Non-blocking unless you judge otherwise.

---

## Operator Verdict

**Collector(s) tested:**
**Result (PASS / issues):**
**Notes:**
