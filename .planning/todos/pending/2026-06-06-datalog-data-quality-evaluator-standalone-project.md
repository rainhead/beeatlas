---
created: 2026-06-06T17:36:56.812Z
title: Datalog data-quality evaluator (standalone project)
area: general
files:
  - ~/bee-atlas-evaluator-design-note.md
  - data/beeatlas.duckdb
---

## Problem

A breadcrumb in beeatlas for an **adjacent, standalone project** — not beeatlas
pipeline work itself. The idea: a small Datalog evaluator (Racket) that ingests
facts from the atlas's SQLite/DuckDB database, runs declarative data-quality
rules to a fixed point, and emits a discrepancy report. The Python pipeline is
unchanged and remains the source of the database; the evaluator reads it at the
boundary and stays pure inside.

beeatlas.net's real data-quality needs are the **constructive constraints** that
focus the project's effort. Immediate checks named in the design note:
- duplicate sample IDs per collector per day
- observations outside the atlas state boundary
- bee/flower misclassification

Broader goal is hands-on learning of Datalog (bottom-up semi-naive evaluation,
stratified negation, first-class provenance) as a foundation for a larger
declarative-computing vision. Code is not expected to be long-lived; correctness
and clarity over performance.

Full design note (purpose, key commitments, what-it-is-not, tooling, references):
**~/bee-atlas-evaluator-design-note.md** (committed outside this repo).

## Solution

TBD — this is its own project with its own goals and lifecycle, tracked here only
as a pointer. When it's ready to start as a real effort, spin it up as a separate
project rather than a beeatlas milestone. If/when it produces discrepancy reports
that beeatlas should consume, that integration becomes the beeatlas-side task.

Related: existing [data-test-suite-environmental-deps] todo and the v4.8 "Fast,
Honest Test Suite" milestone both touch data-correctness confidence from a
different angle (test infra vs. declarative rule checks).
