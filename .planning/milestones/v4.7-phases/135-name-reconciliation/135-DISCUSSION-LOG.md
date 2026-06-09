# Phase 135: Name Reconciliation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 135-name-reconciliation
**Areas discussed:** Authority scope, Auto-apply vs curator-promote line, Blocking-gate semantics, Slash-compound LCA, Resolver integration & cache, Audit CSV confidence

---

## Authority scope (external tier)

| Option | Description | Selected |
|--------|-------------|----------|
| GBIF only | pygbif against GBIF backbone as sole external authority; no ITIS | ✓ |
| GBIF, then ITIS fallback | GBIF first, ITIS for GBIF misses | |
| GBIF + curator gap-fill | GBIF only automated; misses to curator CSV | |

**User's choice:** GBIF only.
**Notes:** ITIS used nowhere today; only pygbif added in 134. → D-01.

---

## Auto-apply vs curator-promote line

| Option | Description | Selected |
|--------|-------------|----------|
| Only exact + seed auto-apply | exact + synonym seed live; GBIF + all fuzzy promote-only | ✓ |
| Also auto-apply GBIF exact-name | exact + seed + GBIF exact-name live; only fuzzy promote-only | |
| Only exact auto-applies | strictest; even seed re-confirmed | |

**User's choice:** Only exact + seed auto-apply.
**Notes:** Matches ROADMAP human-review-gate wording. Promotion = edit occurrence_synonyms.csv. → D-02, D-03.

---

## Blocking-gate semantics (reconciles with promote-line)

| Option | Description | Selected |
|--------|-------------|----------|
| Block only on no-match-anywhere | GBIF/fuzzy hits = resolved-pending-promotion, satisfy gate | ✓ |
| Block until every name LIVE-resolved | must promote all GBIF before green | |
| Block on no-match, fail-fast on fuzzy-only | also block names whose only candidate is fuzzy | |

**User's choice:** Block only on no-match-anywhere.
**Notes:** First chose "block the build" for unresolved (over the warn+report recommendation); the reconciling follow-up clarified GBIF/fuzzy candidates satisfy the gate and wait for unhurried curation. → D-04.

---

## Slash-compound LCA (77 Agapostemon rows)

| Option | Description | Selected |
|--------|-------------|----------|
| Genus LCA, keep verbatim | resolve to genus LCA taxon_id; detail card keeps verbatim; filterable at genus | ✓ |
| Genus LCA, drop verbatim | resolve to genus, treat as plain genus record | |
| Exclude slash-compounds from points | tag and keep out of occurrences | |

**User's choice:** Genus LCA, keep verbatim.
**Notes:** LCA via taxa.csv.gz ancestry; cross-genus pairs generalize. → D-05.

---

## Resolver integration & committed cache

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse bridge + --refresh build | extend resolve_taxon_ids.py bridge; GBIF baked into committed seed CSV | ✓ |
| Separate module + committed .duckdb | dedicated module, binary .duckdb cache in git | |
| You decide (within offline constraint) | leave to planner | |

**User's choice:** Reuse bridge + --refresh build.
**Notes:** "Committed DuckDB cache" (SC#3) realized as a committed seed CSV, not a binary .duckdb. → D-06, D-07.

---

## Audit CSV confidence representation

| Option | Description | Selected |
|--------|-------------|----------|
| Tier-derived + raw score | exact/seed=1.0; GBIF=matchType/confidence; fuzzy=rapidfuzz score | ✓ |
| Categorical only | high/medium/low by tier | |
| You decide | leave to planner | |

**User's choice:** Tier-derived + raw score. → D-08.

---

## Claude's Discretion

- Homonym-guard dbt test mechanism (RCN-07); fuzzy-review-gate enforcement mechanism (RCN-04); audit/review CSV column names; resolver function decomposition; LCA computation details from taxa.csv.gz.

## Deferred Ideas

- Test-suite improvements milestone (`.planning/seeds/test-suite-improvements.md`) — relevant because 135 edits resolve_taxon_ids.py, but fixes belong to the dedicated milestone.
- ITIS / Catalogue of Life — out per D-01.
- Frontend verbatim-vs-accepted display + source color — Phase 138 (UIX-01/03).
- Checklist rows into occurrences.parquet — Phase 137 (PRO-01).
