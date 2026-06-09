# Phase 137: Promotion into Occurrences - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 137-promotion-into-occurrences
**Areas presented:** Contract breadth, Suppression & exclusion enforcement, Phase 111 test retirement shape, geo_blob / occId encoding

---

## Outcome

The orchestrator scouted the phase's full code surface (the Phase 136 output models `int_checklist_collapsed` / `int_checklist_dedup_status`, `int_combined` ARMs, the enforced 33-column `marts/occurrences` contract, `sqlite_export._GEO_COLS`, `src/features.ts` `_buildGeoJSONFromRaw`, and the Phase 111 isolation test) and presented four implementation gray areas for selection.

**User response:** *"I don't have an opinion on any of these."* — all four areas delegated to Claude's discretion.

Because the phase is tightly constrained by (a) the ROADMAP's four success criteria and (b) the Phase 136 models' already-documented consumption contract (`int_checklist_dedup_status.sql` literally specifies the Phase 137 WHERE clause), the open areas resolve to grounded derived defaults rather than open vision choices. No further questioning was warranted.

---

## Areas Presented (all delegated to Claude)

| Area | Options presented | Resolution |
|------|-------------------|------------|
| Contract breadth (34 vs richer) | Only `checklist_id` (34 cols) / also surface `collapsed_count` + provenance | **D-05:** minimal — only `checklist_id`; defer `collapsed_count` to Phase 138 |
| Suppression & exclusion enforcement | Filter in ARM 4 promotion SELECT / upstream model; date precision handling | **D-01/D-02/D-06:** `WHERE dedup_status IS DISTINCT FROM 'confirmed'` + `lat/lon NOT NULL` in ARM 4; date built at available precision |
| Phase 111 test retirement shape | Pure positive flip / keep a raised ceiling guard too | **D-07:** keep re-baselined ceiling guard AND add positive `source='checklist'` assertion + v4.7 comment |
| geo_blob / occId encoding | Append `checklist_id` / insert; decode branch precedence | **D-08:** append `checklist_id` at index 7; append `checklist:<N>` decode branch; atomic commit + Vitest test |

**User's choice:** Delegated all four to Claude's discretion.
**Notes:** Defaults are grounded in the Phase 136 models and ROADMAP success criteria; planner retains flexibility on the exact re-baselined ceiling (D-07) and on surfacing `collapsed_count` early (D-05) if a concrete need appears.

---

## Claude's Discretion

All implementation areas (D-01 through D-08 in CONTEXT.md) — the user delegated every open decision. The non-negotiable constraints come from the success criteria, not the discussion: 34-column contract, `NULL::INTEGER` casts in ARMs 1–3, positive `source='checklist'` assertion + v4.7-reversal comment, and the single atomic `_GEO_COLS` ↔ `features.ts` commit.

## Deferred Ideas

- Per-source counts UI, detail card, and checklist point styling → Phase 138 (UIX-*).
- Surfacing `collapsed_count` into `occurrences.parquet` → Phase 138 if the detail card needs it.
- Richer checklist provenance (`verbatim_name`, `locality`, `family`, `date_quality`) in the contract → only if a downstream consumer needs it.
