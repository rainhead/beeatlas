---
id: 260514-f7c
title: dlt pipeline state housekeeping — audit
status: complete
date: 2026-05-14
decision: no-action
---

# Quick Task 260514-f7c — Summary

**Decision: no action needed.** Closing pending todo `dlt-pipeline-state-housekeeping.md`.

## Evidence

### Pipeline → dataset mapping (`data/*_pipeline.py`)

| Pipeline file | `pipeline_name` | `dataset_name` |
|---|---|---|
| `ecdysis_pipeline.py:181` | `ecdysis` | `ecdysis_data` |
| `inaturalist_pipeline.py:156` | `inaturalist` | `inaturalist_data` |
| `waba_pipeline.py:164` | `waba` | `inaturalist_waba_data` |
| `anti_entropy_pipeline.py:82` | `inaturalist` (shared) | `inaturalist_data` |
| `projects_pipeline.py:68` | `inaturalist` (shared) | `inaturalist_data` |

`geographies_pipeline.py` is documented as DuckDB-native but observed to also write a `_dlt_*` surface in both the `geographies` and `inaturalist_data` schemas — three rows total, untouched since 2026-04-10. Out of scope here.

### Growth observed (DuckDB at v3.4 close, 2026-05-14)

```
_dlt_pipeline_state row counts (per pipeline_name)
  ecdysis_data:          ecdysis = 2
  geographies:           geographies = 1
  inaturalist_data:      inaturalist = 14, geographies = 2
  inaturalist_waba_data: waba = 3

_dlt_loads row counts (per schema)
  ecdysis_data:          22
  inaturalist_data:      48
  inaturalist_waba_data:  8
  geographies:            6

_dlt_loads time range
  inaturalist_data: 2026-03-17 → 2026-05-14 (58 days; ~0.83 rows/day)
  ecdysis_data:     2026-03-17 → 2026-05-04 (~0.39 rows/day)
  inaturalist_waba_data: 2026-04-13 → 2026-05-04 (~0.38 rows/day)
```

Total `_dlt_*` row count across the database: **~106 rows over 58 days**.
DB file size: 111 MB. `_dlt_*` overhead: well under 1% of file size — the budget for "should we even care" is far from spent.

### Existing DELETE pattern is not housekeeping

`inaturalist_pipeline.py:173` and `waba_pipeline.py:179` `DELETE FROM _dlt_pipeline_state` only when the caller passes `full_reload=True` (a one-off CLI flag, not the nightly path). Their purpose is state reset before re-ingestion, not periodic pruning. The todo's framing of these as "housekeeping" is mistaken — they're not running on nightly.

### Why growth is bounded without intervention

- `_dlt_pipeline_state` is **versioned state**, not an append-only log. dlt writes a new row only when the pipeline state changes (e.g., cursor advances, schema migrates). Steady-state nightly runs without schema/cursor change add zero rows. The observed 14-row peak for `inaturalist` over 58 days reflects 3 pipelines (inat + projects + anti_entropy) sharing the name plus occasional state evolution — still trivial.
- `_dlt_loads` is append-only but at ~1 row/pipeline/day. Linear, slow, unbounded only in the textbook sense. 100 years × 5 pipelines × 365 days ≈ 180K rows × ~200 bytes = ~36 MB. Not a problem at any realistic horizon.

## Conclusion

The dlt metadata footprint in `data/beeatlas.duckdb` is bounded by dlt's own semantics. No uniform pruning helper is warranted; the existing `full_reload`-gated DELETEs in `inaturalist_pipeline.py:173` and `waba_pipeline.py:179` should be left in place since they serve a different (correct) purpose.

If the picture changes — e.g., `inaturalist_data._dlt_loads` crosses ~10K rows — revisit this audit; the cheap intervention then is a `DELETE FROM _dlt_loads WHERE inserted_at < now() - INTERVAL '180 days'` cron in `data/nightly.sh`, not per-pipeline code.

## Verification (must_haves)

1. ✅ Decision recorded with row-count evidence (this document).
2. — (No action taken, by decision.)
3. ✅ Todo retired (next commit).

## Commits

- `260514-f7c-PLAN.md` + `260514-f7c-SUMMARY.md` + todo move + STATE.md row (single docs commit).
