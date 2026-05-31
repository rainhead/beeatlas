# Phase 126: Taxon IDs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 126-taxon-ids
**Areas discussed:** Non-null guarantee policy, Occurrence taxon_id semantics, iNat link presentation
**Areas offered but not selected:** Contract & invariant update (handled as Claude's discretion)

---

## Non-null guarantee policy

### Q1 — Behavior when a future name fails to resolve

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-fail the build | taxon_id NOT NULL in contract; unresolved name aborts the build and blocks the nightly ship until a human fixes it | ✓ |
| Exclude unresolved rows | Drop unresolvable species/occurrences with a logged count; data keeps flowing but records go silently invisible | |
| Sentinel value | Backfill 0/-1 so column is non-null; link points nowhere, needs template guarding | |

**User's choice:** Hard-fail the build
**Notes:** Aligns with the project's contract-enforced-at-build culture. Accepted tradeoff: nightly freshness coupled to iNat resolution.

### Q2 — How the hard-fail surfaces to the nightly operator

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-build resolution gate | Resolve before dbt build; offenders → lineage_unresolved.csv + non-zero exit with clear message; NOT NULL is the backstop | ✓ |
| dbt contract only | Rely solely on the constraint-violation error; operator greps failing rows manually | |
| You decide | Let researcher/planner choose the enforcement point | |

**User's choice:** Pre-build resolution gate
**Notes:** Operator (user) diagnoses nightly failures at the log on maderas — fail-fast + named cause + pointer to the fix.

---

## Occurrence taxon_id semantics

### Q1 — What occurrences.taxon_id represents + WABA arm sourcing

| Option | Description | Selected |
|--------|-------------|----------|
| Species-rollup, consistent | occurrences.taxon_id == species.taxon_id via synonymized canonical_name; WABA derives a canonical_name and resolves through the same bridge | ✓ |
| WABA uses its own taxon__id | ecdysis/inat_obs via canonical_name; WABA uses waba.taxon__id directly (may be finer rank, won't always match a species row) | |
| You decide | Let researcher/planner pick based on WABA staging contents | |

**User's choice:** Species-rollup, consistent
**Notes:** Consistency over convenience; an occurrence must map cleanly to its species page. Flagged RD-01 (synonymy join consistency) and RD-03 (WABA derivation feasibility) as research dependencies rather than re-asking.

---

## iNat link presentation

### Q1 — Placement and label on the species page

| Option | Description | Selected |
|--------|-------------|----------|
| Action link near atlas link | Sibling to "View N records on the atlas →", reading "View on iNaturalist →" | ✓ |
| Inline on metadata line | Compact "· iNaturalist ↗" appended to metadata/attribution area | |
| You decide | Let planner place it given template structure | |

**User's choice:** Action link near atlas link ("View on iNaturalist →")
**Notes:** Groups the two outbound cross-reference actions together.

### Q2 — Scope across taxon ranks

| Option | Description | Selected |
|--------|-------------|----------|
| Species pages only | Match TID-03 exactly; higher ranks deferred | |
| All taxon ranks | Add link to genus/subgenus/tribe pages too, using self-row taxon_id from taxon_lineage_extended | ✓ |

**User's choice:** All taxon ranks
**Notes:** Explicit scope expansion beyond TID-03. Depends on RD-02 — subgenus/tribe self-row taxon_id availability is unconfirmed (genus/family confirmed).

---

## Claude's Discretion

- **Contract & invariant update** (offered, not selected for discussion): column-count bump (species 19→20, occurrences 36→37) and correcting the stale CLAUDE.md "30-column" note. Captured as D-07/D-08.
- taxon_id column placement within each mart SELECT/schema.
- INTEGER cast at the mart boundary (lineage uses BIGINT).
- Where the pre-build gate lives (resolve_taxon_ids.py vs run.py vs dbt pre-hook).

## Deferred Ideas

None — discussion stayed within scope. The genus/subgenus/tribe link extension was folded into scope (D-06) rather than deferred.
