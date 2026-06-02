# Phase 129: Hierarchy Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 129-Hierarchy Foundation
**Areas discussed:** Complex-page policy, Structure & benchmark bar, Bycatch name display, Checklist-only coverage

---

## Complex-page policy

| Option | Description | Selected |
|--------|-------------|----------|
| Decide after seeing count | Report count in VERIFICATION.md, decide then; don't commit milestone yet | |
| Hard threshold now | Pages generated in Phase 132 iff complex occurrences > threshold (e.g. >50) | |
| Defer regardless | NO dedicated complex pages this milestone; complex nodes deep-link to filtered map | ✓ |

**User's choice:** Defer regardless
**Notes:** Complex ranks stay hierarchy-resident and filterable; PAGE-05 dropped from v4.6. Phase 129 still reports the complex-rank count to satisfy HIER-06, but the number does not reopen the decision. Simplifies Phase 132.

---

## Structure & benchmark bar

### Q1 — structural prior

| Option | Description | Selected |
|--------|-------------|----------|
| Default to materialized path | Bias to lineage_path + instr() (ancestry already in source); switch only on clear failure | ✓ |
| Default to nested-set | Bias to lft/rgt for worst-case safety; accept extra build step | |
| Pure benchmark, no prior | Build both, let numbers alone decide | |

**User's choice:** Default to materialized path

### Q2 — benchmark bar / borderline tiebreaker

| Option | Description | Selected |
|--------|-------------|----------|
| 50ms hard, MP if under | Keep <50ms hard gate; ship MP under it, nested-set at/over | |
| Perceptual, ~100ms tolerance | Real bar is "imperceptible during filter" (~100ms); MP wins unless clearly sluggish | ✓ |
| Strict — nested-set if any doubt | Switch to nested-set if >30ms or noisy | |

**User's choice:** Perceptual, ~100ms tolerance
**Notes:** Supersedes ROADMAP Phase 129 Success Criterion #2's "<50 ms" wording. Benchmark still runs and is documented (HIER-03) but functions as a sanity check, not a tight gate. Switch to nested-set only on clear sluggishness on a mid-range device.

---

## Bycatch name display

| Option | Description | Selected |
|--------|-------------|----------|
| Finest available rank | species → genus → family; no information loss | ✓ |
| Capped at genus | Cap at genus matching Phase 128 Animalia backfill | |
| Generic 'non-bee' label | Generic label / family only | |

**User's choice:** Finest available rank
**Notes:** Two-pass bycatch load must store each referenced bycatch taxon_id at its own rank/name, not roll up to genus. Bycatch keeps is_anthophila = 0 and no bee-only surface presence.

---

## Checklist-only coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Occurrences + checklist | Occurrence taxa (bees + bycatch) + all checklist bee species incl. zero-occurrence | ✓ |
| Occurrences only | Only taxa with actual occurrence points | |
| All active Anthophila | Every active bee taxon from taxa.csv.gz | |

**User's choice:** Occurrences + checklist
**Notes:** Preserves existing "checklist only" page/tree treatment from v4.0. Excludes the full active-Anthophila set to keep the shipped artifact small.

---

## Claude's Discretion

- Exact table shape (single materialized-path table vs taxon_hierarchy + taxon_closure) — follows from the materialized-path default (D-02); resolve per ARCHITECTURE.md vs STACK.md schema divergence.
- Bee-only flag name (`is_anthophila` vs `is_bee`) and orphan-assertion mechanism — requirements lock the hard-fail behavior; implementation is open.
- Two-pass load mechanics (Anthophila via existing taxa_pipeline.py approach; bycatch via targeted ancestry walk).

## Deferred Ideas

- Dedicated complex pages (PAGE-05) — dropped from v4.6; complex-rank count in VERIFICATION.md is starting evidence for any future milestone.
- Floral host hierarchy — out of milestone scope.
- Non-bee taxa in tree/autocomplete — bycatch resolves names only.
