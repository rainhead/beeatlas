---
name: Datalog data-quality evaluator
description: Standalone Racket Datalog tool that reads the atlas DB and emits a discrepancy report; beeatlas needs are the constructive constraints
type: project
trigger_condition: When ready to start the standalone evaluator project, or when beeatlas needs automated data-quality / discrepancy detection beyond ad-hoc checks
planted_date: 2026-06-06
---

A small Datalog evaluator written in **Racket** that expresses and runs data-quality
checks against the atlas's SQLite/DuckDB database. It is a **standalone tool** with
its own goals and lifecycle — **not** a beeatlas milestone. It ingests facts from the
database, runs rules to a fixed point, and produces a discrepancy report. The Python
pipeline is unchanged and remains the source of the database; the evaluator reads it
at the boundary and stays pure inside.

beeatlas.net's real data-quality needs supply the **constructive constraints** that
focus the project's effort.

## Why this matters

Two motivations, deliberately coupled:

1. **Practical** — the atlas has concrete, expressible data-quality failure modes that
   no automated check currently catches. Immediate targets named in the design note:
   - duplicate sample IDs per collector per day
   - observations outside the atlas state boundary
   - bee/flower misclassification
2. **Learning** — hands-on Datalog evaluation (bottom-up semi-naive, stratified
   negation, first-class provenance) as a foundation for a larger declarative-computing
   vision. Racket is chosen over Python specifically so the tool can grow toward a
   `#lang` if it ever becomes a language rather than a library.

## Key commitments (from the design note)

- Bottom-up (semi-naive) evaluation to a fixed point.
- Facts and rules are the core data structures (Racket structs / s-expressions; `match`-driven rule application).
- Stratified negation expected; evaluate strata in dependency order.
- **Provenance is first-class**, designed in from the start even if not implemented immediately.
- Dataset is closed and immutable during evaluation — no temporal/incremental complexity for now.

## What this is not

Not a general-purpose language, not performance-optimized for large datasets, not a
full ASP system. IO lives only at the boundary (read SQLite, write report); core stays
pure. Code is not expected to be long-lived.

## Scope

A full standalone project of its own, not a beeatlas phase. When started, spin it up as
a **separate project** rather than a beeatlas milestone. The beeatlas-side task only
materializes if/when its discrepancy reports should feed back into the atlas pipeline
or site.

## Breadcrumbs

- Design note: `~/bee-atlas-evaluator-design-note.md` (full purpose, commitments, tooling, references — committed outside this repo)
- References named in the note: Racket `datalog` package; Soufflé (souffle-lang.github.io) for semantics + provenance model
- Atlas DB the evaluator would read: `data/beeatlas.duckdb` (local), nightly SQLite/parquet exports under `public/data/`
- Adjacent confidence-in-data work from a different angle: the [[test-suite-improvements]] seed (now v4.8) and the `data-test-suite-environmental-deps` todo
