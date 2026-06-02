---
phase: 129-hierarchy-foundation
plan: 03
status: partial
created: 2026-06-02
benchmark_pending: true
---

# Phase 129: Hierarchy Foundation — Verification

> Pipeline-only phase. Evidence gathered 2026-06-02 against live data from the Phase 02 implementation.
> Benchmark (Section 2) requires manual Firefox/wa-sqlite run — recorded after the checkpoint.

---

## Section 1: Structure Decision

**Structure chosen:** Materialized path (`lineage_path` column, `instr()` descendant queries)

**Justification:** Per D-02, materialized path is the default. The structure uses the `ancestry` column already present in `taxa.csv.gz` — near-zero build cost. Switch to nested-set (lft/rgt) only on a clear benchmark failure.

**D-04 scoping note:** The shipped `occurrences.db` taxa table holds only the observed+checklist subtree + ancestors. The STACK.md ~110ms worst-case estimate was computed for a full-clade load of ~17,343 rows; the actual shipped table is 940 rows (see Section 6). The STACK.md math does not apply to the small shipped table. The benchmark (Section 2) is a sanity check confirming D-03, not a tight gate.

_Benchmark result: see Section 2 (pending manual Firefox run)._

---

## Section 2: wa-sqlite Apidae Descendant Query Benchmark

**Status:** PENDING — requires manual Firefox run at the checkpoint.

**Query:** `SELECT taxon_id FROM taxa WHERE taxon_id = 47221 OR instr(lineage_path, '/47221/') > 0`

**Expected:** Apidae subtree (D-04-scoped) — 239 rows (see Section 6). This is far smaller than the global ~4,959 Apidae descendants; the STACK.md ~110ms (17K-row) estimate does not apply.

_To be filled in after the checkpoint:_

| Field | Value |
|-------|-------|
| Elapsed (ms) | — |
| Rows returned | — (expected 239, D-04-scoped) |
| Browser + version | — |
| Device class | — |
| Decision | — (keep materialized path / flag nested-set follow-up) |

---

## Section 3: Complex-rank Occurrence Count

**Complex-rank occurrences (current data):** 0

_Query: `SELECT COUNT(*) FROM occurrences o JOIN taxa t ON o.taxon_id = t.taxon_id WHERE t.rank = 'complex'`_

**Complex-rank taxa in the shipped hierarchy:** 29

_Query: `SELECT COUNT(*) FROM taxa WHERE rank = 'complex'`_

**D-04 scoping note:** The global count of complex taxa in `taxa.csv.gz` is 148. The shipped hierarchy holds only 29 complex taxa because it is constrained to observed+checklist+ancestors only per D-04 — this is the observed+checklist subtree, not the full active-Anthophila set.

**Interpretation for HIER-06:** 0 complex-rank occurrences in current data. Complex taxa are hierarchy-resident, name-resolving, and filterable (per D-01). No complex occurrences exist today; this is the count as evidence.

---

## Section 4: Bycatch Occurrence/Species Count + PAGE-05 Decision

**Bycatch taxa (is_anthophila=0) in hierarchy:** 106

_Query: `SELECT COUNT(*) FROM taxa WHERE is_anthophila = 0`_

**Bycatch occurrence rows:** 2,020

_Query: `SELECT COUNT(*) FROM occurrences WHERE taxon_id IN (SELECT taxon_id FROM taxa WHERE is_anthophila = 0)`_

**Note:** These match the RESEARCH.md expected values (106 distinct bycatch taxon_ids, 2,020 rows).

**PAGE-05 decision:** DROPPED per D-01. Complex pages are out of scope for v4.6. Complex-rank nodes are hierarchy-resident, name-resolving, and filterable; they deep-link to a filtered map view rather than a dedicated page. The 0 complex-rank occurrences confirm there is no occurrence-volume pressure to reconsider. PAGE-05 is recorded as dropped here for the HIER-06 record.

---

