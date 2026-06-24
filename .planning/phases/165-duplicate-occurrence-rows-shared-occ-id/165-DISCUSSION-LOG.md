# Phase 165: Duplicate occurrence rows sharing one occ_id across int_combined source arms - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 165-duplicate-occurrence-rows-shared-occ-id
**Areas discussed:** Semantic model, Fix layer / approach, Column reconciliation, Regression guard (which reframed the whole phase into Domain/data-model documentation + correction)

---

## Semantic model

| Option | Description | Selected |
|--------|-------------|----------|
| One occurrence (collapse) | Same physical bee / same iNat record from two pipeline angles → one occurrence, one occ_id everywhere | ✓ |
| Two records, dedup display | Keep both rows; never render the same occ_id twice | |

**User's choice:** One occurrence (collapse).
**Notes:** Later qualified — once the model is corrected, the motivating collision shouldn't arise at all (it's a misfiled record, not a legitimate dual-arm occurrence).

---

## Fix layer / approach

| Option | Description | Selected |
|--------|-------------|----------|
| Data layer (int_combined) | Merge/correct upstream so the mart has one row per occ_id | ✓ |
| Query layer (every SELECT) | Add GROUP BY/DISTINCT occ_id to each filter.ts query (Phase 160 WR-01 pattern) | |
| You decide | Defer to research/planning | |

**User's choice:** Data layer (int_combined).
**Notes:** Fix the model upstream, not repeated dedup across ~6 query builders.

---

## Column reconciliation

Initial menu (is_provisional/source/taxon precedence) was **rejected** by the user
across two rounds. Key corrections that reshaped the phase:

- "This needs to be decided on a column-by-column basis." → No blanket winning-arm
  precedence; classify each column (mutually exclusive / derived / conflicting).
- "is_provisional is set exactly when an ecdysis record doesn't exist yet." →
  is_provisional is *derived*, not arm-picked.
- "is_provisional is intended to represent sample observations (of floral hosts)
  for which no records exist in ecdysis... Provisional records will never join
  with other sources by definition. It sounds like we need to document the domain
  model and data model more clearly." → Pivot to documentation + correction.
- "320276469 is not a provisional record, it's an inat observation that should
  match a record in ecdysis by label number." → The motivating duplicate is a
  *symptom of a failed catalog-number match*, not a legitimate two-arm occurrence.
- "provisional records will always be members of [WABA plant-images & sample-IDs
  iNat project]." → Canonical definition of provisional = project membership.

**User's choice:** Per-column classification (mutually exclusive → COALESCE;
derived → recompute; conflicting → explicit rule from real data). See CONTEXT D-08.

**Codebase findings that grounded the pivot:**
- ARM 2 / `int_provisional_waba_ids` keys on "WABA catalog-field obs not matched to
  Ecdysis" (bee specimens), NOT project membership — drift from intent (D-04).
- `data/waba_pipeline.py` defines "WABA" via `field:WABA=` (catalog field 18116).
- `data/projects_pipeline.py` already ingests project membership — D-03 is feasible.

---

## Regression guard

**User's choice:** Accepted (selected at area-selection time). Preferred form: a dbt
uniqueness assertion on occ_id at the mart layer (feasibility TBD by research). See
CONTEXT D-09.

---

## Scope & doc location (resolved conversationally)

- **Scope:** "document and correct" — redefine the provisional arm on project
  membership and fix the catalog-number match; not documentation-only.
- **Doc location:** "This model is important for humans to understand, not just
  LLMs, so maybe docs/domain-model.md, linked from CLAUDE.md?" → `docs/domain-model.md`,
  linked from `CLAUDE.md` (not an ADR, not buried in Domain Vocabulary).

## Claude's Discretion

- Exact dbt restructuring of the provisional arm (new int model vs. rework existing).
- Precise mechanics of the catalog-number match fix.

## Deferred Ideas

- Display-layer dedup (roadmap options a/b/c) — superseded by fixing the model; kept
  only as a fallback if a legitimate dual-arm case survives correction.
- "Same specimen, two different occ_ids" (ecdysis: vs inat_obs: for one physical bee)
  — adjacent, no collision, separate future question (relates to taxon_id milestone).
