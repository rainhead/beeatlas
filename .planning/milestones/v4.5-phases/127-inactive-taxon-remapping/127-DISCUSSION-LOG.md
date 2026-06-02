# Phase 127: Inactive Taxon Remapping - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 127-inactive-taxon-remapping
**Areas discussed:** Auto-remap storage & precedence, Block vs report on unresolvable, Multi/zero-synonym policy

---

## Gray-Area Selection

Presented four candidate areas; user selected three (skipped "Step placement & file lifecycle", delegated to Claude's discretion):

| Area | Description | Selected |
|------|-------------|----------|
| Auto-remap storage & precedence | Where generated remappings live; how manual wins | ✓ |
| Block vs report on unresolvable | Hard-fail vs report-and-continue on unresolvable inactives | ✓ |
| Multi/zero-synonym policy | How to treat 0/1/many successors; where target name comes from | ✓ |
| Step placement & file lifecycle | New STEP vs extend resolver; ordering vs taxa-download; CSV lifecycle | |

---

## Auto-remap storage & precedence

| Option | Description | Selected |
|--------|-------------|----------|
| Separate seed + dbt union model | Gitignored auto_synonyms.csv seed; int_synonyms model UNIONs manual + (auto ANTI JOIN manual ON synonym); repoint 3 refs. Precedence declarative in SQL. | ✓ |
| Filter-at-generation, single seed | Python drops auto entries colliding with manual; one combined seed; noisy git diffs / nightly churn on committed file. | |
| Separate seed, precedence in Python | Two seeds but generation excludes collisions before writing; dbt UNIONs with no anti-join. | |

**User's choice:** Separate seed + dbt union model
**Notes:** Manual-wins precedence keyed on the `synonym` (source) column per ITR-04. Flagged to planner: empty-header-seed fallback needed so `dbt seed` works in the current 0-inactive case (D-04).

---

## Block vs report on unresolvable

| Option | Description | Selected |
|--------|-------------|----------|
| Report and continue (non-blocking) | Write to inactive_unresolved.csv, warn, proceed; inactive taxon_id still non-null so D-01 holds. | |
| Hard-fail the build (blocking) | New inactive-gate exits non-zero until human adds a manual occurrence_synonyms.csv entry. | ✓ |
| Threshold: warn, fail if count grows | Non-blocking until count/occurrence-weight exceeds a tuned threshold. | |

**User's choice:** Hard-fail the build (blocking)
**Follow-up (no-successor escape hatch):**

| Option | Description | Selected |
|--------|-------------|----------|
| Manual synonym is the only exit | No override; human maps dead name to a current accepted name, or fixes source upstream. | ✓ |
| Acknowledged-exclusion set | KNOWN_NON_BEES-style list of reviewed inactives the gate tolerates. | |
| Decide later (flag to research) | Defer the no-successor wedge case. | |

**Notes:** Wedge risk (no-successor inactive permanently blocking nightly) explicitly accepted — cannot occur today (0 inactive taxa). Consistent with the project's contract-enforced-at-build culture and the Phase 126 resolution-gate precedent.

---

## Multi/zero-synonym policy

| Option | Description | Selected |
|--------|-------------|----------|
| 1=auto, 0/many=triage | One successor → auto-remap; zero or split → triage/block. Literal reading of ITR-01 ("a known current synonym", singular). | ✓ |
| 1=auto, 0=triage, many=first active | Auto-pick the single active successor of a split if exactly one is active. | |

**Target-name source:**

| Option | Description | Selected |
|--------|-------------|----------|
| taxa.csv.gz local lookup | Translate successor taxon_id → name via the already-downloaded dump; missing successor → triage. | ✓ |
| iNat API authoritative fetch | GET /v1/taxa/{successor_id} for the current name; +1 paced call, immune to staleness. | |

**User's choice:** 1=auto, 0/many=triage; taxa.csv.gz local lookup
**Notes:** No silent guessing on a genuine split. Auto-remap step already holds the successor's active taxon_id, so it upserts successor name→id directly into the bridge (no re-resolution round-trip).

---

## Claude's Discretion

- **Step placement & file lifecycle** (not selected): new `inactive-remap` + `inactive-gate` STEPs mirroring `resolve-taxon-ids`/`resolution-gate`; both CSVs gitignored + overwritten nightly; generation logic likely extends `resolve_taxon_ids.py`. Ordering vs `taxa-download` flagged as research dependency RD-01.

## Deferred Ideas

None — discussion stayed within phase scope.