## Section 5: Zero-Orphan / Missing-Parent Confirmation

**Orphan occurrence taxon_ids (must be 0):** 0

_Query: `SELECT COUNT(*) FROM occurrences WHERE taxon_id IS NOT NULL AND taxon_id NOT IN (SELECT taxon_id FROM taxa)`_

**Missing-parent lineage_path segments:** 0

_Confirmed by `_assert_no_orphan_taxon_ids()` passing without exception during the live `sqlite_export.py` run._

**Result:** The post-build nightly gate assertion passed. All non-null occurrence taxon_ids resolve to a taxa row, and all Anthophila lineage_path segments reference taxa rows that exist.

**Note (Rule 1 auto-fix applied during build):** The initial build fired the missing-parent assertion for 6 `subtribe` taxon_ids (572163, 572165, 1597677, 1597678, 1597681, 1671673). These are subtribe ancestor nodes that appear in the lineage_path of observed species but were excluded by the PASS 1 rank filter. The rank filter was extended to include `'subtribe'` in `sqlite_export.py`. The 6 subtribes are now included in the taxa table, and all 14 tests still pass. After the fix, the zero-orphan assertion passes.

---

## Section 6: occurrences.db Size + Total Taxa Row Count + D-04 Scoping Evidence

**occurrences.db before (prior build, pre-taxa-table):** 26.53 MB

**occurrences.db after (with taxa table):** 26.72 MB

**Delta:** +0.19 MB (taxa table + indexes)

**Total taxa rows:** 940

_Query: `SELECT COUNT(*) FROM taxa`_

**Taxa rank breakdown:**

| Rank | Count |
|------|-------|
| species | 634 |
| subgenus | 114 |
| genus | 89 |
| complex | 29 |
| family | 24 |
| tribe | 22 |
| subfamily | 13 |
| order | 7 |
| subtribe | 6 |
| superfamily | 1 |
| suborder | 1 |
| **Total** | **940** |

**Anthophila (is_anthophila=1):** 834 rows  
**Bycatch (is_anthophila=0):** 106 rows

**D-04 scoping note:** The 940 total taxa rows confirm the artifact is intentionally small. The global active-Anthophila set is ~17,343 taxa; the global Apidae subtree is ~4,959. The shipped table holds only:
- (a) every `taxon_id` referenced by occurrences (bees AND non-bee bycatch), and
- (b) every checklist bee species, including zero-occurrence ones (per D-04)
- plus all their ancestors up to Anthophila root (630955)

The result (940 rows) is well within the expected "hundreds–low-thousands" range. The STACK.md ~110ms worst-case instr() scan estimate (computed for ~17K rows) does not apply to this shipped table.

**Apidae descendants (D-04-scoped):** 239 rows

_Query: `SELECT COUNT(*) FROM taxa WHERE taxon_id = 47221 OR instr(lineage_path, '/47221/') > 0`_

(Global Apidae subtree count would be ~4,959; the D-04-scoped count is 239.)

---

## Verification Checklist

- [x] Section 3: complex-rank occurrence count recorded (0)
- [x] Section 3: complex-rank taxa count in hierarchy recorded (29, D-04-scoped)
- [x] Section 4: bycatch taxa count recorded (106)
- [x] Section 4: bycatch occurrence rows recorded (2,020)
- [x] Section 4: PAGE-05 dropped per D-01 recorded
- [x] Section 5: zero-orphan confirmation (0 orphans, assertion passed)
- [x] Section 6: occurrences.db before/after size recorded (26.53 MB → 26.72 MB)
- [x] Section 6: total taxa row count recorded (940)
- [x] Section 6: D-04 scoping documented (observed+checklist+ancestors only, not full active-Anthophila)
- [ ] Section 1: structure decision finalized (pending benchmark)
- [ ] Section 2: benchmark result recorded (pending Firefox/wa-sqlite run)

---

*Phase: 129-hierarchy-foundation*
*Data gathered: 2026-06-02*
