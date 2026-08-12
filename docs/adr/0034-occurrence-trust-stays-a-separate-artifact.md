# 0034 — occurrence_trust stays a separate artifact

Date: 2026-08-12
Status: Accepted
Issues: beeatlas-nyr (shipped the artifact and reserved this decision),
beeatlas-vsrh/kmxs (consumers)

## Context

The trusted-taxon computation (ADR 0033, `int_trusted_taxon`) needed a
published home. beeatlas-nyr shipped it as `marts/occurrence_trust` →
`occurrence_trust.parquet`, keyed by `occ_id`, and deliberately deferred the
question of whether its columns should instead fold into `marts/occurrences` —
presenting that to Peter rather than assuming it.

## Decision

**`occurrence_trust` stays a separate artifact.** Trusted-taxon columns do not
fold into `marts/occurrences`.

- The occurrences contract stays untouched, so trust-model changes never
  trigger the documented release sequence (data-before-code +
  one-time SKIP_INTEGRATION_GATE) — the identification track can keep evolving
  (anomaly flags, iNat-arm growth, qualifier refinements) at nightly cadence.
- Trust is a *derived judgement over* occurrence records, not an observation
  about them; the separate key'd artifact keeps that provenance boundary
  visible. A missing row means "no trust computed", never distrust.
- Consumers join on `occ_id` (the shared synthetic identity —
  `occurrence_places` / `occIdFromRow` CASE priority) and qualify a record for
  query taxon T iff T ∈ `trusted_ancestor_or_self`.

How the CLIENT gets the data remains beeatlas-kmxs's decision
(`RUNTIME_ARTIFACTS` fetch vs an `occurrences.db` table via `sqlite_export`) —
either transport reads this artifact; neither reopens this record.

## Rejected alternative

**Fold `trusted_taxon`/`independent_id_count` columns into
`marts/occurrences`.** Buys one fewer join, at the price of hard-coupling
trust recomputation to the occurrence contract and its release dance. Can be
revisited if the join cost ever bites in practice; that revisit supersedes
this record explicitly rather than sneaking columns into the contract.
